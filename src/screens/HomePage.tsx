import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getNote } from '../content'
import { getTopic, releasedTopics } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { daysBetween, formatDateJa, todayStr } from '../lib/date'
import { countDueReviews } from '../lib/review'
import { bankSource } from '../lib/reviewSource'
import { computeAllStats, countToday, recommendNext } from '../lib/stats'
import { useApp } from '../state/AppState'

export function HomePage() {
  const { data } = useApp()
  const today = todayStr()

  const due = useMemo(() => countDueReviews(data.reviews, today, bankSource), [data.reviews, today])
  const todayCount = useMemo(() => countToday(data.attempts, today), [data.attempts, today])
  const rec = useMemo(() => {
    const stats = computeAllStats(data.attempts)
    const candidates = releasedTopics()
      .filter(isTopicOpen)
      .map((t) => ({ stat: stats.get(t.id)!, frequency: t.frequency }))
    return recommendNext(candidates, data.attempts.length)
    // 取り込んだ問題（importedQuestions）が変わると、出せる分野も変わる
  }, [data.attempts, data.importedQuestions])

  const exam = data.settings.examDate
  const left = exam ? daysBetween(today, exam) : null
  const recTopic = rec ? getTopic(rec.topic) : null

  return (
    <div className="stack">
      <h1 className="page-title">SPIトレーナー</h1>

      <section className="card exam-card" aria-label="受検日">
        {exam === undefined || left === null ? (
          <>
            <p className="card-label">受検日まで</p>
            <p className="muted">受検日を設定すると、ここに残り日数が出ます。</p>
            <Link to="/settings" className="btn btn-secondary">
              受検日を設定する
            </Link>
          </>
        ) : left > 0 ? (
          <>
            <p className="card-label">受検日まで</p>
            <p className="big-number">
              あと <strong>{left}</strong> 日
            </p>
            <p className="muted">{formatDateJa(exam)}</p>
          </>
        ) : left === 0 ? (
          <>
            <p className="card-label">受検日</p>
            <p className="big-number">今日です。がんばって！</p>
          </>
        ) : (
          <>
            <p className="card-label">受検日</p>
            <p className="muted">設定した受検日（{formatDateJa(exam)}）は過ぎました。</p>
            <Link to="/settings" className="btn btn-secondary">
              受検日を変える
            </Link>
          </>
        )}
      </section>

      <section className="card" aria-label="今日の復習">
        <p className="card-label">今日の復習</p>
        {due > 0 ? (
          <>
            <p className="big-number">
              <strong>{due}</strong> 問
            </p>
            <Link to="/review?go=1" className="btn btn-primary btn-block">
              復習をはじめる
            </Link>
          </>
        ) : (
          <p className="muted">今日の復習はありません。</p>
        )}
      </section>

      {rec && recTopic && (
        <section className="card" aria-label="おすすめ">
          <p className="card-label">次におすすめの分野</p>
          <p className="rec-name">{recTopic.name}</p>
          <p className="muted">{rec.reason}</p>
          <div className="row-actions">
            {getNote(rec.topic) ? (
              <Link to={`/note/${rec.topic}`} className="btn btn-secondary">
                ノートを読む
              </Link>
            ) : (
              <button type="button" className="btn btn-secondary" disabled>
                ノート準備中
              </button>
            )}
            <Link to={`/drill/${rec.topic}`} className="btn btn-primary btn-grow">
              練習する
            </Link>
          </div>
        </section>
      )}

      <section className="card" aria-label="今日の学習">
        <p className="card-label">今日解いた問題</p>
        <p className="big-number">
          <strong>{todayCount}</strong> 問
        </p>
      </section>

      <section className="card is-disabled" aria-label="模試">
        <p className="card-label">本番形式の模試</p>
        <p className="muted">v1.0で追加予定です。</p>
        <button type="button" className="btn btn-secondary" disabled>
          準備中
        </button>
      </section>

      <p className="disclaimer">
        SPIは株式会社リクルートの登録商標です。本アプリは個人が作った非公式の練習アプリです。
      </p>
    </div>
  )
}
