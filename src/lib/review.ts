import type { Question, ReviewItem, TopicId } from '../types'
import { addDays } from './date'

// 間違えた問題の自動復習（純粋関数）。
// 間隔: 翌日（stage 0）→ 3日後（stage 1）→ 7日後（stage 2）→ 卒業

/** stage ごとの「次に出すまでの日数」。stage 0 に入るときは翌日、stage 1 に上がるときは3日後… */
export const STAGE_INTERVAL_DAYS = { 0: 1, 1: 3, 2: 7 } as const

export const STAGE_LABEL: Record<ReviewItem['stage'], string> = {
  0: '1回目の復習',
  1: '2回目の復習',
  2: '3回目の復習',
}

/** 解答時間が目安の何倍を超えたら「要復習」にするか */
export const SLOW_FACTOR = 2

/** 1問の結果（ドリル・復習・模試で共通） */
export type AnswerResult = {
  questionKey: string
  topic: TopicId
  generatorId?: string
  targetSec: number
  correct: boolean
  usedHint: boolean
  timeMs: number
}

export function resultFromQuestion(
  q: Pick<Question, 'key' | 'topic' | 'generatorId' | 'targetSec'>,
  outcome: { correct: boolean; usedHint: boolean; timeMs: number },
): AnswerResult {
  return {
    questionKey: q.key,
    topic: q.topic,
    generatorId: q.generatorId,
    targetSec: q.targetSec,
    ...outcome,
  }
}

/** 要復習か: 不正解、またはヒント使用、または 解答時間 > 目安 × 2 */
export function needsReview(r: Pick<AnswerResult, 'correct' | 'usedHint' | 'timeMs' | 'targetSec'>): boolean {
  return !r.correct || r.usedHint || r.timeMs > r.targetSec * 1000 * SLOW_FACTOR
}

/**
 * ドリル・模試の結果を復習リストに反映する。
 * - 要復習: stage 0・期限は翌日で追加（既にあれば stage 0・翌日に戻す）
 * - 要復習でない: 何も変えない
 */
export function applyPracticeResult(reviews: ReviewItem[], r: AnswerResult, today: string, nowIso: string): ReviewItem[] {
  if (!needsReview(r)) return reviews
  const dueDate = addDays(today, STAGE_INTERVAL_DAYS[0])
  const existing = reviews.find((x) => x.questionKey === r.questionKey)
  if (existing) {
    return reviews.map((x) => (x === existing ? { ...x, stage: 0 as const, dueDate } : x))
  }
  const item: ReviewItem = { questionKey: r.questionKey, topic: r.topic, stage: 0, dueDate, addedAt: nowIso }
  if (r.generatorId) item.generatorId = r.generatorId
  return [...reviews, item]
}

/**
 * 復習で解いた結果を反映する。
 * itemKey は復習リストの項目のキー（stage 1 以降は新しい seed の問題を出すので、解いた問題のキーとは別）。
 * - 要復習でない: stage 0→1（3日後）、1→2（7日後）、2→卒業（リストから削除）
 * - 要復習: stage 0・翌日
 */
export function applyReviewResult(
  reviews: ReviewItem[],
  itemKey: string,
  r: Pick<AnswerResult, 'correct' | 'usedHint' | 'timeMs' | 'targetSec'>,
  today: string,
): ReviewItem[] {
  const item = reviews.find((x) => x.questionKey === itemKey)
  if (!item) return reviews
  if (needsReview(r)) {
    return reviews.map((x) => (x === item ? { ...x, stage: 0 as const, dueDate: addDays(today, STAGE_INTERVAL_DAYS[0]) } : x))
  }
  if (item.stage === 2) return reviews.filter((x) => x !== item)
  const next = (item.stage + 1) as 1 | 2
  return reviews.map((x) => (x === item ? { ...x, stage: next, dueDate: addDays(today, STAGE_INTERVAL_DAYS[next]) } : x))
}

/** 期限が今日以前のもの（古い順） */
export function dueReviews(reviews: ReviewItem[], today: string): ReviewItem[] {
  return reviews
    .filter((r) => r.dueDate <= today)
    .sort((a, b) => (a.dueDate === b.dueDate ? a.addedAt.localeCompare(b.addedAt) : a.dueDate.localeCompare(b.dueDate)))
}

/** 問題の取り出し口（bank.ts の関数を渡す。テストでは差し替える） */
export type QuestionSource = {
  getQuestionByKey: (key: string) => Question | undefined
  freshVariant: (generatorId: string, seed?: number) => Question | undefined
}

/**
 * 復習で出す問題を決める。
 * - stage 0: 同じ問題（getQuestionByKey）
 * - stage 1 以降で generatorId がある: 同じ型で数字を変えた問題（freshVariant）
 * - 作成問題は常に同じ問題
 * 見つからなければ undefined（呼び出し側で飛ばす）
 */
export function resolveReviewQuestion(item: ReviewItem, src: QuestionSource, seed?: number): Question | undefined {
  // 生成の途中で例外が出ても、復習全体を止めずに「見つからない」として扱う
  try {
    if (item.stage >= 1 && item.generatorId) return src.freshVariant(item.generatorId, seed)
    return src.getQuestionByKey(item.questionKey)
  } catch {
    return undefined
  }
}

/** 出せる復習だけを、問題つきで返す */
export function buildReviewQueue(
  reviews: ReviewItem[],
  today: string,
  src: QuestionSource,
): { item: ReviewItem; question: Question }[] {
  const out: { item: ReviewItem; question: Question }[] = []
  for (const item of dueReviews(reviews, today)) {
    // 新しい seed の問題は、まれに作れない seed があるので数回引き直す
    const tries = item.stage >= 1 && item.generatorId ? 3 : 1
    for (let i = 0; i < tries; i++) {
      const question = resolveReviewQuestion(item, src)
      if (question) {
        out.push({ item, question })
        break
      }
    }
  }
  return out
}

/** 今日の復習の件数（出せないものは数えない）。表示用なので seed を固定して副作用なく調べる */
export function countDueReviews(reviews: ReviewItem[], today: string, src: QuestionSource): number {
  return dueReviews(reviews, today).filter((item) => resolveReviewQuestion(item, src, 1) !== undefined).length
}
