import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getNote } from '../content'
import { getTopic, isTopicId, SECTION_LABEL } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { GENERATORS } from '../lib/bank'
import { formatSec } from '../lib/date'
import { computeTopicStat } from '../lib/stats'
import { useApp } from '../state/AppState'
import { Segmented, StatusChip } from '../components/Controls'
import type { TopicId } from '../types'

const DIFFICULTY_LABEL = { 1: 'やさしい', 2: 'ふつう', 3: 'むずかしい' } as const

export function TopicPage() {
  const { id = '' } = useParams()
  if (!isTopicId(id)) return <Missing />
  return <TopicBody id={id} />
}

function Missing() {
  return (
    <div className="stack">
      <h1 className="page-title">分野が見つかりません</h1>
      <Link to="/topics" className="btn btn-primary">
        分野の一覧へ
      </Link>
    </div>
  )
}

function TopicBody({ id }: { id: TopicId }) {
  const { data } = useApp()
  const topic = getTopic(id)
  const open = isTopicOpen(topic)
  const stat = useMemo(() => computeTopicStat(topic, data.attempts), [topic, data.attempts])
  const [size, setSize] = useState<5 | 10>(data.settings.drillSize)
  const gens = GENERATORS.filter((g) => g.topic === id)
  const note = getNote(id)

  return (
    <div className="stack">
      <p className="crumb">
        <Link to={`/topics${topic.section === 'verbal' ? '?s=verbal' : ''}`}>← 分野の一覧</Link>
      </p>
      <h1 className="page-title">
        {topic.name} <span className="muted small">{SECTION_LABEL[topic.section]}</span>
      </h1>

      {!open ? (
        <div className="card">
          <p className="card-label">近日追加</p>
          <p className="muted">この分野は準備中です。公開までお待ちください。</p>
        </div>
      ) : (
        <>
          <section className="card" aria-label="成績">
            <div className="card-head">
              <p className="card-label">成績</p>
              <StatusChip status={stat.status} />
            </div>
            <dl className="stat-grid">
              <div>
                <dt>挑戦数</dt>
                <dd>{stat.attempts}問</dd>
              </div>
              <div>
                <dt>直近{stat.recentCount > 0 ? stat.recentCount : 20}問の正答率</dt>
                <dd>{stat.recentAccuracy === null ? '—' : `${Math.round(stat.recentAccuracy * 100)}%`}</dd>
              </div>
              <div>
                <dt>平均時間</dt>
                <dd>{stat.recentAvgSec === null ? '—' : formatSec(stat.recentAvgSec)}</dd>
              </div>
              <div>
                <dt>目安時間</dt>
                <dd>{formatSec(topic.targetSec)}</dd>
              </div>
            </dl>
          </section>

          <section className="card" aria-label="学ぶ・練習する">
            {note ? (
              <Link to={`/note/${id}`} className="btn btn-secondary btn-block">
                解き方ノートを読む
              </Link>
            ) : (
              <button type="button" className="btn btn-secondary btn-block" disabled>
                解き方ノートは準備中です
              </button>
            )}
            <div className="size-row">
              <span className="field-label">1回の問題数</span>
              <Segmented
                label="1回の問題数"
                value={size}
                options={[
                  { value: 5, label: '5問' },
                  { value: 10, label: '10問' },
                ]}
                onChange={setSize}
              />
            </div>
            <Link to={`/drill/${id}?n=${size}`} className="btn btn-primary btn-block">
              練習する（{size}問）
            </Link>
          </section>

          {gens.length > 0 && (
            <section className="card" aria-label="問題の型">
              <p className="card-label">出る問題の型</p>
              <ul className="gen-list">
                {gens.map((g) => (
                  <li key={g.id}>
                    <span>{g.label}</span>
                    <span className="chip chip-plain">{DIFFICULTY_LABEL[g.difficulty]}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">練習するたびに数字が変わる問題が出ます。</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
