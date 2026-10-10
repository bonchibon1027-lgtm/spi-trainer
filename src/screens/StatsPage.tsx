import { useMemo, useState } from 'react'
import { SECTION_LABEL, TOPICS } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { formatSec } from '../lib/date'
import {
  computeAllStats,
  overallStat,
  RECENT_N,
  SLOW_RATIO,
  STATUS_LABEL,
  STRONG_AT_LEAST,
  WEAK_BELOW,
  type TopicStat,
} from '../lib/stats'
import { useApp } from '../state/AppState'
import { Segmented, StatusChip } from '../components/Controls'
import { MockHistory } from '../components/MockHistory'
import type { Section, TopicMeta } from '../types'

export function StatsPage() {
  const { data } = useApp()
  const [section, setSection] = useState<Section>('nonverbal')
  const stats = useMemo(() => computeAllStats(data.attempts), [data.attempts])
  const overall = useMemo(() => overallStat(data.attempts), [data.attempts])
  const rows = TOPICS.filter((t) => t.section === section)

  return (
    <div className="stack">
      <h1 className="page-title">分析</h1>

      <section className="card" aria-label="全体の成績">
        <p className="card-label">全体</p>
        <dl className="stat-grid">
          <div>
            <dt>回答数</dt>
            <dd>{overall.attempts}問</dd>
          </div>
          <div>
            <dt>正答率</dt>
            <dd>{overall.accuracy === null ? '—' : `${Math.round(overall.accuracy * 100)}%`}</dd>
          </div>
        </dl>
        {overall.attempts === 0 && <p className="muted small">問題を解くと、ここに成績が出ます。</p>}
      </section>

      <MockHistory results={data.mockResults} />

      <Segmented
        label="科目"
        value={section}
        options={[
          { value: 'nonverbal', label: SECTION_LABEL.nonverbal },
          { value: 'verbal', label: SECTION_LABEL.verbal },
        ]}
        onChange={setSection}
      />

      <section aria-label="分野ごとの正答率">
        <p className="muted small chart-note">
          棒の長さは直近{RECENT_N}問の正答率です。縦線は {Math.round(WEAK_BELOW * 100)}%（これ未満は苦手）と{' '}
          {Math.round(STRONG_AT_LEAST * 100)}%（得意の目安）です。
        </p>
        <ul className="stat-list">
          {rows.map((t) => (
            <StatRow key={t.id} topic={t} stat={stats.get(t.id)!} open={isTopicOpen(t)} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function StatRow({ topic, stat, open }: { topic: TopicMeta; stat: TopicStat; open: boolean }) {
  if (!open) {
    return (
      <li className="stat-row is-closed">
        <div className="stat-head">
          <span className="stat-name">{topic.name}</span>
          <span className="chip chip-closed">近日追加</span>
        </div>
      </li>
    )
  }
  const acc = stat.recentAccuracy
  const slow = stat.recentAvgSec !== null && stat.recentAvgSec > stat.targetSec * SLOW_RATIO
  const label =
    acc === null
      ? `${topic.name}: ${STATUS_LABEL[stat.status]}`
      : `${topic.name}: 正答率${Math.round(acc * 100)}パーセント、${STATUS_LABEL[stat.status]}`
  return (
    <li className="stat-row">
      <div className="stat-head">
        <span className="stat-name">{topic.name}</span>
        <StatusChip status={stat.status} />
      </div>
      <div className="bar" role="img" aria-label={label}>
        {acc !== null && <div className={`bar-fill st-${stat.status}`} style={{ width: `${Math.round(acc * 100)}%` }} />}
        <span className="bar-mark" style={{ left: `${WEAK_BELOW * 100}%` }} />
        <span className="bar-mark" style={{ left: `${STRONG_AT_LEAST * 100}%` }} />
      </div>
      <p className="stat-meta">
        {acc === null ? (
          'まだ解いていません'
        ) : (
          <>
            正答率 <strong>{Math.round(acc * 100)}%</strong>（直近{stat.recentCount}問）・挑戦 {stat.attempts}問
          </>
        )}
      </p>
      <p className="stat-meta">
        平均 {stat.recentAvgSec === null ? '—' : formatSec(stat.recentAvgSec)} ／ 目安 {formatSec(stat.targetSec)}
        {slow && <span className="badge badge-warn">時間がかかっています</span>}
      </p>
    </li>
  )
}
