import type { Section, TopicId, TopicMeta } from '../types'

// 分野の一覧。並び順がそのまま画面の並び順になる。
// targetSec はアプリ独自の目安（本番の制限時間そのものではない）。
export const TOPICS: TopicMeta[] = [
  // ---- 非言語 ----
  { id: 'nv-basics', section: 'nonverbal', name: '計算の基礎', frequency: 1, targetSec: 45, kind: 'generated', release: 1 },
  { id: 'nv-inference', section: 'nonverbal', name: '推論', frequency: 3, targetSec: 120, kind: 'authored', release: 1 },
  { id: 'nv-ratio', section: 'nonverbal', name: '割合と比', frequency: 3, targetSec: 60, kind: 'generated', release: 1 },
  { id: 'nv-profit', section: 'nonverbal', name: '損益算', frequency: 3, targetSec: 75, kind: 'generated', release: 1 },
  { id: 'nv-speed', section: 'nonverbal', name: '速さ', frequency: 2, targetSec: 90, kind: 'generated', release: 1 },
  { id: 'nv-combination', section: 'nonverbal', name: '場合の数', frequency: 3, targetSec: 75, kind: 'generated', release: 1 },
  { id: 'nv-probability', section: 'nonverbal', name: '確率', frequency: 3, targetSec: 75, kind: 'generated', release: 1 },
  { id: 'nv-sets', section: 'nonverbal', name: '集合', frequency: 2, targetSec: 75, kind: 'generated', release: 1 },
  { id: 'nv-discount', section: 'nonverbal', name: '料金の割引', frequency: 2, targetSec: 75, kind: 'generated', release: 2 },
  { id: 'nv-installment', section: 'nonverbal', name: '分割払い', frequency: 2, targetSec: 75, kind: 'generated', release: 2 },
  { id: 'nv-settlement', section: 'nonverbal', name: '代金の精算', frequency: 2, targetSec: 75, kind: 'generated', release: 2 },
  { id: 'nv-table', section: 'nonverbal', name: '表の読み取り', frequency: 3, targetSec: 90, kind: 'generated', release: 2 },
  // ---- 言語 ----
  { id: 'vb-relation', section: 'verbal', name: '二語の関係', frequency: 3, targetSec: 25, kind: 'authored', release: 1 },
  { id: 'vb-meaning', section: 'verbal', name: '語句の意味', frequency: 3, targetSec: 25, kind: 'authored', release: 1 },
  { id: 'vb-usage', section: 'verbal', name: '語句の用法', frequency: 2, targetSec: 30, kind: 'authored', release: 2 },
  { id: 'vb-order', section: 'verbal', name: '文の並べ替え', frequency: 2, targetSec: 60, kind: 'authored', release: 2 },
  { id: 'vb-blank', section: 'verbal', name: '空欄補充', frequency: 2, targetSec: 45, kind: 'authored', release: 2 },
  { id: 'vb-reading', section: 'verbal', name: '長文読解', frequency: 2, targetSec: 60, kind: 'authored', release: 2 },
]

/** 今の公開段階。2回目の公開（v1.0）で 2 にする */
export const CURRENT_RELEASE: 1 | 2 = 2

const byId = new Map(TOPICS.map((t) => [t.id, t]))

export function getTopic(id: TopicId): TopicMeta {
  const t = byId.get(id)
  if (!t) throw new Error(`unknown topic: ${id}`)
  return t
}

export function isTopicId(id: string): id is TopicId {
  return byId.has(id as TopicId)
}

/** 公開済みの分野だけを返す */
export function releasedTopics(section?: Section): TopicMeta[] {
  return TOPICS.filter((t) => t.release <= CURRENT_RELEASE && (!section || t.section === section))
}

export const SECTION_LABEL: Record<Section, string> = {
  nonverbal: '非言語',
  verbal: '言語',
}
