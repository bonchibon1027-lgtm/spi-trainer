import { Link, useParams } from 'react-router-dom'
import { getNote } from '../content'
import { getTopic, isTopicId } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
import { NoteView } from '../components/NoteView'

export function NotePage() {
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
  const topic = getTopic(id)
  const note = getNote(id)
  const canPractice = isTopicOpen(topic)

  return (
    <div className="stack">
      <p className="crumb">
        <Link to={`/topic/${id}`}>← {topic.name}</Link>
      </p>
      <h1 className="page-title">{topic.name}の解き方ノート</h1>
      {note ? (
        <NoteView note={note} />
      ) : (
        <div className="card">
          <p className="muted">この分野のノートは準備中です。</p>
        </div>
      )}
      {canPractice && (
        <Link to={`/drill/${id}`} className="btn btn-primary btn-block">
          練習する
        </Link>
      )}
    </div>
  )
}
