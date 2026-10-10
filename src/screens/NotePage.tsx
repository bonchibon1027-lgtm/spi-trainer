import { Link, useParams } from 'react-router-dom'
import { getNote } from '../content'
import { getTopic, isTopicId } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { NoteView } from '../components/NoteView'
import { SAMPLE_NOTE } from '../components/figures/sampleNote'

// 解き方ノートのページ（#/note/<分野ID>）。#/note/sample は、図と見た目の確認用の見本。

function Hero({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="nt-hero">
      <p className="nt-kicker">{kicker}</p>
      <h1 className="nt-title">{title}</h1>
    </header>
  )
}

function SamplePage() {
  return (
    <div className="stack">
      <p className="crumb">
        <Link to="/topics">← 分野の一覧</Link>
      </p>
      <Hero kicker="解き方ノート（見本）" title="割合と比（見本）" />
      <NoteView note={SAMPLE_NOTE} />
    </div>
  )
}

export function NotePage() {
  const { id = '' } = useParams()
  if (id === 'sample') return <SamplePage />
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
  const topic = getTopic(id)
  const note = getNote(id)
  const canPractice = isTopicOpen(topic)

  return (
    <div className="stack">
      <p className="crumb">
        <Link to={`/topic/${id}`}>← {topic.name}</Link>
      </p>
      <Hero kicker="解き方ノート" title={topic.name} />
      <NoteView note={note} />
      {canPractice && (
        <Link to={`/drill/${id}`} className="btn btn-primary btn-block">
          この分野を練習する
        </Link>
      )}
    </div>
  )
}
