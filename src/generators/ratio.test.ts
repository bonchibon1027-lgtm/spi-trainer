import { describe, expect, it } from 'vitest'
import ratio from './ratio'
import type { Question } from '../types'

// 割合と比（nv-ratio）の型を、問題文の数字から別の方法で解き直して検算する。

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104729 + 11)
const gen = (id: string) => {
  const g = ratio.find((x) => x.id === id)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const correctText = (q: Question) => q.choices![q.answer as number]
const num = (s: string) => Number(s.replace(/,/g, ''))
/** "1,200円" "37.5%" "300g" "18人" → 数値 */
const val = (s: string) => parseFloat(s.replace(/,/g, '').replace(/^[^\d-]+/, ''))
const run = (id: string, check: (q: Question, seed: number) => void) => {
  for (const seed of SEEDS) check(gen(id).generate(seed), seed)
}

describe('nv-ratio 全般', () => {
  it('難易度1の型が2つ以上、全体で4つ以上ある', () => {
    expect(ratio.length).toBeGreaterThanOrEqual(4)
    expect(ratio.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
  })

  for (const g of ratio) {
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

describe('nv-ratio/split', () => {
  it('比で分けた取り分・差が正しい', () => {
    run('nv-ratio/split', (q, seed) => {
      const c = val(correctText(q))
      let m = /^([\d,]+)(?:円|個のあめ)を、.+?で ([\d:]+) の割合で分けた。([ABC])さんの取り分は(?:いくら|何個)か。$/.exec(q.stem)
      if (m) {
        const total = num(m[1])
        const parts = m[2].split(':').map(Number)
        const sum = parts.reduce((a, b) => a + b, 0)
        const idx = 'ABC'.indexOf(m[3])
        // 総当たり: 1にあたる大きさ g を探す
        let g = 0
        for (let x = 1; x <= total; x++) if (x * sum === total) g = x
        expect(g).toBeGreaterThan(0)
        expect(c, `seed=${seed} ${q.stem}`).toBe(g * parts[idx])
        return
      }
      m = /^([\d,]+)(?:円|個のあめ)を、.+?で ([\d:]+) の割合で分けた。([ABC])さんの取り分は、([ABC])さんの取り分より(?:いくら|何個)多いか。$/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const total = num(m![1])
      const parts = m![2].split(':').map(Number)
      const sum = parts.reduce((a, b) => a + b, 0)
      const diff = (total * (parts['ABC'.indexOf(m![3])] - parts['ABC'.indexOf(m![4])])) / sum
      expect(diff).toBeGreaterThan(0)
      expect(c, `seed=${seed} ${q.stem}`).toBe(diff)
    })
  })
})

describe('nv-ratio/part-whole', () => {
  it('比と一部の量から求めた全体・残り・差が正しい', () => {
    run('nv-ratio/part-whole', (q, seed) => {
      const c = val(correctText(q))
      let m = /^ある学年のA組、B組、C組の人数の比は ([\d:]+) で、([ABC])組は([\d,]+)人である。この学年の生徒は全部で何人か。$/.exec(q.stem)
      if (m) {
        const parts = m[1].split(':').map(Number)
        const known = parts['ABC'.indexOf(m[2])]
        const total = (num(m[3]) * parts.reduce((a, b) => a + b, 0)) / known
        expect(c, `seed=${seed}`).toBe(total)
        return
      }
      m = /([^のと、。]+)と([^のと、。]+)の[^の]+の比は (\d+):(\d+) で、(.+?)は([\d,]+)(.)である。(.+)$/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const [, n1, n2, p, qq, known, K, , tail] = m!
      const kp = known === n1 ? Number(p) : Number(qq)
      const op = known === n1 ? Number(qq) : Number(p)
      const k = num(K)
      expect(known === n1 || known === n2).toBe(true)
      if (tail.endsWith('全部で何人か。') || tail.endsWith('全部で何個か。')) {
        expect(c, `seed=${seed}`).toBe((k * (kp + op)) / kp)
      } else if (/は何.か。$/.test(tail)) {
        expect(c, `seed=${seed}`).toBe((k * op) / kp)
      } else {
        // 「AはBより何〜多いか」
        expect(c, `seed=${seed}`).toBe((k * Math.abs(kp - op)) / kp)
      }
    })
  })
})

describe('nv-ratio/ratio-of-ratio', () => {
  it('割合の割合が正しい', () => {
    run('nv-ratio/ratio-of-ratio', (q, seed) => {
      const c = val(correctText(q))
      const pcts = [...q.stem.matchAll(/(\d+)%/g)].map((x) => Number(x[1]))
      const a = pcts[0]
      const b = pcts[1]
      if (q.stem.endsWith('全体の何%か。') || /の何%か。$/.test(q.stem)) {
        expect(c, `seed=${seed}`).toBeCloseTo((a * b) / 100, 6)
      } else if (q.stem.includes('は全部で何')) {
        const n = num(/(?:である|は)([\d,]+)(?:人|個)である。.+は全部で何/.exec(q.stem)?.[1] ?? /([\d,]+)(?:人|個)である。[^。]+は全部で何/.exec(q.stem)![1])
        // 全体を総当たりで探す
        let found = -1
        for (let t = 1; t <= 5000; t++) if ((t * a * b) / 10000 === n) found = t
        expect(c, `seed=${seed} ${q.stem}`).toBe(found)
      } else {
        const T = num(/は([\d,]+)(?:人|個)である。そのうち/.exec(q.stem)![1])
        expect(c, `seed=${seed}`).toBe((T * a * b) / 10000)
      }
    })
  })
})

describe('nv-ratio/rate-change', () => {
  it('増減率の計算・逆算・増減率が正しい', () => {
    const kinds = new Set<string>()
    run('nv-ratio/rate-change', (q, seed) => {
      const c = val(correctText(q))
      let m = /前年が([\d,]+).+?で、今年は前年比(\d+)%(増|減)であった。今年の/.exec(q.stem)
      if (m) {
        kinds.add('forward')
        const X = num(m[1])
        const p = Number(m[2]) * (m[3] === '増' ? 1 : -1)
        expect(c, `seed=${seed}`).toBeCloseTo(X * (1 + p / 100), 6)
        return
      }
      m = /今年が([\d,]+).+?で、前年比(\d+)%(増|減)であった。前年の/.exec(q.stem)
      if (m) {
        kinds.add('back')
        const Y = num(m[1])
        const p = Number(m[2]) * (m[3] === '増' ? 1 : -1)
        // 前年を総当たりで探す: 前年 × (1 + p/100) = 今年
        let found = -1
        for (let x = 1; x <= 5000; x++) if ((x * (100 + p)) / 100 === Y) found = x
        expect(c, `seed=${seed} ${q.stem}`).toBe(found)
        return
      }
      m = /前年が([\d,]+).+?、今年が([\d,]+).+?であった。今年は前年に対して何%(増加|減少)したか/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      kinds.add('rate')
      const X = num(m![1])
      const Y = num(m![2])
      expect(m![3] === '増加' ? Y > X : Y < X).toBe(true)
      expect(c, `seed=${seed}`).toBeCloseTo((Math.abs(Y - X) / X) * 100, 6)
    })
    expect(kinds.size).toBe(3)
  })
})

describe('nv-ratio/rate-twice', () => {
  it('連続する増減が正しい', () => {
    run('nv-ratio/rate-twice', (q, seed) => {
      const c = val(correctText(q))
      const m = /まず(\d+)%(値上げ|値下げ)し、そのあと(\d+)%(値上げ|値下げ)した。/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const f1 = 1 + (m![2] === '値上げ' ? 1 : -1) * (Number(m![1]) / 100)
      const f2 = 1 + (m![4] === '値上げ' ? 1 : -1) * (Number(m![3]) / 100)
      const X = /もとの値段が([\d,]+)円のとき/.exec(q.stem)
      if (X) expect(c, `seed=${seed}`).toBeCloseTo(num(X[1]) * f1 * f2, 6)
      else expect(c, `seed=${seed}`).toBeCloseTo(100 * f1 * f2, 6)
    })
  })
})

describe('nv-ratio/brine-basic', () => {
  it('食塩水の濃度の基本が正しい', () => {
    const kinds = new Set<string>()
    run('nv-ratio/brine-basic', (q, seed) => {
      const c = val(correctText(q))
      let m = /^濃度(\d+)%の食塩水([\d,]+)gには、食塩が何g/.exec(q.stem)
      if (m) {
        kinds.add('salt')
        expect(c, `seed=${seed}`).toBeCloseTo((num(m[2]) * Number(m[1])) / 100, 6)
        return
      }
      m = /^食塩([\d,]+)gを水([\d,]+)gに溶かして/.exec(q.stem)
      if (m) {
        kinds.add('conc')
        expect(c, `seed=${seed}`).toBeCloseTo((num(m[1]) / (num(m[1]) + num(m[2]))) * 100, 6)
        return
      }
      m = /^濃度(\d+)%の食塩水([\d,]+)gに、水([\d,]+)gを加えた/.exec(q.stem)
      if (m) {
        kinds.add('dilute')
        const salt = (num(m[2]) * Number(m[1])) / 100
        expect(c, `seed=${seed}`).toBeCloseTo((salt / (num(m[2]) + num(m[3]))) * 100, 6)
        return
      }
      m = /^濃度(\d+)%の食塩水([\d,]+)gに水を加えて、濃度(\d+)%の食塩水にしたい/.exec(q.stem)
      if (m) {
        kinds.add('add')
        // 加えたあとの濃度が目標になる水の量
        const salt = (num(m[2]) * Number(m[1])) / 100
        expect((salt / (num(m[2]) + c)) * 100, `seed=${seed}`).toBeCloseTo(Number(m[3]), 6)
        return
      }
      m = /^濃度(\d+)%の食塩水([\d,]+)gから水を蒸発させて、濃度(\d+)%の食塩水にしたい/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      kinds.add('evap')
      const salt = (num(m![2]) * Number(m![1])) / 100
      expect((salt / (num(m![2]) - c)) * 100, `seed=${seed}`).toBeCloseTo(Number(m![3]), 6)
    })
    expect(kinds.size).toBe(5)
  })
})

describe('nv-ratio/brine-mix', () => {
  it('混ぜたあとの濃度・混ぜる量が正しい', () => {
    const kinds = new Set<string>()
    run('nv-ratio/brine-mix', (q, seed) => {
      const c = val(correctText(q))
      let m = /^濃度(\d+)%の食塩水([\d,]+)gと、濃度(\d+)%の食塩水([\d,]+)gを混ぜた/.exec(q.stem)
      if (m) {
        kinds.add('mix')
        const [x, A, y, B] = [Number(m[1]), num(m[2]), Number(m[3]), num(m[4])]
        expect(c, `seed=${seed}`).toBeCloseTo((x * A + y * B) / (A + B), 6)
        return
      }
      m = /^濃度(\d+)%の食塩水([\d,]+)gに、濃度(\d+)%の食塩水を混ぜて、濃度(\d+)%の食塩水を作りたい/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      kinds.add('balance')
      const [x, A, y, z] = [Number(m![1]), num(m![2]), Number(m![3]), Number(m![4])]
      expect(x < z && z < y).toBe(true)
      // 混ぜた量 c を入れて、濃度が z% になるか（代入して確かめる）
      expect((A * x + c * y) / (A + c), `seed=${seed}`).toBeCloseTo(z, 6)
    })
    expect(kinds.size).toBe(2)
  })
})
