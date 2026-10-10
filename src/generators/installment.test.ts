import { describe, expect, it, vi } from 'vitest'
import installment from './installment'
import { checkChain, checkStyle } from './arith-check'
import type { Question } from '../types'

// 分割払い（nv-installment）の型を、問題文の数字から読み取り直して、払い方を1回ずつシミュレーションして検算する。
// 分数は、このテストの中だけの小さな分数の計算で扱う（生成コードの計算とは別に書いてある）。

const SEEDS = Array.from({ length: 600 }, (_, i) => i * 104729 + 37)
const gen = (id: string) => {
  const g = installment.find((x) => x.id === `nv-installment/${id}`)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const num = (s: string) => Number(s.replace(/,/g, ''))
/** 選択肢の "4,125円" "7回目" の数 */
const val = (s: string) => num(s.replace(/[^\d,]/g, ''))
const correctText = (q: Question) => q.choices![q.answer as number]
const run = (id: string, check: (q: Question, seed: number) => void) => {
  for (const seed of SEEDS) check(gen(id).generate(seed), seed)
}

// ---- 小さな分数の計算 ----
type Fr = { n: number; d: number }
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const fr = (n: number, d = 1): Fr => {
  const g = gcd(Math.abs(n), d) || 1
  return { n: n / g, d: d / g }
}
const add = (a: Fr, b: Fr) => fr(a.n * b.d + b.n * a.d, a.d * b.d)
const sub = (a: Fr, b: Fr) => fr(a.n * b.d - b.n * a.d, a.d * b.d)
const mul = (a: Fr, b: Fr) => fr(a.n * b.n, a.d * b.d)
const eq = (a: Fr, b: Fr) => a.n * b.d === b.n * a.d
/** "{{3/8}}" または整数 "1" */
function parseFr(s: string): Fr {
  const m = /^\{\{(\d+)\/(\d+)\}\}$/.exec(s)
  return m ? fr(Number(m[1]), Number(m[2])) : fr(Number(s))
}
const FR_RE = /\{\{\d+\/\d+\}\}/g
const frs = (s: string) => (s.match(FR_RE) ?? []).map(parseFr)
const frVal = (f: Fr) => f.n / f.d
/** 選択肢が分数のとき、その値 */
const choiceVal = (c: string) => (/\{\{/.test(c) ? frVal(parseFr(c)) : num(c.replace(/[^\d,.]/g, '')))

/** 選択肢の中に value（±1e-9）があるか */
const has = (q: Question, value: number) => q.choices!.some((c) => Math.abs(choiceVal(c) - value) < 1e-9)

function presence(id: string, mistake: (q: Question) => number | null): number {
  let applicable = 0
  let found = 0
  run(id, (q) => {
    const m = mistake(q)
    if (m === null || !(m > 0) || Math.abs(m - choiceVal(correctText(q))) < 1e-9) return
    applicable++
    if (has(q, m)) found++
  })
  expect(applicable).toBeGreaterThan(30)
  return found / applicable
}

describe('分数の検算の道具', () => {
  it('分数の計算と読み取り', () => {
    expect(parseFr('{{6/8}}')).toEqual({ n: 3, d: 4 })
    expect(parseFr('1')).toEqual({ n: 1, d: 1 })
    expect(eq(mul(fr(3, 4), fr(1, 3)), fr(1, 4))).toBe(true)
    expect(eq(sub(fr(1), fr(1, 4)), fr(3, 4))).toBe(true)
    expect(frs('1回目に{{1/2}}、2回目に{{3/4}}')).toEqual([fr(1, 2), fr(3, 4)])
  })
})

describe('nv-installment 全般', () => {
  it('型が3つ以上あり、難易度1が1つ以上ある', () => {
    expect(installment.length).toBeGreaterThanOrEqual(3)
    expect(installment.length).toBeLessThanOrEqual(5)
    expect(installment.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(1)
  })

  for (const g of installment) {
    it(`${g.id}: 選択肢は5つ以上で重複せず、解説の最後は「答え: 正解」、体裁がそろっている`, () => {
      for (const seed of SEEDS) {
        const q = g.generate(seed)
        expect(q.choices!.length, `seed=${seed}`).toBeGreaterThanOrEqual(5)
        expect(q.explanation[q.explanation.length - 1], `seed=${seed}`).toBe(`答え: ${correctText(q)}`)
        expect(new Set(q.choices).size, `seed=${seed}`).toBe(q.choices!.length)
        // 分数の選択肢は約分した形で、0 より大きく 1 より小さい。金額・回数は正の整数
        for (const c of q.choices!) {
          const f = /^\{\{(\d+)\/(\d+)\}\}$/.exec(c)
          if (f) {
            expect(gcd(Number(f[1]), Number(f[2])), `seed=${seed} ${c}`).toBe(1)
            expect(Number(f[1]) < Number(f[2]), `seed=${seed} ${c}`).toBe(true)
          } else {
            expect(/^[1-9][\d,]*(円|回目)$/.test(c), `seed=${seed} ${c}`).toBe(true)
          }
        }
        expect(checkStyle(q), `seed=${seed}\n${JSON.stringify(q, null, 2)}`).toEqual([])
      }
    })

    it(`${g.id}: 解説の途中式の計算が合っている`, () => {
      const stat = { pairs: 0 }
      for (const seed of SEEDS.slice(0, 300)) {
        const q = g.generate(seed)
        for (const line of [...q.explanation, ...(q.hint ? [q.hint] : [])]) {
          expect(checkChain(line, stat), `seed=${seed}\n${line}`).toEqual([])
        }
      }
      expect(stat.pairs).toBeGreaterThan(150)
    })
  }

  it('問題の生成で Math.random を使っていない', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random は使わない（乱数は rng から取る）')
    })
    try {
      for (const g of installment) for (const seed of SEEDS.slice(0, 30)) g.generate(seed)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('nv-installment/equal（頭金と均等払い）', () => {
  const parse = (q: Question) => {
    const m = /購入時に総額の(\{\{\d+\/\d+\}\}|\d+)を支払い、残りを(\d+)回の均等払い/.exec(q.stem)!
    const yen = /^総額([\d,]+)円の商品/.exec(q.stem)
    return { down: parseFr(m[1]), n: Number(m[2]), total: yen ? num(yen[1]) : null }
  }

  it('正解を代入すると「頭金 + 正解 × 回数 = 総額」になる（分数・金額の両方）', () => {
    const modes = new Set<string>()
    run('equal', (q, seed) => {
      const { down, n, total } = parse(q)
      const ctx = `seed=${seed}\n${q.stem}\n${q.choices!.join(' / ')}`
      if (total === null) {
        modes.add('frac')
        const x = parseFr(correctText(q))
        // 総額を 1 として、頭金を払ってから 1 回分ずつ n 回払うと、ちょうど払い終わる
        let paid = down
        for (let i = 0; i < n; i++) paid = add(paid, x)
        expect(eq(paid, fr(1)), ctx).toBe(true)
      } else {
        modes.add('yen')
        const x = val(correctText(q))
        const downYen = (total * down.n) / down.d
        expect(Number.isInteger(downYen), ctx).toBe(true)
        let paid = downYen
        for (let i = 0; i < n; i++) paid += x
        expect(paid, ctx).toBe(total)
        expect(x % 100, `1回の支払額は100円単位 ${ctx}`).toBe(0)
      }
    })
    expect(modes.size).toBe(2)
  })

  it('よくある間違い（頭金を引き忘れて 1 ÷ 回数）が選択肢に入る', () => {
    const rate = presence('equal', (q) => {
      const { n, total } = parse(q)
      return total === null ? 1 / n : total / n
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-installment/sequence（残額の何分のいくつ、と続く払い方）', () => {
  function parse(q: Question) {
    const k = Number(/(\d)回に分けて支払った/.exec(q.stem)![1])
    const j = Number(/。(\d)回目の支払/.exec(q.stem)![1])
    const total = /^総額([\d,]+)円の商品/.exec(q.stem)
    // 「1回目に総額の…」「2回目にその時点の残額の…」の分数を順に取り出す
    const parts = frs(q.stem)
    return { k, j, parts, total: total ? num(total[1]) : null }
  }

  it('1回ずつ「払う額」と「残り」をたどった j 回目の支払いが、正解と一致する（最後は残りすべて）', () => {
    const modes = new Set<string>()
    const ks = new Set<number>()
    run('sequence', (q, seed) => {
      const { k, j, parts, total } = parse(q)
      const ctx = `seed=${seed}\n${q.stem}\n${q.choices!.join(' / ')}`
      expect(parts.length, ctx).toBe(k - 1) // 最後の回の分数は問題文にない（残りすべて）
      ks.add(k)
      // シミュレーション: 残りを持ち歩きながら 1 回ずつ払う
      let rest = fr(1)
      const pays: Fr[] = []
      parts.forEach((f, i) => {
        const pay = i === 0 ? f : mul(rest, f) // 1回目は総額の f、以降はその時点の残額の f
        pays.push(pay)
        rest = sub(rest, pay)
      })
      pays.push(rest) // 最後は残りすべて
      expect(eq(pays.reduce(add, fr(0)), fr(1)), `全部の支払いの合計は総額 ${ctx}`).toBe(true)
      expect(pays.every((p) => p.n > 0), ctx).toBe(true)
      const want = pays[j - 1]
      if (total === null) {
        modes.add('frac')
        expect(eq(parseFr(correctText(q)), want), ctx).toBe(true)
      } else {
        modes.add('yen')
        const yen = (total * want.n) / want.d
        expect(Number.isInteger(yen), ctx).toBe(true)
        expect(val(correctText(q)), ctx).toBe(yen)
        // 全部の支払い額が整数の円になる
        for (const p of pays) expect(Number.isInteger((total * p.n) / p.d), ctx).toBe(true)
      }
    })
    expect(modes.size).toBe(2)
    expect([...ks].sort()).toEqual([3, 4])
  })

  it('よくある間違い（残額に対する割合を総額に対する割合と考えた値）が選択肢に入る', () => {
    const rate = presence('sequence', (q) => {
      const { k, j, parts, total } = parse(q)
      if (total !== null || j >= k) return null
      return frVal(parts[j - 1])
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-installment/fee（分割手数料）', () => {
  const parse = (q: Question) => {
    const m = /^代金([\d,]+)円の商品を分割払いで買う。購入時に頭金([\d,]+)円を支払い、残りには分割手数料として残額の(\d+)%が加算され、その合計を(\d+)回の均等払いで支払う。/.exec(q.stem)!
    const ask = q.stem.includes('1回の支払額') ? 'each' : q.stem.includes('支払総額') ? 'total' : 'fee'
    return { T: num(m[1]), X: num(m[2]), f: Number(m[3]), n: Number(m[4]), ask }
  }

  it('頭金 → 手数料つきの残りを n 回払い、と順に払った結果が、正解と一致する', () => {
    const asks = new Set<string>()
    run('fee', (q, seed) => {
      const { T, X, f, n, ask } = parse(q)
      asks.add(ask)
      const ctx = `seed=${seed}\n${q.stem}`
      const rest = T - X
      expect((rest * f) % 100, ctx).toBe(0)
      const fee = (rest * f) / 100 // 手数料は残額にかかる
      expect((rest + fee) % n, ctx).toBe(0)
      const each = (rest + fee) / n
      // 実際に払っていく
      const pays = [X, ...Array.from({ length: n }, () => each)]
      const sum = pays.reduce((a, b) => a + b, 0)
      expect(sum, ctx).toBe(T + fee)
      const want = ask === 'each' ? each : ask === 'total' ? sum : fee
      expect(val(correctText(q)), ctx).toBe(want)
    })
    expect(asks.size).toBe(3)
  })

  it('よくある間違い（手数料を忘れた／頭金を足し忘れた）が選択肢に入る', () => {
    const rate = presence('fee', (q) => {
      const { T, X, f, n, ask } = parse(q)
      const rest = T - X
      if (ask === 'each') return rest / n // 手数料を忘れた
      if (ask === 'total') return rest + (rest * f) / 100 // 頭金を足し忘れた
      return (T * f) / 100 // 手数料を代金全体にかけた
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-installment/months（毎月一定額ずつ払う）', () => {
  const parse = (q: Question) => {
    const m = /^総額([\d,]+)円の商品を分割払いで買う。購入時に頭金([\d,]+)円を支払い、残りを毎月([\d,]+)円ずつ支払う。/.exec(q.stem)!
    return { T: num(m[1]), X: num(m[2]), m: num(m[3]), ask: q.stem.includes('何回目') ? 'count' : 'last' }
  }

  it('毎月の支払いを1回ずつ引いていった結果（払い終える回と最後の額）が、正解と一致する', () => {
    const asks = new Set<string>()
    run('months', (q, seed) => {
      const { T, X, m, ask } = parse(q)
      asks.add(ask)
      let rest = T - X
      let month = 0
      let last = 0
      while (rest > 0) {
        last = Math.min(m, rest)
        rest -= last
        month++
      }
      const ctx = `seed=${seed}\n${q.stem}`
      expect(last, `最後の月は毎月の額に満たない ${ctx}`).toBeLessThan(m)
      expect(last).toBeGreaterThan(0)
      expect(val(correctText(q)), ctx).toBe(ask === 'count' ? month : last)
      if (ask === 'last') for (const c of q.choices!) expect(val(c), `最後の月の額は毎月の額以下 ${ctx}`).toBeLessThanOrEqual(m)
    })
    expect(asks.size).toBe(2)
  })

  it('よくある間違い（端数の最後の月を数え忘れた／毎月の額を答えた）が選択肢に入る', () => {
    const rate = presence('months', (q) => {
      const { T, X, m, ask } = parse(q)
      const rest = T - X
      return ask === 'count' ? Math.floor(rest / m) : m
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-installment/compare（一括払いと分割払いの総額の差）', () => {
  const parse = (q: Question) => {
    const m = /^定価([\d,]+)円の商品がある。現金で一括して払うと定価の(\d+)%引きになる。分割払いでは、購入時に頭金([\d,]+)円を支払い、残りを毎月([\d,]+)円の(\d+)回払いで支払う。/.exec(q.stem)!
    return { T: num(m[1]), d: Number(m[2]), X: num(m[3]), m: num(m[4]), n: Number(m[5]) }
  }

  it('一括払いの代金と、分割払いで実際に払う合計の差が、正解と一致する', () => {
    run('compare', (q, seed) => {
      const { T, d, X, m, n } = parse(q)
      const cash = T - (T * d) / 100
      expect(Number.isInteger(cash), `seed=${seed}`).toBe(true)
      let paid = X // 頭金
      for (let i = 0; i < n; i++) paid += m // 毎月
      expect(paid, `分割の方が高くなる seed=${seed}`).toBeGreaterThan(cash)
      expect(val(correctText(q)), `seed=${seed}\n${q.stem}`).toBe(paid - cash)
    })
  })

  it('よくある間違い（現金で買うときの割引額）が選択肢に入る', () => {
    const rate = presence('compare', (q) => {
      const { T, d } = parse(q)
      return (T * d) / 100
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})
