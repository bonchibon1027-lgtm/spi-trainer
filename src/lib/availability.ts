import type { TopicMeta } from '../types'
import { CURRENT_RELEASE } from '../data/topics'
import { hasQuestions } from './bank'

/** 今の公開段階に含まれ、出せる問題もある分野か。そうでなければ「近日追加」と表示する */
export function isTopicOpen(t: Pick<TopicMeta, 'id' | 'release'>): boolean {
  return t.release <= CURRENT_RELEASE && hasQuestions(t.id)
}
