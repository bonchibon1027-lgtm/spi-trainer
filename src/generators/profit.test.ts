import { describe, expect, it } from 'vitest'
import profit from './profit'
import type { Question } from '../types'

// 損益算（nv-profit）の型を、問題文の数字から別の方法で解き直して検算する。

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104729 + 13)
const gen = (id: string) => {
  const g = profit.find((x) => x.id === id)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const correctText = (q: Question) => q.choices![q.answer as number]
const num = (s: string) => Number(s.replace(/,/g, ''))
const val = (s: string) => parseFloat(s.replace(/,/g, '').replace(/^[^\d-]+/, ''))
/** "2割" → 20、"25%" → 25 */
const pct = (s: string) => (s.endsWith('割') ? Number(s.slice(0, -1)) * 10 : parseFloat(s))
const run = (id: string, check: (q: Question, seed: number) => void) => {
  for (const seed of SEEDS) check(gen(id).generate(seed), seed)
}

describe('nv-profit 全般', () => {
  it('markup のほかに3型以上あり、難易度1が2つ以上', () => {
    expect(profit.length).toBeGreaterThanOrEqual(4)
    expect(profit.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
    expect(profit.some((g) => g.id === 'nv-profit/markup')).toBe(true)
  })

  for (const g of profit) {
    it(`${g.id}: 選択肢は5つ以上で、解説の最後は「答え: 正解」、値の重複なし`, () => {
      for (const seed of SEEDS) {
        const q = g.generate(seed)
        expect(q.choices!.length, `seed=${seed}`).toBeGreaterThanOrEqual(5)
        expect(q.explanation[q.explanation.length - 1], `seed=${seed}`).toBe(`答え: ${correctText(q)}`)
        const vals = q.choices!.map(val)
        expect(new Set(vals).size, `seed=${seed} ${q.choices!.join(' / ')}`).toBe(vals.length)
      }
    })
  }
})

describe('nv-profit/cost-from-sale', () => {
  it('原価に利益を足すと売価（または利益額）になる', () => {
    run('nv-profit/cost-from-sale', (q, seed) => {
      const cost = val(correctText(q))
      let m = /原価の(\d+割|\d+%)の利益を見込んで売価をつけたところ、売価は([\d,]+)円になった/.exec(q.stem)
      if (m) {
        // 代入して確かめる
        expect(cost + (cost * pct(m[1])) / 100, `seed=${seed}`).toBe(num(m[2]))
        return
      }
      m = /原価の(\d+割|\d+%)の利益を見込んで売ったところ、利益は([\d,]+)円だった/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      expect((cost * pct(m![1])) / 100, `seed=${seed}`).toBe(num(m![2]))
    })
  })
})

describe('nv-profit/profit-rate', () => {
  it('利益率が正しい（原価基準）', () => {
    run('nv-profit/profit-rate', (q, seed) => {
      const m = /^原価([\d,]+)円の商品を([\d,]+)円で売った/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const [c, s] = [num(m![1]), num(m![2])]
      expect(val(correctText(q)), `seed=${seed}`).toBeCloseTo(((s - c) / c) * 100, 6)
    })
  })
})

describe('nv-profit/break-even', () => {
  it('原価と同じ値段になる値引き率・定価の増し率が正しい', () => {
    const kinds = new Set<string>()
    run('nv-profit/break-even', (q, seed) => {
      const ans = val(correctText(q))
      let m = /^原価([\d,]+)円の商品に、原価の(\d+割|\d+%)の利益を見込んで定価をつけた。.*定価の何%引きにすればよいか/.exec(q.stem)
      if (m) {
        kinds.add('discount')
        const list = num(m[1]) * (1 + pct(m[2]) / 100)
        // 定価からans%引いた値段が原価と同じになる（代入して確かめる）
        expect(list * (1 - ans / 100), `seed=${seed}`).toBeCloseTo(num(m[1]), 6)
        return
      }
      m = /^原価([\d,]+)円の商品に定価をつけたが、売れなかったので定価の([\d.]+)%引きで売ったところ、売価は原価と同じになった。この定価は、原価の何%増しか/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      kinds.add('markup')
      const cost = num(m![1])
      const d = Number(m![2])
      // 原価の ans% 増しの定価から d% 引くと原価に戻る
      expect(cost * (1 + ans / 100) * (1 - d / 100), `seed=${seed}`).toBeCloseTo(cost, 6)
    })
    expect(kinds.size).toBe(2)
  })
})

describe('nv-profit/bulk', () => {
  it('仕入れた商品を定価と値引きで売った総利益が正しい（1個ずつ売って集計する）', () => {
    run('nv-profit/bulk', (q, seed) => {
      const m = /原価([\d,]+)円の商品を(\d+)個仕入れ、原価の(\d+割|\d+%)の利益を見込んで定価をつけた。そのうち(\d+)個は定価で売れ、残りの(\d+)個は定価の(\d+割|\d+%)引きで売った/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const [c, N, u, a, b, d] = [num(m![1]), Number(m![2]), pct(m![3]), Number(m![4]), Number(m![5]), pct(m![6])]
      expect(a + b).toBe(N)
      const list = (c * (100 + u)) / 100
      const sale = (list * (100 - d)) / 100
      let total = 0
      for (let i = 0; i < N; i++) total += (i < a ? list : sale) - c
      expect(val(correctText(q)), `seed=${seed}`).toBe(total)
    })
  })
})
