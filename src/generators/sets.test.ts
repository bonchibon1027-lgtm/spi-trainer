import { describe, expect, it } from 'vitest'
import { createRng } from '../lib/rng'
import { SPECS, type Spec } from './sets'

// 集合の型の正しさを、「人を1人ずつ数える」「あり得る人数の組を全部試す」ことで確かめる。
// 問題文に書かれた数字そのものを読み取り直して（パラメータには頼らず）、条件に合う人数を総当たりで求め、
// 正解の選択肢と照らし合わせる。

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1)

/** 問題文に出てくる「○人」の数字を順に取り出す */
const peopleNumbers = (stem: string) => (stem.match(/\d+(?=人)/g) ?? []).map(Number)

function run<P>(s: Spec<P>, seed: number) {
  const rng = createRng(seed)
  const p = s.draw(rng)
  const body = s.build(p, rng)
  return { p, body }
}

function check<P>(
  name: string,
  s: Spec<P>,
  expected: (p: P, body: ReturnType<Spec<P>['build']>) => number,
  /** 最もよくある間違いの人数（なければ null）。正解の位置を散らすため毎回入るとは限らないが、ほとんどの問題には入っているはず */
  mistake?: ((p: P) => number | null) | null,
  seeds = SEEDS,
) {
  describe(name, () => {
    it('総当たりで数えた人数と、正解の選択肢が一致する', () => {
      let withMistake = 0
      let applicable = 0
      for (const seed of seeds) {
        const { p, body } = run(s, seed)
        const want = `${expected(p, body)}人`
        const choices = body.choices!
        const ctx = `seed=${seed} p=${JSON.stringify(p)}\n${body.stem}\n${choices.join(' / ')}`
        expect(choices[body.answer as number], ctx).toBe(want)
        expect(body.explanation[body.explanation.length - 1], ctx).toBe(`答え: ${want}`)
        expect(choices.length, ctx).toBe(5)
        expect(new Set(choices).size, ctx).toBe(5)
        // 現実的な人数（正の整数）だけが選択肢に並ぶ
        for (const c of choices) expect(/^[1-9]\d*人$/.test(c), ctx).toBe(true)
        // generate() 経由（アプリが使う経路）でも同じ問題になる
        const q = s.generator.generate(seed)
        expect(q.choices![q.answer as number], ctx).toBe(want)
        expect(q.stem).toBe(body.stem)
        const m = mistake?.(p)
        if (m && m > 0 && `${m}人` !== want && m <= peopleNumbers(body.stem)[0]) {
          applicable++
          if (choices.includes(`${m}人`)) withMistake++
        }
      }
      if (mistake) expect(withMistake / applicable, `よくある間違いが選択肢に入る割合 ${withMistake}/${applicable}`).toBeGreaterThan(0.7)
    })
  })
}

/** 2つの質問のアンケート: 4つの領域（Aだけ・Bだけ・両方・どちらでもない）の人数をすべて試して、問題文と合うものを探す */
function solveTwo(N: number, known: { a?: number; b?: number; both?: number; neither?: number }) {
  const found: { onlyA: number; onlyB: number; both: number; neither: number }[] = []
  for (let both = 0; both <= N; both++) {
    for (let onlyA = 0; onlyA + both <= N; onlyA++) {
      for (let onlyB = 0; onlyA + onlyB + both <= N; onlyB++) {
        const neither = N - onlyA - onlyB - both
        if (known.a !== undefined && onlyA + both !== known.a) continue
        if (known.b !== undefined && onlyB + both !== known.b) continue
        if (known.both !== undefined && both !== known.both) continue
        if (known.neither !== undefined && neither !== known.neither) continue
        found.push({ onlyA, onlyB, both, neither })
      }
    }
  }
  return found
}

describe('nv-sets の問題の型', () => {
  it('型が4個以上あり、難易度1が2つ以上ある', () => {
    const gens = Object.values(SPECS).map((s) => s.generator)
    expect(gens.length).toBeGreaterThanOrEqual(4)
    expect(gens.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
    expect(gens.filter((g) => g.difficulty === 3).length).toBeGreaterThanOrEqual(2)
  })

  check(
    'two-neither（どちらもいいえ）',
    SPECS.twoNeither,
    (_p, body) => {
      const [N, a, b, both] = peopleNumbers(body.stem)
      const sols = solveTwo(N, { a, b, both })
      expect(sols.length).toBe(1) // 問題文の条件で人数が1通りに決まる
      return sols[0].neither
    },
    // よくある間違い: 両方の人を足し戻し忘れた（N − a − b）
    ({ N, onlyA, onlyB, both }) => N - (onlyA + both) - (onlyB + both),
  )

  check('two-only（片方だけ）', SPECS.twoOnly, (p, body) => {
    const [N, a, b, both] = peopleNumbers(body.stem)
    const sols = solveTwo(N, { a, b, both })
    expect(sols.length).toBe(1)
    const s = sols[0]
    return p.ask === 'onlyA' ? s.onlyA : p.ask === 'onlyB' ? s.onlyB : s.onlyA + s.onlyB
  })

  check('two-both（両方を逆算）', SPECS.twoBoth, (_p, body) => {
    const [N, a, b, neither] = peopleNumbers(body.stem)
    const sols = solveTwo(N, { a, b, neither })
    expect(sols.length).toBe(1)
    return sols[0].both
  })

  // 表: 表に書かれた数字（と全体の人数）に合う2×2の表をすべて試し、アに入る数が1通りに決まることを確かめる
  check(
    'table（表で示すアンケート結果）',
    SPECS.tableSet,
    (_p, body) => {
      const table = body.table!
      const N = peopleNumbers(body.stem)[0]
      const given = new Map<string, number>() // "行,列" → 数
      let target = ''
      table.rows.forEach((row, r) => {
        row.slice(1).forEach((cell, c) => {
          if (cell === 'ア') target = `${r},${c}`
          else if (cell !== '') given.set(`${r},${c}`, Number(cell))
        })
      })
      expect(target).not.toBe('')
      const values = new Set<number>()
      for (let c00 = 0; c00 <= N; c00++) {
        for (let c01 = 0; c00 + c01 <= N; c01++) {
          for (let c10 = 0; c00 + c01 + c10 <= N; c10++) {
            const c11 = N - c00 - c01 - c10
            const cells: Record<string, number> = {
              '0,0': c00,
              '0,1': c01,
              '0,2': c00 + c01,
              '1,0': c10,
              '1,1': c11,
              '1,2': c10 + c11,
              '2,0': c00 + c10,
              '2,1': c01 + c11,
              '2,2': N,
            }
            let ok = true
            for (const [k, v] of given) if (cells[k] !== v) ok = false
            if (ok) values.add(cells[target])
          }
        }
      }
      expect([...values].length).toBe(1) // アが1通りに決まる
      return [...values][0]
    },
    null,
    SEEDS.slice(0, 200),
  )

  // 3つの集合: 領域（8つ）の人数を、問題文の数字から連立して求め直す
  check('three（3つの集合）', SPECS.three, (p, body) => {
    const nums = peopleNumbers(body.stem)
    const [N, A, B, C, pAB, pBC, pCA, last] = nums
    const results = new Set<string>()
    for (let abc = 0; abc <= Math.min(pAB, pBC, pCA); abc++) {
      if (p.mode !== 'all' && abc !== last) continue
      const AB = pAB - abc
      const BC = pBC - abc
      const CA = pCA - abc
      const oA = A - AB - CA - abc
      const oB = B - AB - BC - abc
      const oC = C - BC - CA - abc
      const none = N - (oA + oB + oC + AB + BC + CA + abc)
      if ([AB, BC, CA, oA, oB, oC, none].some((v) => v < 0)) continue
      if (p.mode === 'all' && none !== last) continue
      // 人を1人ずつ作って、「どれか1つ以上に当てはまる」人を数える
      const people: boolean[][] = []
      const add = (n: number, flags: boolean[]) => {
        for (let i = 0; i < n; i++) people.push(flags)
      }
      add(oA, [true, false, false])
      add(oB, [false, true, false])
      add(oC, [false, false, true])
      add(AB, [true, true, false])
      add(BC, [false, true, true])
      add(CA, [true, false, true])
      add(abc, [true, true, true])
      add(none, [false, false, false])
      expect(people.length).toBe(N)
      const unionCount = people.filter((f) => f.some(Boolean)).length
      const noneCount = people.length - unionCount
      results.add(p.mode === 'none' ? `${noneCount}` : p.mode === 'union' ? `${unionCount}` : `${abc}`)
    }
    expect(results.size).toBe(1) // 問題文の条件で答えが1通りに決まる
    return Number([...results][0])
  })

  // 最少・最大: 両方に当てはまる人数 x としてあり得る値をすべて試す
  check('min-max（最少・最大）', SPECS.minMax, (p, body) => {
    const [N, a, b] = peopleNumbers(body.stem)
    const bothValues: number[] = []
    const neitherValues: number[] = []
    for (let x = 0; x <= N; x++) {
      const onlyA = a - x
      const onlyB = b - x
      const neither = N - onlyA - onlyB - x
      if (onlyA < 0 || onlyB < 0 || neither < 0) continue
      bothValues.push(x)
      neitherValues.push(neither)
    }
    if (p.mode === 'minBoth') return Math.min(...bothValues)
    if (p.mode === 'maxBoth') return Math.max(...bothValues)
    return Math.max(...neitherValues)
  })
})

// 問題文が、型のパラメータどおりの内容になっているか（聞いていることの書き間違いがないか）を確かめる
describe('nv-sets の問題文がパラメータどおりである', () => {
  it('何を聞いているか', () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const only = run(SPECS.twoOnly, seed)
      const phrase = { onlyA: '質問Aにだけ', onlyB: '質問Bにだけ', exactlyOne: 'どちらか一方の質問にだけ' }[only.p.ask]
      expect(only.body.stem, `seed=${seed}`).toContain(phrase)

      const mm = run(SPECS.minMax, seed)
      const q = { minBoth: '少なくとも何人', maxBoth: '多くても何人', maxNeither: 'どちらにも当てはまらない人は、多くても' }[mm.p.mode]
      expect(mm.body.stem, `seed=${seed}`).toContain(q)
      expect(mm.body.stem).toContain(`${mm.p.N}人`)

      const th = run(SPECS.three, seed)
      const t = { none: 'どれにも「はい」と答えなかった人は何人か', union: '少なくとも1つに「はい」と答えた人は何人か', all: '3つすべてに「はい」と答えた人は何人か' }[th.p.mode]
      expect(th.body.stem, `seed=${seed}`).toContain(t)

      const tb = run(SPECS.tableSet, seed)
      expect(tb.body.table!.headers.length).toBe(4)
      expect(tb.body.table!.rows.length).toBe(3)
      expect(tb.body.table!.rows.flat().filter((c) => c === 'ア').length).toBe(1) // アは1か所だけ
    }
  })
})
