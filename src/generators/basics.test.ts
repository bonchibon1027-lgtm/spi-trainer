import { describe, expect, it } from 'vitest'
import basics from './basics'
import { gcd } from '../lib/math'
import type { Question } from '../types'

// 計算の基礎（nv-basics）の型を、問題文の数字から別の方法で解き直して検算する。
// 生成側の変数は使わず、問題文を読み取って計算し直す。

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104729 + 7)
const gen = (id: string) => {
  const g = basics.find((x) => x.id === id)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const correctText = (q: Question) => q.choices![q.answer as number]
const num = (s: string) => Number(s.replace(/,/g, ''))
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9

/** "{{3/8}}" / "0.35" / "35%" / "12" を数値にする（百分率は 0.35 の形で返す） */
function valueOf(s: string): number {
  const f = /^\{\{(\d+)\/(\d+)\}\}$/.exec(s)
  if (f) return Number(f[1]) / Number(f[2])
  if (s.endsWith('%')) return parseFloat(s) / 100
  return parseFloat(s)
}

/** "3割5分" "2割" "7分5厘" を百分率の数値にする */
function wariToPercent(s: string): number {
  const m = /^(?:(\d)割)?(?:(\d)分)?(?:(\d)厘)?$/.exec(s)
  if (!m) throw new Error(`歩合の形が不正: ${s}`)
  return 10 * Number(m[1] ?? 0) + Number(m[2] ?? 0) + 0.1 * Number(m[3] ?? 0)
}

describe('nv-basics 全般', () => {
  it('難易度1の型が5つ以上ある', () => {
    expect(basics.length).toBeGreaterThanOrEqual(5)
    for (const g of basics) expect(g.difficulty).toBe(1)
  })

  for (const g of basics) {
    it(`${g.id}: 選択肢は5つ以上で、解説の最後は「答え: 正解」`, () => {
      for (const seed of SEEDS) {
        const q = g.generate(seed)
        expect(q.choices!.length, `seed=${seed}`).toBeGreaterThanOrEqual(5)
        expect(q.explanation[q.explanation.length - 1], `seed=${seed}`).toBe(`答え: ${correctText(q)}`)
      }
    })
  }
})

describe('nv-basics/convert', () => {
  it('変換結果が正しく、間違いの選択肢は値が違う', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-basics/convert').generate(seed)
      const head = q.stem.split(' ')[0]
      const v = valueOf(head)
      const kind = q.stem.includes('分数で') ? 'frac' : q.stem.includes('百分率') ? 'pct' : 'dec'
      // 答えの値
      const c = correctText(q)
      if (kind === 'pct') expect(close(valueOf(c), v), `seed=${seed} ${q.stem} → ${c}`).toBe(true)
      else if (kind === 'dec') expect(close(parseFloat(c), v), `seed=${seed} ${q.stem} → ${c}`).toBe(true)
      else {
        expect(close(valueOf(c), v), `seed=${seed} ${q.stem} → ${c}`).toBe(true)
        const f = /^\{\{(\d+)\/(\d+)\}\}$/.exec(c)
        expect(f, `分数の形 seed=${seed}: ${c}`).not.toBeNull()
        expect(gcd(Number(f![1]), Number(f![2])), `約分済み seed=${seed}`).toBe(1)
      }
      // 間違いの選択肢は、同じ値であってはならない
      q.choices!.forEach((ch, i) => {
        if (i === q.answer) return
        expect(close(valueOf(ch), v), `seed=${seed} 同じ値の選択肢 ${ch}`).toBe(false)
      })
    }
  })
})

describe('nv-basics/percent-of', () => {
  it('Xのy%・全体の逆算が正しい', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-basics/percent-of').generate(seed)
      const c = num(correctText(q).replace(/[円人個]$/, ''))
      let m = /^([\d,]+)(?:円|人|個)の(\d+)%は何/.exec(q.stem)
      if (m) {
        expect(c * 100, `seed=${seed}`).toBe(num(m[1]) * num(m[2]))
        continue
      }
      m = /^全体の(\d+)%が([\d,]+)(?:円|人|個)であるとき/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      // 全体を総当たりで探す
      const y = num(m![1])
      const a = num(m![2])
      let found = -1
      for (let x = 1; x <= 20000; x++) if ((x * y) / 100 === a) found = x
      expect(c, `seed=${seed}`).toBe(found)
    }
  })
})

describe('nv-basics/percent-rate', () => {
  it('AはBの何%かが正しい', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-basics/percent-rate').generate(seed)
      const m = /^([\d,]+)(?:円|人|個)は([\d,]+)(?:円|人|個)の何%か/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const a = num(m![1])
      const b = num(m![2])
      const p = parseFloat(correctText(q))
      expect(p * b, `seed=${seed}`).toBeCloseTo(a * 100, 6)
    }
  })
})

describe('nv-basics/waribu', () => {
  it('歩合の変換・歩合の計算が正しい', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-basics/waribu').generate(seed)
      const c = correctText(q)
      let m = /^歩合で「(.+)」と表される割合は/.exec(q.stem)
      if (m) {
        expect(parseFloat(c), `seed=${seed}`).toBeCloseTo(wariToPercent(m[1]), 6)
        continue
      }
      m = /^([\d,]+)(?:円|人|個)の(.+?)は何(?:円|人|個)か/.exec(q.stem)
      if (m) {
        expect(num(c.replace(/[円人個]$/, '')), `seed=${seed}`).toBeCloseTo((num(m[1]) * wariToPercent(m[2])) / 100, 6)
        continue
      }
      m = /^(\d+)%を、歩合/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const p = Number(m![1])
      expect(wariToPercent(c), `seed=${seed}`).toBeCloseTo(p, 6)
      q.choices!.forEach((ch, i) => {
        if (i !== q.answer) expect(Math.abs(wariToPercent(ch) - p) > 1e-6, `seed=${seed} 同じ値の選択肢 ${ch}`).toBe(true)
      })
    }
  })
})

describe('nv-basics/ratio-simplify', () => {
  it('比の簡単化・比の値が正しい', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-basics/ratio-simplify').generate(seed)
      const c = correctText(q)
      const stem = q.stem
      let m: RegExpExecArray | null

      if ((m = /^AとBの比が (\d+):(\d+) のとき/.exec(stem))) {
        const v = Number(m[1]) / Number(m[2])
        expect(close(valueOf(c.replace('倍', '')), v), `seed=${seed}`).toBe(true)
        q.choices!.forEach((ch, i) => {
          if (i !== q.answer) expect(close(valueOf(ch.replace('倍', '')), v), `seed=${seed} 同じ値 ${ch}`).toBe(false)
        })
        continue
      }

      // 簡単な整数の比で答える型
      const [cp, cq] = c.split(':').map(Number)
      expect(gcd(cp, cq), `これ以上約分できない seed=${seed}`).toBe(1)
      let a: number
      let b: number
      if ((m = /^\{\{(\d+)\/(\d+)\}\} : \{\{(\d+)\/(\d+)\}\} を/.exec(stem))) {
        a = Number(m[1]) / Number(m[2])
        b = Number(m[3]) / Number(m[4])
      } else if ((m = /^([\d.]+):([\d.]+) を/.exec(stem))) {
        a = parseFloat(m[1])
        b = parseFloat(m[2])
      } else throw new Error(stem)
      expect(Math.abs(cp * b - cq * a) < 1e-9, `seed=${seed} ${stem} → ${c}`).toBe(true)
      // 間違いの選択肢のうち、比が同じものは「約分しきれていないもの」だけ
      q.choices!.forEach((ch, i) => {
        if (i === q.answer) return
        const [x, y] = ch.split(':').map(Number)
        const sameRatio = Math.abs(x * b - y * a) < 1e-9
        if (sameRatio) expect(gcd(x, y), `seed=${seed} 約分済みで同じ比 ${ch}`).toBeGreaterThan(1)
      })
    }
  })
})

describe('nv-basics/ratio-solve', () => {
  it('比例式・比の問題が正しい', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-basics/ratio-solve').generate(seed)
      const c = num(correctText(q).replace(/[円人個]$/, ''))
      let m: RegExpExecArray | null
      if ((m = /^x:(\d+)=(\d+):(\d+) のとき/.exec(q.stem))) {
        // x : K = p : q
        expect(c * Number(m[3]), `seed=${seed}`).toBe(Number(m[1]) * Number(m[2]))
      } else if ((m = /^(\d+):x=(\d+):(\d+) のとき/.exec(q.stem))) {
        // K : x = p : q
        expect(Number(m[1]) * Number(m[3]), `seed=${seed}`).toBe(c * Number(m[2]))
      } else if ((m = /^(.+?)と(.+?)の(.+?)の比は (\d+):(\d+) である。(.+?)が([\d,]+)(.)のとき、(.+?)は何/.exec(q.stem))) {
        const [, n1, n2, , p, qq, known, K, , target] = m
        const k = num(K)
        // known : target = (known側の数) : (target側の数)
        const kn = known === n1 ? Number(p) : Number(qq)
        const tn = known === n1 ? Number(qq) : Number(p)
        expect(target).toBe(known === n1 ? n2 : n1)
        expect(c * kn, `seed=${seed}`).toBe(k * tn)
      } else throw new Error(q.stem)
    }
  })
})

describe('nv-basics/fraction-calc', () => {
  it('分数の四則を有理数で計算し直して一致する', () => {
    const ops = new Set<string>()
    for (const seed of SEEDS) {
      const q = gen('nv-basics/fraction-calc').generate(seed)
      const m = /\n\{\{(\d+)\/(\d+)\}\} ([+−×÷]) \{\{(\d+)\/(\d+)\}\}$/.exec(q.stem)
      expect(m, q.stem).not.toBeNull()
      const [a, b, op, c, d] = [Number(m![1]), Number(m![2]), m![3], Number(m![4]), Number(m![5])]
      ops.add(op)
      let n: number
      let den: number
      if (op === '+') [n, den] = [a * d + c * b, b * d]
      else if (op === '−') [n, den] = [a * d - c * b, b * d]
      else if (op === '×') [n, den] = [a * c, b * d]
      else [n, den] = [a * d, b * c]
      expect(n, `seed=${seed} 答えは正`).toBeGreaterThan(0)
      const g = gcd(n, den)
      const want = den / g === 1 ? String(n / g) : `{{${n / g}/${den / g}}}`
      expect(correctText(q), `seed=${seed} ${m![0]}`).toBe(want)
      // 間違いの選択肢は値が違う
      q.choices!.forEach((ch, i) => {
        if (i !== q.answer) expect(close(valueOf(ch), n / den), `seed=${seed} 同じ値 ${ch}`).toBe(false)
      })
    }
    expect(ops.size).toBe(4)
  })
})
