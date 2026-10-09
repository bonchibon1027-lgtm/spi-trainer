import type { Rng } from '../lib/rng'
import type { BuiltChoices } from '../lib/choices'

// 場合の数・確率・集合の型（nv-combination / nv-probability / nv-sets）で共通に使う選択肢づくり。
// 共有ファイル（lib/*）は触らず、ここに置く。
//
// numericChoices は「よくある間違い」をそのまま優先して並べるので、間違いがどれも正解より大きい（または小さい）型では、
// 正解がいつも同じ位置（先頭や末尾）に来てしまう。ここでは次のようにして位置を散らす。
//   1. 正解が小さい方から何番目に来るか（0〜4）を、乱数で一様に選ぶ
//   2. 正解より小さい間違いが必要な数だけ、大きい間違いが必要な数だけ、それぞれの候補から優先度順に入れる
//   3. 足りなければ、正解の近くの値（lowerPad / upperPad）で埋める
// 優先度の高い間違い（先頭の候補）は、その側に選択肢が必要なときは必ず最初に入る。
// opts.keep を指定すると、先頭の keep 個は位置によらず必ず入れる（そのぶん正解が来られる位置は狭まる）。

export type Item = { label: string; value: number }

export function balancedPick(
  rng: Rng,
  correct: Item,
  wrongs: Item[],
  lowerPad: Item[],
  upperPad: Item[],
  opts: { count?: number; keep?: number } = {},
): BuiltChoices {
  const count = opts.count ?? 5
  const keep = opts.keep ?? 0
  const total = count - 1 // 間違いの選択肢の数

  // 重複と正解は除く（優先度順は保つ）
  const seen = new Set<string>([correct.label])
  const cands: Item[] = []
  for (const w of wrongs) {
    if (seen.has(w.label)) continue
    seen.add(w.label)
    cands.push(w)
  }

  const musts = cands.slice(0, Math.min(keep, total))
  const rest = cands.slice(musts.length)
  const lowMust = musts.filter((m) => m.value < correct.value).length
  const upMust = musts.length - lowMust
  const positions: number[] = []
  for (let p = lowMust; p <= total - upMust; p++) positions.push(p)

  for (const p of rng.shuffle(positions)) {
    const used = new Set<string>([correct.label, ...musts.map((m) => m.label)])
    const take = (pool: Item[], pad: Item[], need: number): Item[] | null => {
      const got: Item[] = []
      for (const it of [...pool, ...pad]) {
        if (got.length >= need) break
        if (used.has(it.label)) continue
        used.add(it.label)
        got.push(it)
      }
      return got.length >= need ? got : null
    }
    const low = take(
      rest.filter((c) => c.value < correct.value),
      lowerPad,
      p - lowMust,
    )
    const up = take(
      rest.filter((c) => c.value > correct.value),
      upperPad,
      total - p - upMust,
    )
    if (!low || !up) continue
    const all = [...musts, ...low, ...up, correct].sort((a, b) => a.value - b.value)
    return { choices: all.map((x) => x.label), answer: all.indexOf(correct) }
  }
  throw new Error(`balancedPick: 選択肢が足りない (correct=${correct.label})`)
}

/** 整数の選択肢（"15人"、"120通り" など）。小さい順に並べる */
export function balancedNumericChoices(
  rng: Rng,
  correct: number,
  wrong: number[],
  opts: {
    format: (n: number) => string
    /** 不正な値を除く条件。省略時は「正の整数」 */
    isValid?: (n: number) => boolean
    /** 埋め草の刻み。省略時は正解の約10%（最小1） */
    padStep?: number
    keep?: number
  },
): BuiltChoices {
  const isValid = opts.isValid ?? ((n: number) => Number.isInteger(n) && n > 0)
  const step = opts.padStep ?? Math.max(1, Math.round(Math.abs(correct) * 0.1))
  const mk = (n: number): Item => ({ label: opts.format(n), value: n })
  // 埋め草は、正解の近くの値。等間隔に並ぶと「間隔から外れた1つが正解」と見抜かれてしまうので、間隔に乱数でばらつきをつける
  const pads = (sign: 1 | -1): Item[] => {
    const out: Item[] = []
    const seen = new Set<string>()
    for (let k = 1; k <= 30; k++) {
      const delta = Math.max(1, Math.round(step * (k + (rng.next() - 0.5) * 0.9)))
      const v = correct + sign * delta
      if (!isValid(v)) continue
      const item = mk(v)
      if (seen.has(item.label)) continue
      seen.add(item.label)
      out.push(item)
    }
    return out.sort((a, b) => Math.abs(a.value - correct) - Math.abs(b.value - correct))
  }
  const lowerPad = pads(-1)
  const upperPad = pads(1)
  return balancedPick(rng, mk(correct), wrong.filter(isValid).map(mk), lowerPad, upperPad, { keep: opts.keep })
}
