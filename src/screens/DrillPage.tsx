import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getTopic, isTopicId } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { drawForDrill } from '../lib/bank'
import { useApp } from '../state/AppState'
import { PracticeSession, type SessionItem } from '../components/PracticeSession'
import type { TopicId } from '../types'

export function DrillPage() {
  const { id = '' } = useParams()
  if (!isTopicId(id)) {
    return (
      <div className="stack">
        <h1 className="page-title">分野が見つかりません</h1>
        <Link to="/topics" className="btn btn-primary">
          分野の一覧へ
        </Link>
      </div>
    )
  }
  return <DrillBody id={id} />
}

function DrillBody({ id }: { id: TopicId }) {
  const { data } = useApp()
  const [params] = useSearchParams()
  const [run, setRun] = useState(0)
  const topic = getTopic(id)
  const nParam = Number(params.get('n'))
  const n = nParam === 5 || nParam === 10 ? nParam : data.settings.drillSize

  if (!isTopicOpen(topic)) {
    return (
      <div className="stack">
        <h1 className="page-title">{topic.name}</h1>
        <div className="card">
          <p className="card-label">近日追加</p>
          <p className="muted">この分野の問題は準備中です。</p>
        </div>
        <Link to="/topics" className="btn btn-primary">
          分野の一覧へ
        </Link>
      </div>
    )
  }
  // run が変わると作り直す（「もう一度」）
  return <DrillRun key={run} id={id} n={n} onAgain={() => setRun((r) => r + 1)} />
}

function DrillRun({ id, n, onAgain }: { id: TopicId; n: number; onAgain: () => void }) {
  const { data } = useApp()
  const navigate = useNavigate()
  const topic = getTopic(id)
  // 問題は開始時に1回だけ選ぶ（回答を記録しても入れ替わらないように）
  const [items] = useState<SessionItem[]>(() => {
    const seen = new Set(data.attempts.filter((a) => a.topic === id).map((a) => a.questionKey))
    // 生成の途中で例外が出る seed があっても、引き直して続ける（毎回違う seed で選び直す）
    let lastError: unknown
    for (let i = 0; i < 5; i++) {
      try {
        return drawForDrill(id, n, seen).map((question) => ({ question }))
      } catch (e) {
        lastError = e
      }
    }
    throw lastError
  })

  if (items.length === 0) {
    return (
      <div className="stack">
        <h1 className="page-title">{topic.name}</h1>
        <div className="card">
          <p className="muted">この分野の問題は準備中です。</p>
        </div>
        <Link to="/topics" className="btn btn-primary">
          分野の一覧へ
        </Link>
      </div>
    )
  }

  return (
    <PracticeSession
      title={topic.name}
      mode="drill"
      items={items}
      onExit={() => navigate(`/topic/${id}`, { replace: true })}
      finishActions={
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onAgain}>
            もう一度
          </button>
          <Link to={`/topic/${id}`} className="btn btn-secondary btn-block">
            分野へ戻る
          </Link>
          <Link to="/" className="btn btn-ghost btn-block">
            ホーム
          </Link>
        </>
      }
    />
  )
}
