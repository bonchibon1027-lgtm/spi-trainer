import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getTopic } from '../data/topics'
import { formatDateJa, todayStr } from '../lib/date'
import { buildReviewQueue, countDueReviews, STAGE_LABEL } from '../lib/review'
import { bankSource } from '../lib/reviewSource'
import { useApp } from '../state/AppState'
import { PracticeSession, type SessionItem } from '../components/PracticeSession'
import type { TopicId } from '../types'

export function ReviewPage() {
  const { data } = useApp()
  const [params, setParams] = useSearchParams()
  const today = todayStr()
  const [run, setRun] = useState(0)

  const start = (): SessionItem[] | null => {
    const queue = buildReviewQueue(data.reviews, today, bankSource)
    return queue.length ? queue.map((x) => ({ question: x.question, reviewKey: x.item.questionKey })) : null
  }
  // ホームの「復習をはじめる」から来たときは、すぐ始める
  const [items, setItems] = useState<SessionItem[] | null>(() => (params.get('go') ? start() : null))

  useEffect(() => {
    // 開始用の ?go=1 を消す（戻る・再読み込みで二重に始まらないように）。最初の1回だけ
    if (params.get('go')) setParams({}, { replace: true })
  }, [])

  const due = useMemo(() => countDueReviews(data.reviews, today, bankSource), [data.reviews, today])
  const upcoming = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data.reviews) {
      if (r.dueDate > today) m.set(r.dueDate, (m.get(r.dueDate) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.reviews, today])
  const byTopic = useMemo(() => {
    const m = new Map<TopicId, number>()
    for (const r of data.reviews) m.set(r.topic, (m.get(r.topic) ?? 0) + 1)
    return [...m.entries()]
  }, [data.reviews])

  if (items) {
    return (
      <PracticeSession
        key={run}
        title="今日の復習"
        mode="review"
        items={items}
        onExit={() => setItems(null)}
        finishActions={
          <>
            <Link to="/" className="btn btn-primary btn-block">
              ホーム
            </Link>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                setItems(null)
                setRun((r) => r + 1)
              }}
            >
              復習の一覧へ
            </button>
          </>
        }
      />
    )
  }

  return (
    <div className="stack">
      <h1 className="page-title">復習</h1>

      <section className="card" aria-label="今日の復習">
        <p className="card-label">今日の復習</p>
        {due > 0 ? (
          <>
            <p className="big-number">
              <strong>{due}</strong> 問
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                setRun((r) => r + 1)
                setItems(start())
              }}
            >
              復習をはじめる
            </button>
          </>
        ) : (
          <p className="muted">今日の復習はありません。</p>
        )}
      </section>

      <section className="card" aria-label="復習のしくみ">
        <p className="card-label">復習のしくみ</p>
        <p className="muted">
          間違えた問題、ヒントを使った問題、目安の2倍より時間がかかった問題は、翌日 → 3日後 → 7日後の順にもう一度出ます。
          正解できると次の間隔へ進み、7日後も正解できたら卒業です。
        </p>
      </section>

      <section className="card" aria-label="復習の予定">
        <p className="card-label">復習の予定（登録中 {data.reviews.length}問）</p>
        {data.reviews.length === 0 ? (
          <p className="muted">まだ登録された問題はありません。</p>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <ul className="plain-list">
                {upcoming.map(([date, n]) => (
                  <li key={date}>
                    <span>{formatDateJa(date)}</span>
                    <span>{n}問</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">明日以降の予定はありません。</p>
            )}
            <p className="muted small">
              分野別:{' '}
              {byTopic.map(([t, n], i) => (
                <span key={t}>
                  {i > 0 && '、'}
                  {getTopic(t).name} {n}問
                </span>
              ))}
            </p>
            <p className="muted small">
              {([0, 1, 2] as const).map((s, i) => (
                <span key={s}>
                  {i > 0 && ' ／ '}
                  {STAGE_LABEL[s]} {data.reviews.filter((r) => r.stage === s).length}問
                </span>
              ))}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
