import type { Rng } from './rng'

export type BuiltChoices = { choices: string[]; answer: number }

/**
 * 数値の答えから選択肢を作る。
 *
 * - candidates には「よくある間違い方で出る値」を優先度の高い順に渡す
 *   （例: 引き忘れた値、割引前で計算した値）。正解と同じ値・不正な値は自動で除く
 * - 足りない分は正解の近くの値（padStep 刻み）で埋める
 * - 選択肢は小さい順に並べる（SPIの数値選択肢は昇順が多い）
 */
export function numericChoices(
  rng: Rng,
  correct: number,
  candidates: number[],
  opts: {
    format: (n: number) => string
    count?: number
    /** 埋め草に使う刻み。省略時は正解の約10%（最小1） */
    padStep?: number
    /** 不正な値（負、0、非整数など）を除く条件。省略時は「正の数」 */
    isValid?: (n: number) => boolean
  },
): BuiltChoices {
  const count = opts.count ?? 5
  const isValid = opts.isValid ?? ((n: number) => n > 0 && Number.isFinite(n))
  const key = (n: number) => opts.format(n)
  const correctKey = key(correct)

  const picked: number[] = []
  const seen = new Set<string>([correctKey])
  const tryAdd = (n: number) => {
    if (picked.length >= count - 1) return
    if (!isValid(n)) return
    const k = key(n)
    if (seen.has(k)) return
    seen.add(k)
    picked.push(n)
  }

  candidates.forEach(tryAdd)

  const step = opts.padStep ?? Math.max(1, Math.round(Math.abs(correct) * 0.1))
  // 正解の上下に交互に広げる。どちらに寄るかは乱数で決め、正解の位置が偏らないようにする
  const offsets = rng.shuffle([-3, -2, -1, 1, 2, 3, 4, -4])
  for (const k of offsets) tryAdd(correct + k * step)
  for (let k = 5; picked.length < count - 1 && k < 50; k++) {
    tryAdd(correct + k * step)
    tryAdd(correct - k * step)
  }
  if (picked.length < count - 1) {
    throw new Error(`numericChoices: 選択肢が足りない (correct=${correct})`)
  }

  const all = [correct, ...picked].sort((a, b) => a - b)
  return { choices: all.map(opts.format), answer: all.indexOf(correct) }
}

/**
 * 文字列の選択肢を作る（分数の確率など、並べ順を値で決めたいときは values を使う）。
 * - correct と distractors を混ぜて rng で並べ替える
 * - 重複は除く。distractors が足りなければ例外
 */
export function shuffledChoices(
  rng: Rng,
  correct: string,
  distractors: string[],
  count = 5,
): BuiltChoices {
  const uniq = Array.from(new Set(distractors.filter((d) => d !== correct)))
  if (uniq.length < count - 1) {
    throw new Error(`shuffledChoices: 選択肢が足りない (correct=${correct})`)
  }
  const all = rng.shuffle([correct, ...uniq.slice(0, count - 1)])
  return { choices: all, answer: all.indexOf(correct) }
}

/**
 * 値つきの選択肢を、値の小さい順に並べる（分数の確率などに使う）。
 * items[0] を正解として扱う。表示文字列が重複するものは除く
 */
export function sortedChoices(
  items: { label: string; value: number }[],
  count = 5,
): BuiltChoices {
  const [correct] = items
  const seen = new Set<string>()
  const uniq = items.filter((it) => {
    if (seen.has(it.label)) return false
    seen.add(it.label)
    return true
  })
  if (uniq.length < count) {
    throw new Error(`sortedChoices: 選択肢が足りない (correct=${correct.label})`)
  }
  const all = [correct, ...uniq.slice(1, count)].sort((a, b) => a.value - b.value)
  return { choices: all.map((c) => c.label), answer: all.indexOf(correct) }
}
