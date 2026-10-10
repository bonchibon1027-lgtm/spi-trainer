import { useMemo, useState } from 'react'
import { formatDateJa, formatSec, isoToDateStr } from '../lib/date'
import { lastMockResult, mockAccuracy, MOCK_SPECS, recentMockResults, type MockKind, type MockResult } from '../lib/mock'
import { Segmented } from './Controls'

// 分析画面の「模試の記録」。種類ごとに直近10回の正答率の推移（棒）と一覧。

const pct = (r: Pick<MockResult, 'total' | 'correct'>) => Math.round(mockAccuracy(r) * 100)

/** "10/9" */
function shortDate(iso: string): string {
  const d = isoToDateStr(iso)
  if (!d) return ''
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
}

export function MockHistory({ results }: { results: MockResult[] }) {
  const [kind, setKind] = useState<MockKind>(() => lastMockResult(results)?.kind ?? 'full')
  const recent = useMemo(() => recentMockResults(results, kind, 10), [results, kind])
  const newestFirst = useMemo(() => [...recent].reverse(), [recent])

  return (
    <section className="card" aria-label="模試の記録">
      <p className="card-label">模試の記録</p>
      <Segmented<MockKind>
        label="模試の種類"
        value={kind}
        options={[
          { value: 'full', label: '35分の模試' },
          { value: 'mini', label: '15分のミニ模試' },
        ]}
        onChange={setKind}
      />

      {recent.length === 0 ? (
        <p className="muted">{MOCK_SPECS[kind].label}は、まだ受けていません。</p>
      ) : (
        <>
          <p className="muted small">
            棒の長さと数字は、直近{recent.length}回の正答率（%）です。アプリ独自の目安で、本番の評価とは別物です。
          </p>
          <div
            className="mock-chart"
            role="img"
            aria-label={`正答率の推移: ${recent.map((r) => `${shortDate(r.at)} ${pct(r)}パーセント`).join('、')}`}
          >
            {recent.map((r) => (
              <div key={r.id} className="mock-col">
                <span className="mock-col-value">{pct(r)}</span>
                <span className="mock-col-area">
                  <span className="mock-col-bar" style={{ height: `${Math.max(2, pct(r))}%` }} />
                </span>
                <span className="mock-col-date">{shortDate(r.at)}</span>
              </div>
            ))}
          </div>

          <ul className="mock-history">
            {newestFirst.map((r) => {
              const d = isoToDateStr(r.at)
              return (
                <li key={r.id} className="mock-row">
                  <div className="mock-row-main">
                    <span>{d ? formatDateJa(d) : ''}</span>
                    <strong>{pct(r)}%</strong>
                  </div>
                  <p className="stat-meta">
                    {r.correct} / {r.total}問 正解（言語 {r.bySection.verbal.correct}/{r.bySection.verbal.total}・非言語{' '}
                    {r.bySection.nonverbal.correct}/{r.bySection.nonverbal.total}）
                  </p>
                  <p className="stat-meta">
                    時間切れ {r.timeouts}問・未回答 {r.unanswered}問・かかった時間 {formatSec(r.durationSec)}
                  </p>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
