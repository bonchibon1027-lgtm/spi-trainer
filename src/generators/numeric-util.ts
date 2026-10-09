import type { BuiltChoices } from '../lib/choices'
import type { Generator } from '../types'
import type { Rng } from '../lib/rng'
import { frac, gcd, isInt, num, rawFrac, reduce, round } from '../lib/math'

// 非言語A担当（basics / ratio / profit / speed）の型で共通に使う小道具。
// 共有ファイル（lib/*）は触らず、ここに置く。

/** 浮動小数の誤差を消す */
export const R = (n: number) => round(n, 4)
/** 小数の表記（"0.375"） */
export const decStr = (n: number) => String(round(n, 4))
/** 百分率の表記（"37.5%"） */
export const pctStr = (n: number) => `${round(n, 2)}%`
/** 正の整数か */
export const posInt = (n: number) => n > 0 && isInt(n)
/** 正の整数で、max 以下か（現実的でない大きな選択肢を避ける） */
export const posIntMax = (max: number) => (n: number) => posInt(n) && n <= max
/** 正で、小数第2位までの百分率か */
export const okPct = (n: number) => n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6
/** 「もとにする量」に使う、暗算しやすい20の倍数 */
export const BASES = [40, 60, 80, 100, 120, 160, 200, 240, 300, 360, 400, 480, 500, 600, 800, 1000]
/** 原価に使う、暗算しやすい金額 */
export const COSTS = [300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 1600, 1800, 2000, 2400, 2500, 3000, 3500, 4000, 5000]
/** 単位つきの数の表記（"1,200個"） */
export const withUnit = (unit: string) => (n: number) => `${num(R(n))}${unit}`

type ChoiceOpts = {
  format: (n: number) => string
  count?: number
  /** 埋め草に使う刻み。省略時は正解の約10%（最小1） */
  padStep?: number
  /** 不正な値を除く条件。省略時は「正の数」 */
  isValid?: (n: number) => boolean
}

/**
 * 数値の選択肢を作る（numericChoices の代わり）。
 *
 * - candidates には「よくある間違いの値」を優先度の高い順に渡す
 * - 選択肢は小さい順に並べるので、そのままだと正解がいつも真ん中あたりになってしまう。
 *   そこで「正解より小さい選択肢を何個にするか」を先に乱数で決め、正解の位置が
 *   1〜5番目に散らばるようにする。足りない分は、正解の近くの値（padStep 刻み）で埋める
 */
export function mixedChoices(rng: Rng, correct: number, candidates: number[], opts: ChoiceOpts): BuiltChoices {
  const count = opts.count ?? 5
  const isValid = opts.isValid ?? ((n: number) => n > 0 && Number.isFinite(n))
  const step = opts.padStep ?? Math.max(1, Math.round(Math.abs(correct) * 0.1))
  const seen = new Set<string>([opts.format(correct)])
  const lowPool: number[] = []
  const highPool: number[] = []
  const add = (n: number) => {
    if (!isValid(n)) return
    const k = opts.format(n)
    if (seen.has(k)) return
    seen.add(k)
    if (n < correct) lowPool.push(n)
    else highPool.push(n)
  }
  candidates.forEach(add)
  // 正解の近くの値で埋める（下側・上側それぞれ）
  for (let k = 1; k <= 60; k++) {
    add(correct - k * step)
    add(correct + k * step)
  }
  const total = count - 1
  const tMin = Math.max(0, total - highPool.length)
  const tMax = Math.min(total, lowPool.length)
  if (tMin > tMax) throw new Error(`mixedChoices: 選択肢が足りない (correct=${correct})`)
  const lows = rng.int(tMin, tMax)
  const all = [correct, ...lowPool.slice(0, lows), ...highPool.slice(0, total - lows)].sort((x, y) => x - y)
  return { choices: all.map(opts.format), answer: all.indexOf(correct) }
}

/** 「分子 ÷ 分母」を約分し、分母を100にそろえて p%（整数）にする途中式 */
export function toPercentSteps(numer: number, denom: number, p: number): string[] {
  const [rn, rd] = reduce(numer, denom)
  const g = gcd(numer, denom)
  const base = `${num(numer)} ÷ ${num(denom)} = ${rawFrac(numer, denom)}${g > 1 ? ` = ${frac(rn, rd)}（${g} で約分）` : ''}`
  if (rd === 100) return [base, `${frac(rn, rd)} = ${p}%`]
  return [
    base,
    `分母 ${rd} を 100 にするには ${100 / rd} 倍すればよいので、分子も ${100 / rd} 倍して ${frac(rn, rd)} = ${rawFrac(p, 100)} = ${p}%`,
  ]
}

/**
 * 値つきの選択肢（分数など）を値の小さい順に並べる（sortedChoices の代わり）。
 * mixedChoices と同じく、正解より小さい選択肢の数を乱数で決めて、正解の位置を散らす。
 * candidates は「よくある間違いの値」を優先度の高い順に渡す（最後に埋め草を足しておく）
 */
export function mixedSorted(
  rng: Rng,
  correct: { label: string; value: number },
  candidates: { label: string; value: number }[],
  count = 5,
): BuiltChoices {
  const seen = new Set<string>([correct.label])
  const lows: { label: string; value: number }[] = []
  const highs: { label: string; value: number }[] = []
  for (const c of candidates) {
    if (seen.has(c.label) || Math.abs(c.value - correct.value) < 1e-9) continue
    seen.add(c.label)
    if (c.value < correct.value) lows.push(c)
    else highs.push(c)
  }
  const total = count - 1
  const tMin = Math.max(0, total - highs.length)
  const tMax = Math.min(total, lows.length)
  if (tMin > tMax) throw new Error(`mixedSorted: 選択肢が足りない (correct=${correct.label})`)
  const nLow = rng.int(tMin, tMax)
  const all = [correct, ...lows.slice(0, nLow), ...highs.slice(0, total - nLow)].sort((a, b) => a.value - b.value)
  return { choices: all.map((c) => c.label), answer: all.indexOf(correct) }
}

/** 型ごとの目安時間（秒）を決める。分野の標準より易しい型・難しい型で変える */
export function withTarget(g: Generator, targetSec: number): Generator {
  return { ...g, generate: (seed) => ({ ...g.generate(seed), targetSec }) }
}
