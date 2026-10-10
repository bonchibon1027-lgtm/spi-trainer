import type { Generator, TopicId } from '../types'
import basics from './basics'
import ratio from './ratio'
import profit from './profit'
import speed from './speed'
import combination from './combination'
import probability from './probability'
import sets from './sets'
import discount from './discount'
import installment from './installment'
import settlement from './settlement'
import table from './table'

export const GENERATORS: Generator[] = [
  ...basics,
  ...ratio,
  ...profit,
  ...speed,
  ...combination,
  ...probability,
  ...sets,
  // v1.0
  ...discount,
  ...installment,
  ...settlement,
  ...table,
]

const byId = new Map(GENERATORS.map((g) => [g.id, g]))

export function getGenerator(id: string): Generator | undefined {
  return byId.get(id)
}

export function generatorsFor(topic: TopicId): Generator[] {
  return GENERATORS.filter((g) => g.topic === topic)
}
