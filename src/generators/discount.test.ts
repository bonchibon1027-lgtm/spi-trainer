import { describe, expect, it, vi } from 'vitest'
import discount from './discount'
import { checkChain, checkStyle } from './arith-check'
import type { Question } from '../types'

// 料金の割引（nv-discount）の型を、問題文の数字から読み取り直して、別の方法（1人ずつ・1回ずつ数える）で解き直す。

const SEEDS = Array.from({ length: 600 }, (_, i) => i * 104729 + 31)
const gen = (id: string) => {
  const g = discount.find((x) => x.id === `nv-discount/${id}`)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const num = (s: string) => Number(s.replace(/,/g, ''))
/** 選択肢の "2,600円" "7人" "11回" の数 */
const val = (s: string) => num(s.replace(/[^\d,]/g, ''))
const correctText = (q: Question) => q.choices![q.answer as number]
const correct = (q: Question) => val(correctText(q))
/** 問題文の「2割引き」「25%引き」から割引率（%） */
function offRate(stem: string): number {
  const m = /(\d+)割引き|([\d.]+)%引き/.exec(stem)
  expect(m, stem).not.toBeNull()
  return m![1] ? Number(m![1]) * 10 : Number(m![2])
}
/** d% 引きの値段（整数円であること） */
function after(price: number, d: number): number {
  const v = (price * (100 - d)) / 100
  expect(Number.isInteger(v), `${price} の ${d}% 引きが整数でない`).toBe(true)
  return v
}
const run = (id: string, check: (q: Question, seed: number) => void) => {
  for (const seed of SEEDS) check(gen(id).generate(seed), seed)
}
/** よくある間違いの値が選択肢に入る割合 */
function presence(id: string, mistake: (q: Question) => number | null): number {
  let applicable = 0
  let found = 0
  run(id, (q) => {
    const m = mistake(q)
    if (m === null || m === correct(q)) return
    applicable++
    if (q.choices!.some((c) => val(c) === m)) found++
  })
  expect(applicable).toBeGreaterThan(100)
  return found / applicable
}

describe('式の検査（checkChain）自体の確認', () => {
  it('正しい式は通り、間違った式は見つかる', () => {
    expect(checkChain('1,200 × 11 = 13,200円')).toEqual([])
    expect(checkChain('会員利用 = 2,000 + 1,000 × 11 = 2,000 + 11,000 = 13,000円で、安い。')).toEqual([])
    expect(checkChain('{{3/4}} ÷ 6 = {{3/24}} = {{1/8}}')).toEqual([])
    expect(checkChain('0.5 × 100 = 50%')).toEqual([])
    expect(checkChain('P: 12,000 − 8,000 = 4,000円 多く払っている')).toEqual([])
    expect(checkChain('1,200 × 11 = 13,000円')).not.toEqual([])
    expect(checkChain('2,000 + 1,000 × 11 = 2,000 + 11,000 = 12,000円')).not.toEqual([])
    expect(checkChain('{{3/4}} ÷ 6 = {{3/12}}')).not.toEqual([])
    expect(checkChain('0.5 × 100 = 55%')).not.toEqual([])
    expect(checkChain('P: 12,000 − 8,000 = 3,000円')).not.toEqual([])
  })
})

describe('nv-discount 全般', () => {
  it('型が3つ以上あり、難易度1が2つ以上ある', () => {
    expect(discount.length).toBeGreaterThanOrEqual(3)
    expect(discount.length).toBeLessThanOrEqual(5)
    expect(discount.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(2)
  })

  for (const g of discount) {
    it(`${g.id}: 選択肢は5つ以上で値が重複せず、解説の最後は「答え: 正解」、体裁がそろっている`, () => {
      for (const seed of SEEDS) {
        const q = g.generate(seed)
        expect(q.choices!.length, `seed=${seed}`).toBeGreaterThanOrEqual(5)
        expect(q.explanation[q.explanation.length - 1], `seed=${seed}`).toBe(`答え: ${correctText(q)}`)
        const vals = q.choices!.map(val)
        expect(new Set(vals).size, `seed=${seed} ${q.choices!.join(' / ')}`).toBe(vals.length)
        // 金額は円、人数は人、回数は回で、すべて正の整数
        for (const c of q.choices!) expect(/^[1-9][\d,]*(円|人|回)$/.test(c), `seed=${seed} ${c}`).toBe(true)
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
      expect(stat.pairs).toBeGreaterThan(300) // 検査が空振りしていない
    })
  }

  it('問題の生成で Math.random を使っていない', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random は使わない（乱数は rng から取る）')
    })
    try {
      for (const g of discount) for (const seed of SEEDS.slice(0, 30)) g.generate(seed)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('nv-discount/coupon（回数券・まとめ買い）', () => {
  /** 問題文から (1回の値段, まとめの数, 必要な数, 安くなる額を聞くか) を読み取る */
  function parse(q: Question) {
    const ticket = q.stem.includes('回数券')
    const stem = q.stem
    const p = ticket ? num(/1回([\d,]+)円である/.exec(stem)![1]) : num(/を1[個本冊]([\d,]+)円で売っている/.exec(stem)![1])
    const [s, paid] = ticket
      ? /(\d+)回使える券が(\d+)回分の料金/.exec(stem)!.slice(1).map(Number)
      : /(\d+)[個本冊]を(\d+)[個本冊]分の代金で買える/.exec(stem)!.slice(1).map(Number)
    const need = Number((ticket ? /(\d+)回利用するとき/ : /ちょうど(\d+)[個本冊]を手に入れる/).exec(stem)![1])
    return { ticket, p, s, paid, need, save: stem.includes('安くなるか') }
  }

  it('必要な数をそろえる最も安い買い方（動的計画法で全部の買い方を比べる）が、正解と一致する', () => {
    const kinds = new Set<string>()
    run('coupon', (q, seed) => {
      const { ticket, p, s, paid, need, save } = parse(q)
      kinds.add(`${ticket}-${save}`)
      expect(paid, `seed=${seed}`).toBe(s - 1) // 「s 個を s−1 個分の代金」の形
      // best[i] = i 個以上を手に入れる最小の代金。1つずつ買う／まとめを買う、の全部の買い方を比べる
      const best: number[] = [0]
      for (let i = 1; i <= need; i++) best[i] = Math.min(best[i - 1] + p, best[Math.max(0, i - s)] + paid * p)
      const expected = save ? need * p - best[need] : best[need]
      expect(correct(q), `seed=${seed}\n${q.stem}`).toBe(expected)
    })
    expect(kinds.size).toBe(4) // 回数券／おまけ × 合計／安くなる額
  })

  it('よくある間違い（まとめを使わない場合の金額）が選択肢に入る', () => {
    const rate = presence('coupon', (q) => {
      const { p, need, save } = parse(q)
      return save ? null : need * p
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-discount/daytime（曜日・時間帯の割引）', () => {
  it('大人と子どもを1人ずつ足し上げた合計（または割引で安くなる額）が、正解と一致する', () => {
    const asks = new Set<boolean>()
    run('daytime', (q, seed) => {
      const m = /大人([\d,]+)円、子ども([\d,]+)円である/.exec(q.stem)!
      const [A, C] = [num(m[1]), num(m[2])]
      const d = offRate(q.stem)
      const [a, k] = /大人(\d+)人と子ども(\d+)人で/.exec(q.stem)!.slice(1).map(Number)
      const save = q.stem.includes('安くなるか')
      asks.add(save)
      let disc = 0
      let normal = 0
      for (let i = 0; i < a; i++) {
        disc += after(A, d)
        normal += A
      }
      for (let i = 0; i < k; i++) {
        disc += after(C, d)
        normal += C
      }
      expect(A, `seed=${seed}`).toBeGreaterThan(C)
      expect(correct(q), `seed=${seed}\n${q.stem}`).toBe(save ? normal - disc : disc)
    })
    expect(asks.size).toBe(2)
  })

  it('よくある間違い（割引を忘れた通常料金の合計）が選択肢に入る', () => {
    const rate = presence('daytime', (q) => {
      if (q.stem.includes('安くなるか')) return null
      const m = /大人([\d,]+)円、子ども([\d,]+)円である/.exec(q.stem)!
      const [a, k] = /大人(\d+)人と子ども(\d+)人で/.exec(q.stem)!.slice(1).map(Number)
      return num(m[1]) * a + num(m[2]) * k
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-discount/group（団体割引）', () => {
  /** 問題文から (通常の値段, 限度の人数, 割引率) */
  const rule = (stem: string) => {
    const m = /1人([\d,]+)円であるが、団体の人数が(\d+)人を超えると/.exec(stem)!
    return { p: num(m[1]), k: Number(m[2]), d: offRate(stem) }
  }

  it('1人ずつ料金を足し上げた合計（または合計から人数）が、正解と一致する', () => {
    const modes = new Set<string>()
    run('group', (q, seed) => {
      const { p, k, d } = rule(q.stem)
      const fee = (i: number) => (i <= k ? p : after(p, d)) // i 人目の料金
      const ctx = `seed=${seed}\n${q.stem}`
      if (q.stem.includes('この団体は何人か')) {
        modes.add('reverse')
        const T = num(/合計は([\d,]+)円であった/.exec(q.stem)![1])
        let sum = 0
        let people = 0
        while (sum < T) sum += fee(++people)
        expect(sum, `合計がぴったり一致する人数がある ${ctx}`).toBe(T)
        expect(correct(q), ctx).toBe(people)
      } else {
        modes.add('forward')
        const n = Number(/(\d+)人の団体が/.exec(q.stem)![1])
        expect(n, ctx).toBeGreaterThan(k)
        let sum = 0
        for (let i = 1; i <= n; i++) sum += fee(i)
        expect(correct(q), ctx).toBe(sum)
      }
    })
    expect(modes.size).toBe(2)
  })

  it('よくある間違い（全員に割引なしの合計）が選択肢に入る', () => {
    const rate = presence('group', (q) => {
      if (q.stem.includes('この団体は何人か')) return null
      return rule(q.stem).p * Number(/(\d+)人の団体が/.exec(q.stem)![1])
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-discount/split（分かれる場合とまとめる場合の差額）', () => {
  it('組ごと・全員でまとめた場合の料金を1人ずつ足し上げ、その差が正解と一致する', () => {
    const kinds = new Set<string>()
    run('split', (q, seed) => {
      const m = /1人([\d,]+)円であるが、(\d+)人を超えた分は/.exec(q.stem)!
      const [p, k] = [num(m[1]), Number(m[2])]
      const d = offRate(q.stem)
      const [n, a, b] = /(\d+)人のグループが、(\d+)人と(\d+)人の2組/.exec(q.stem)!.slice(1).map(Number)
      const ctx = `seed=${seed}\n${q.stem}`
      expect(a + b, ctx).toBe(n)
      expect(/(\d+)人全員でまとめて/.exec(q.stem)![1], ctx).toBe(String(n))
      const group = (size: number) => {
        let sum = 0
        for (let i = 1; i <= size; i++) sum += i <= k ? p : after(p, d)
        return sum
      }
      kinds.add(a > k ? 'big' : 'small')
      expect(group(a) + group(b), ctx).toBeGreaterThan(group(n)) // 分かれる方が高い
      expect(correct(q), ctx).toBe(group(a) + group(b) - group(n))
    })
    expect(kinds.size).toBe(2) // 片方の組が限度を超える場合も出る
  })

  it('よくある間違い（全員が割引になると考えた額）が選択肢に入る', () => {
    const rate = presence('split', (q) => {
      const m = /1人([\d,]+)円であるが、(\d+)人を超えた分は/.exec(q.stem)!
      const n = Number(/(\d+)人のグループが/.exec(q.stem)![1])
      const p = num(m[1])
      return n * (p - after(p, offRate(q.stem)))
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-discount/plan（料金プランの比較）', () => {
  it('回数を1回ずつ増やして比べた「初めて会員が安くなる回数」が、正解と一致する', () => {
    const kinds = new Set<string>()
    run('plan', (q, seed) => {
      const m = /が1回([\d,]+)円、.+?が月会費([\d,]+)円に加えて1回([\d,]+)円である/.exec(q.stem)!
      const [p, F, r] = [num(m[1]), num(m[2]), num(m[3])]
      let x = 1
      while (!(F + r * x < p * x)) x++
      expect(correct(q), `seed=${seed}\n${q.stem}`).toBe(x)
      // 1回少ないときは安くならない（同額か高い）
      expect(F + r * (x - 1) >= p * (x - 1)).toBe(true)
      kinds.add(F + r * (x - 1) === p * (x - 1) ? 'tie' : 'no-tie')
    })
    expect(kinds.size).toBe(2) // ちょうど同額になる回数がある場合も、ない場合も出る
  })

  it('よくある間違い（同額になる回数）が選択肢に入る', () => {
    const rate = presence('plan', (q) => {
      const m = /が1回([\d,]+)円、.+?が月会費([\d,]+)円に加えて1回([\d,]+)円である/.exec(q.stem)!
      return Math.floor(num(m[2]) / (num(m[1]) - num(m[3])))
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})
