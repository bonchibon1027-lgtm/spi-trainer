import type { AuthoredQuestion, Note, Question, TopicId } from '../types'
import { getTopic, isTopicId } from '../data/topics'

// 作成問題（questions/<topic>.json）と解き方ノート（notes/<topic>.json）の読み込み。
// ファイルを置くだけで読み込まれる。

const questionModules = import.meta.glob<{ default: AuthoredQuestion[] }>('./questions/*.json', { eager: true })
const noteModules = import.meta.glob<{ default: Note }>('./notes/*.json', { eager: true })

/** ファイルの形から、アプリ内で使う Question に直す（足りない項目を分野情報から補う） */
export function normalizeAuthored(q: AuthoredQuestion, source: 'authored' | 'imported' = 'authored'): Question {
  if (!isTopicId(q.topic)) throw new Error(`unknown topic: ${q.topic}`)
  const t = getTopic(q.topic)
  return {
    ...q,
    testType: 'spi',
    section: t.section,
    source,
    targetSec: q.targetSec ?? t.targetSec,
  }
}

/** ファイル名（拡張子なし）→ 中身 */
export const questionFiles: Record<string, AuthoredQuestion[]> = Object.fromEntries(
  Object.entries(questionModules).map(([path, m]) => [fileBase(path), m.default]),
)

export const noteFiles: Record<string, Note> = Object.fromEntries(
  Object.entries(noteModules).map(([path, m]) => [fileBase(path), m.default]),
)

export const AUTHORED_QUESTIONS: Question[] = Object.values(questionFiles)
  .flat()
  .map((q) => normalizeAuthored(q))

export function authoredFor(topic: TopicId): Question[] {
  return AUTHORED_QUESTIONS.filter((q) => q.topic === topic)
}

export function getNote(topic: TopicId): Note | undefined {
  return noteFiles[topic]
}

function fileBase(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.json$/, '')
}
