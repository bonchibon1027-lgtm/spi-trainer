import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SECTION_LABEL, TOPICS } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { computeAllStats } from '../lib/stats'
import { useApp } from '../state/AppState'
import { Segmented, StatusChip } from '../components/Controls'
import type { Section } from '../types'

export function TopicsPage() {
  const { data } = useApp()
  const [params, setParams] = useSearchParams()
  const section: Section = params.get('s') === 'verbal' ? 'verbal' : 'nonverbal'
  const stats = useMemo(() => computeAllStats(data.attempts), [data.attempts])
  const topics = TOPICS.filter((t) => t.section === section)

  return (
    <div className="stack">
      <h1 className="page-title">分野</h1>
      <Segmented
        label="科目"
        value={section}
        options={[
          { value: 'nonverbal', label: SECTION_LABEL.nonverbal },
          { value: 'verbal', label: SECTION_LABEL.verbal },
        ]}
        onChange={(v) => setParams({ s: v }, { replace: true })}
      />

      <ul className="topic-list">
        {topics.map((t) => {
          const open = isTopicOpen(t)
          const s = stats.get(t.id)!
          if (!open) {
            return (
              <li key={t.id}>
                <div className="topic-card is-closed" aria-disabled="true">
                  <div className="topic-main">
                    <span className="topic-name">{t.name}</span>
                    <span className="chip chip-closed">近日追加</span>
                  </div>
                </div>
              </li>
            )
          }
          return (
            <li key={t.id}>
              <Link to={`/topic/${t.id}`} className="topic-card">
                <div className="topic-main">
                  <span className="topic-name">{t.name}</span>
                  <StatusChip status={s.status} />
                </div>
                <div className="topic-sub">
                  {s.recentAccuracy === null ? (
                    <span>まだ解いていません</span>
                  ) : (
                    <span>
                      正答率 {Math.round(s.recentAccuracy * 100)}%（直近{s.recentCount}問）・挑戦 {s.attempts}問
                    </span>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
