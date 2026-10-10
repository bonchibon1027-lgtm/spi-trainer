import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Segmented } from '../components/Controls'
import { MockSession } from '../components/MockSession'
import { formatDateJa, isoToDateStr } from '../lib/date'
import { lastMockResult, mockAccuracy, MOCK_SPECS, nominalCounts, type MockBuild, type MockKind } from '../lib/mock'
import { tryBuildMock } from '../lib/mockSource'
import { randomSeed } from '../lib/rng'
import { useApp } from '../state/AppState'

// 本番形式の模試: 開始画面 → 実施 → 結果。途中の状態は保存しない（アプリを閉じたら中断）。

const RULES = [
  '電卓は使えません。紙と鉛筆を用意してください。',
  '1問ごとに制限時間があります。時間が切れると、答えていなくても次の問題へ進みます（不正解になります）。',
  '前の問題には戻れません。答えを選んで「次へ」を押します。',
  '正解や解説は、終わってから見られます。ヒントはありません。',
  '途中でやめたり、アプリを閉じたりすると、その模試は中断され、記録されません。',
  '画面が消えにくいよう設定しますが、充電しながら、静かな場所で始めると安心です。',
]

export function MockPage() {
  const { data } = useApp()
  const [params] = useSearchParams()
  const [kind, setKind] = useState<MockKind>(() => (params.get('k') === 'mini' ? 'mini' : 'full'))
  const [started, setStarted] = useState<{ id: number; build: MockBuild } | null>(null)
  const [failed, setFailed] = useState(false)
  const spec = MOCK_SPECS[kind]

  // 作成問題は、まだ解いていない問題を優先して出す
  const seen = useMemo(() => new Set(data.attempts.map((a) => a.questionKey)), [data.attempts])
  // 画面に出す問題数の確認用（実際の問題は「はじめる」を押したときに新しい seed で選ぶ）。
  // 取り込んだ問題（importedQuestions）が変わると、出せる問題も変わる
  const preview = useMemo(() => tryBuildMock(kind, seen, 1), [kind, seen, data.importedQuestions])
  const last = useMemo(() => lastMockResult(data.mockResults, kind), [data.mockResults, kind])
  const nominal = nominalCounts(kind)

  if (started) {
    return (
      <MockSession
        key={started.id}
        build={started.build}
        onExit={() => setStarted(null)}
        finishActions={
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setStarted(null)}>
              もう一度（種類を選ぶ）
            </button>
            <Link to="/stats" className="btn btn-secondary btn-block">
              分析で模試の記録を見る
            </Link>
            <Link to="/" className="btn btn-ghost btn-block">
              ホーム
            </Link>
          </>
        }
      />
    )
  }

  const start = () => {
    const build = tryBuildMock(kind, seen, randomSeed())
    if (!build) {
      setFailed(true)
      return
    }
    setFailed(false)
    setStarted({ id: Date.now(), build })
  }

  const lastDate = last ? isoToDateStr(last.at) : null

  return (
    <div className="stack">
      <h1 className="page-title">本番形式の模試</h1>
      <p className="muted">本番のテストセンターに近い形で、時間を計って解きます。</p>

      <Segmented<MockKind>
        label="模試の種類"
        value={kind}
        options={[
          { value: 'full', label: '35分の模試' },
          { value: 'mini', label: '15分のミニ模試' },
        ]}
        onChange={(k) => {
          setKind(k)
          setFailed(false)
        }}
      />

      <section className="card" aria-label="この模試の内容">
        <h2 className="card-title">
          {spec.label}（{spec.minutes}分）
        </h2>
        {preview ? (
          <p>
            言語 <strong>{preview.verbalCount}問</strong> → 非言語 <strong>{preview.nonverbalCount}問</strong> の順に出ます。
          </p>
        ) : (
          <p className="muted">いま出せる問題がありません。</p>
        )}
        <p className="muted small">
          {kind === 'full'
            ? '言語を全部終えてから、非言語に進みます。文章や表を使う「組問題」も出ます。'
            : '毎日の確認用の短い模試です。言語のあと、非言語に進みます。'}
        </p>
        {preview && preview.questions.length < nominal.total && (
          <p className="muted small">公開されている問題が少ないため、問題数は目安（{nominal.total}問）より少なくなります。</p>
        )}
        {last && lastDate && (
          <p className="muted small">
            前回（{formatDateJa(lastDate)}）: 正答率 {Math.round(mockAccuracy(last) * 100)}%
          </p>
        )}
      </section>

      <section className="card" aria-label="はじめる前に">
        <h2 className="card-title">はじめる前に</h2>
        <ul className="mock-rules">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      {failed && <p className="msg msg-error">問題を用意できませんでした。もう一度お試しください。</p>}

      <button type="button" className="btn btn-primary btn-block" disabled={!preview} onClick={start}>
        はじめる
      </button>
    </div>
  )
}
