import { describe, expect, it } from 'vitest'
import { createRng } from '../lib/rng'
import { frac } from '../lib/math'
import { SPECS, type Spec } from './probability'

// 確率の型の正しさを、「全部の場合を書き出して数える」ことで確かめる。
// 型の draw でパラメータを取り出し、サイコロの目・コインの表裏・玉やくじの引き方を総当たりで数え、
// 「条件に合う場合 / 全部の場合」を約分した分数にして、正解の選択肢と照らし合わせる。

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1)

type Count = [number, number] // [条件に合う場合の数, 全部の場合の数]

/** "{{3/8}}" → 0.375 */
function valueOf(label: string): number {
  const m = /^\{\{(\d+)\/(\d+)\}\}$/.exec(label)
  if (!m) throw new Error(`分数の形でない選択肢: ${label}`)
  return Number(m[1]) / Number(m[2])
}

function run<P>(s: Spec<P>, seed: number) {
  const rng = createRng(seed)
  const p = s.draw(rng)
  const body = s.build(p, rng)
  return { p, body }
}

/**
 * mistake: 「最もよくある間違い」の確率（約分前の [分子, 分母]。なければ null）。
 * 正解の位置を散らすため毎回入るとは限らないが、ほとんどの問題には入っているはず。
 */
function check<P>(
  name: string,
  s: Spec<P>,
  expected: (p: P) => Count,
  mistake?: (p: P, count: Count) => Count | null,
) {
  describe(name, () => {
    it('全部の場合を数えた確率と、正解の選択肢が一致する', () => {
      let withMistake = 0
      let applicable = 0
      for (const seed of SEEDS) {
        const { p, body } = run(s, seed)
        const count = expected(p)
        const want = frac(count[0], count[1])
        const choices = body.choices!
        const ctx = `seed=${seed} p=${JSON.stringify(p)}\n${body.stem}\n${choices.join(' / ')}`
        expect(count[0] > 0 && count[0] < count[1], ctx).toBe(true)
        expect(choices[body.answer as number], ctx).toBe(want)
        expect(body.explanation[body.explanation.length - 1], ctx).toBe(`答え: ${want}`)
        expect(choices.length, ctx).toBe(5)
        expect(new Set(choices).size, ctx).toBe(5)
        // 選択肢は分数で、値の小さい順に並んでいる
        const values = choices.map(valueOf)
        for (let i = 1; i < values.length; i++) expect(values[i] > values[i - 1], ctx).toBe(true)
        for (const v of values) expect(v > 0 && v < 1, ctx).toBe(true)
        // generate() 経由（アプリが使う経路）でも同じ問題になる
        const q = s.generator.generate(seed)
        expect(q.choices![q.answer as number], ctx).toBe(want)
        expect(q.stem).toBe(body.stem)
        const m = mistake?.(p, count)
        if (m && m[0] > 0 && m[0] < m[1] && frac(m[0], m[1]) !== want) {
          applicable++
          if (choices.includes(frac(m[0], m[1]))) withMistake++
        }
      }
      if (mistake) expect(withMistake / applicable, `よくある間違いが選択肢に入る割合 ${withMistake}/${applicable}`).toBeGreaterThan(0.7)
    })
  })
}

// ---- 総当たりの道具 ----

const DICE = [1, 2, 3, 4, 5, 6]

function countDice(ok: (a: number, b: number) => boolean): Count {
  let c = 0
  for (const a of DICE) for (const b of DICE) if (ok(a, b)) c++
  return [c, 36]
}

/** 独立な2つの出来事。p, q は [成功の重み, 全体の重み] */
function countIndependent(p: [number, number], q: [number, number], ok: (a: boolean, b: boolean) => boolean): Count {
  let num = 0
  for (const a of [true, false]) {
    for (const b of [true, false]) {
      const wa = a ? p[0] : p[1] - p[0]
      const wb = b ? q[0] : q[1] - q[0]
      if (ok(a, b)) num += wa * wb
    }
  }
  return [num, p[1] * q[1]]
}

describe('nv-probability の問題の型', () => {
  it('型が5個以上あり、難易度1が2つ以上ある', () => {
    const gens = Object.values(SPECS).map((s) => s.generator)
    expect(gens.length).toBeGreaterThanOrEqual(5)
    expect(gens.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
  })

  check(
    'dice-sum（サイコロ2個の和・差）',
    SPECS.diceSum,
    ({ kind, k }) =>
      countDice((a, b) => {
        const s = a + b
        if (kind === 'eq') return s === k
        if (kind === 'ge') return s >= k
        if (kind === 'le') return s <= k
        if (kind === 'mult') return Number.isInteger(s / k)
        return a - b === k || b - a === k
      }),
    // よくある間違い: 反対の条件の確率を答えた
    (_p, count) => [36 - count[0], 36],
  )

  check('dice-product（サイコロ2個の積）', SPECS.diceProduct, ({ kind, k }) =>
    countDice((a, b) => {
      const m = a * b
      if (kind === 'even') return m % 2 === 0
      if (kind === 'odd') return m % 2 === 1
      if (kind === 'eq') return m === k
      if (kind === 'ge') return m >= k
      if (kind === 'le') return m <= k
      return Number.isInteger(m / k)
    }),
  )

  check('coin（コインちょうどk回）', SPECS.coin, ({ n, k }) => {
    let c = 0
    for (let bits = 0; bits < 1 << n; bits++) {
      let heads = 0
      for (let i = 0; i < n; i++) if (bits & (1 << i)) heads++
      if (heads === k) c++
    }
    return [c, 1 << n]
  })

  check('independent-and（どちらも）', SPECS.independentAnd, ({ p, q, mode }) =>
    countIndependent(p, q, (a, b) => (mode === 'both' ? a && b : !a && !b)),
  )

  check('independent-or（少なくとも・ちょうど）', SPECS.independentOr, ({ p, q, mode }) =>
    countIndependent(p, q, (a, b) => (mode === 'atLeast' ? a || b : a !== b)),
  )

  check('balls（同時に2個）', SPECS.balls, ({ mode, counts }) => {
    // 玉に番号をつけ、色を並べる
    const colorOf: number[] = []
    counts.forEach((c, color) => {
      for (let i = 0; i < c; i++) colorOf.push(color)
    })
    let hit = 0
    let all = 0
    for (let i = 0; i < colorOf.length; i++) {
      for (let j = i + 1; j < colorOf.length; j++) {
        all++
        const x = colorOf[i]
        const y = colorOf[j]
        if (mode === 'bothFirst' && x === 0 && y === 0) hit++
        if ((mode === 'same' || mode === 'same3') && x === y) hit++
        if (mode === 'oneEach' && x !== y) hit++ // 2色だけなので、色が違えば 色0 と 色1 が1個ずつ
      }
    }
    return [hit, all]
  })

  check('lots（くじを順に引く）', SPECS.lots, ({ mode, n, a }) => {
    const isHit = (i: number) => i < a // 0..a-1 が当たり
    let hit = 0
    let all = 0
    if (mode === 'three') {
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          for (let k = 0; k < n; k++) {
            if (i === j || j === k || i === k) continue
            all++
            if (isHit(i) && isHit(j) && isHit(k)) hit++
          }
      return [hit, all]
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue // 引いたくじは戻さない
        all++
        if (mode === 'both' && isHit(i) && isHit(j)) hit++
        if (mode === 'missHit' && !isHit(i) && isHit(j)) hit++
        if (mode === 'exactlyOne' && isHit(i) !== isHit(j)) hit++
        if (mode === 'second' && isHit(j)) hit++
      }
    }
    return [hit, all]
  })

  check('at-least-once（少なくとも1回）', SPECS.atLeastOnce, (p) => {
    if (p.kind === 'coin') {
      let hit = 0
      for (let bits = 0; bits < 1 << p.n; bits++) if (bits !== 0) hit++ // 1つでも表（ビットが立つ）
      return [hit, 1 << p.n]
    }
    if (p.kind === 'dice') return countDice((a, b) => a >= p.t || b >= p.t)
    // b 通りの同様に確からしい結果のうち、a 通りが当たり。n回の結果をすべて書き出す
    let hit = 0
    let all = 0
    const rec = (depth: number, anyWin: boolean) => {
      if (depth === p.n) {
        all++
        if (anyWin) hit++
        return
      }
      for (let cell = 0; cell < p.b; cell++) rec(depth + 1, anyWin || cell < p.a)
    }
    rec(0, false)
    return [hit, all]
  })

  check(
    'balls-seq（戻す・戻さない）',
    SPECS.ballsSeq,
    ({ replace, kind, r, w }) => {
      const n = r + w
      const isRed = (i: number) => i < r
      let hit = 0
      let all = 0
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (!replace && i === j) continue
          all++
          if (kind === 'same' && isRed(i) === isRed(j)) hit++
          if (kind === 'diff' && isRed(i) !== isRed(j)) hit++
          if (kind === 'redWhite' && isRed(i) && !isRed(j)) hit++
        }
      }
      return [hit, all]
    },
    // よくある間違い: 「戻す」と「戻さない」を取り違えた
    ({ replace, kind, r, w }) => {
      const n = r + w
      return replace
        ? kind === 'same'
          ? ([r * (r - 1) + w * (w - 1), n * (n - 1)] as Count)
          : kind === 'diff'
            ? ([2 * r * w, n * (n - 1)] as Count)
            : ([r * w, n * (n - 1)] as Count)
        : kind === 'same'
          ? ([r * r + w * w, n * n] as Count)
          : kind === 'diff'
            ? ([2 * r * w, n * n] as Count)
            : ([r * w, n * n] as Count)
    },
  )
})

// 問題文が、型のパラメータどおりの内容になっているか（数字や条件の書き間違いがないか）を確かめる
describe('nv-probability の問題文がパラメータどおりである', () => {
  const mentions = <P>(s: Spec<P>, want: (p: P) => string[]) => {
    for (const seed of SEEDS.slice(0, 300)) {
      const { p, body } = run(s, seed)
      for (const w of want(p)) expect(body.stem, `seed=${seed} ${JSON.stringify(p)}`).toContain(w)
    }
  }
  const fr = (f: [number, number]) => `{{${f[0]}/${f[1]}}}`

  it('dice-sum / dice-product', () => {
    mentions(SPECS.diceSum, ({ kind, k }) => [
      { eq: `和が${k}になる`, ge: `和が${k}以上`, le: `和が${k}以下`, mult: `和が${k}の倍数`, diff: k === 0 ? '同じになる' : `差（大きい方から小さい方を引いた数）が${k}` }[kind],
    ])
    mentions(SPECS.diceProduct, ({ kind, k }) => [
      { even: '積が偶数', odd: '積が奇数', eq: `積が${k}になる`, ge: `積が${k}以上`, le: `積が${k}以下`, mult: `積が${k}の倍数` }[kind],
    ])
  })

  it('coin / independent', () => {
    mentions(SPECS.coin, ({ n, k, side }) => [`${n}`, `${side}がちょうど${k}`])
    mentions(SPECS.independentAnd, ({ p, q }) => [fr(p), fr(q)])
    mentions(SPECS.independentOr, ({ p, q, mode }) => [fr(p), fr(q), mode === 'atLeast' ? '少なくとも' : 'ちょうど'])
  })

  it('balls / lots / at-least-once / balls-seq', () => {
    mentions(SPECS.balls, ({ counts, colors }) => counts.map((c, i) => `${colors[i]}玉が${c}個`))
    mentions(SPECS.lots, ({ mode, n, a }) => [
      `${n}本のくじ`,
      `当たりが${a}本`,
      { both: '2人とも当たる', missHit: 'Aがはずれ、Bが当たる', exactlyOne: 'ちょうど1人だけ', second: 'Bが当たる確率', three: '3人とも当たる' }[mode],
    ])
    mentions(SPECS.atLeastOnce, (p) =>
      p.kind === 'coin'
        ? [`${p.n}`, `${p.side}が出る`]
        : p.kind === 'dice'
          ? [p.t === 6 ? '6の目' : `${p.t}以上の目`]
          : [`{{${p.a}/${p.b}}}`, `${p.n}回`],
    )
    mentions(SPECS.ballsSeq, ({ replace, r, w }) => [
      `赤玉が${r}個`,
      `白玉が${w}個`,
      replace ? 'そのつど袋に戻す' : '袋に戻さない',
    ])
  })
})
