import type { Question, TopicId } from '../types'
import { getTopic } from '../data/topics'
import { GENERATORS, generatorsFor, getGenerator } from '../generators'
import { makeGeneratedKey, parseGeneratedKey } from '../generators/common'
import { AUTHORED_QUESTIONS, authoredFor } from '../content'
import { createRng, randomSeed } from './rng'

// 問題を出す窓口。画面側はここだけを使う（generators / content を直接触らない）。

let importedQuestions: Question[] = []

/** 設定画面で取り込んだ問題を登録する（起動時と取り込み時に呼ぶ） */
export function setImportedQuestions(qs: Question[]): void {
  importedQuestions = qs
}

function staticPool(topic: TopicId): Question[] {
  return [...authoredFor(topic), ...importedQuestions.filter((q) => q.topic === topic)]
}

/** 分野で今出せる問題があるか */
export function hasQuestions(topic: TopicId): boolean {
  return generatorsFor(topic).length > 0 || staticPool(topic).length > 0
}

/**
 * ドリル用に n 問選ぶ。
 * - 生成問題の分野: 型をまんべんなく使い、新しい seed で作る。易しい型から並べる
 * - 作成問題の分野: まだ解いていない問題を優先し、足りなければ解いた問題から出す。
 *   組問題（同じ文章・前提につく問題）は1つのかたまりとして、まとめて番号順に出す。
 *   かたまりの途中で切らないので、n 問より少し多くなることがある
 */
export function drawForDrill(topic: TopicId, n: number, seenKeys: ReadonlySet<string>, seed = randomSeed()): Question[] {
  const rng = createRng(seed)
  if (getTopic(topic).kind === 'generated') {
    const gens = generatorsFor(topic)
    if (gens.length === 0) return []
    const order = rng.shuffle(gens)
    const picked = Array.from({ length: n }, (_, i) => order[i % order.length])
    return picked
      .map((g) => g.generate(rng.int(0, 2 ** 31 - 1)))
      .sort((a, b) => a.difficulty - b.difficulty)
  }
  const units = new Map<string, Question[]>()
  for (const q of staticPool(topic)) {
    const k = q.groupKey ?? q.key
    units.set(k, [...(units.get(k) ?? []), q])
  }
  const list = [...units.values()].map((u) => u.sort((a, b) => a.key.localeCompare(b.key)))
  const hasUnseen = (u: Question[]) => u.some((q) => !seenKeys.has(q.key))
  const ordered = [...rng.shuffle(list.filter(hasUnseen)), ...rng.shuffle(list.filter((u) => !hasUnseen(u)))]
  const out: Question[] = []
  for (const u of ordered) {
    if (out.length >= n) break
    out.push(...u)
  }
  return out
}

/** キーから問題を取り出す（復習・記録の表示用）。生成問題は seed から作り直す */
export function getQuestionByKey(key: string): Question | undefined {
  const parsed = parseGeneratedKey(key)
  if (parsed) return getGenerator(parsed.generatorId)?.generate(parsed.seed)
  return AUTHORED_QUESTIONS.find((q) => q.key === key) ?? importedQuestions.find((q) => q.key === key)
}

/** 同じ型で数字を変えた問題（復習の stage 1 以降で使う） */
export function freshVariant(generatorId: string, seed = randomSeed()): Question | undefined {
  return getGenerator(generatorId)?.generate(seed)
}

export { GENERATORS, makeGeneratedKey }
