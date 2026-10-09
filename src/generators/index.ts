import type { Generator, TopicId } from '../types'
import basics from './basics'
import ratio from './ratio'
import profit from './profit'
import speed from './speed'
import combination from './combination'
import probability from './probability'
import sets from './sets'

// 2回目の公開（v1.0）で discount / installment / settlement / table を足す
export const GENERATORS: Generator[] = [
  ...basics,
  ...ratio,
  ...profit,
  ...speed,
  ...combination,
  ...probability,
  ...sets,
]

const byId = new Map(GENERATORS.map((g) => [g.id, g]))

export function getGenerator(id: string): Generator | undefined {
  return byId.get(id)
}

export function generatorsFor(topic: TopicId): Generator[] {
  return GENERATORS.filter((g) => g.topic === topic)
}
