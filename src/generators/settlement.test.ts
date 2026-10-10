import { describe, expect, it, vi } from 'vitest'
import settlement from './settlement'
import { checkChain, checkStyle } from './arith-check'
import type { Question } from '../types'

// 代金の精算（nv-settlement）の型を、問題文から「誰がいくら払ったか」と「誰がいくら負担するか」を読み取り直して検算する。
//   1. 人ごとの「払った額 − 負担額」を足すと 0 になる
//   2. 払う側と受け取る側の並べ方（精算の順番）をすべて変えて 1 人ずつ払っていき、
//      問われた 2 人の間で動く金額が、どの順番でも同じで、正解の選択肢と一致する
//   3. 精算を終えると、全員の最終的な支出が負担額と等しくなる

const SEEDS = Array.from({ length: 600 }, (_, i) => i * 104729 + 41)
const gen = (id: string) => {
  const g = settlement.find((x) => x.id === `nv-settlement/${id}`)
  if (!g) throw new Error(`no generator ${id}`)
  return g
}
const num = (s: string) => Number(s.replace(/,/g, ''))
const val = (s: string) => num(s.replace(/[^\d,]/g, ''))
const correctText = (q: Question) => q.choices![q.answer as number]
const correct = (q: Question) => val(correctText(q))
const run = (id: string, check: (q: Question, seed: number) => void) => {
  for (const seed of SEEDS) check(gen(id).generate(seed), seed)
}

type Nets = Record<string, number>

/** 順番を全部並べる */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]))
}

/**
 * 払う側（過不足がマイナス）と受け取る側（プラス）の並べ方をすべて試し、
 * 先頭どうしから順に払っていく方法で、2 人の間で動く金額の一覧を作る。
 * 戻り値は「並べ方ごとの、from → to の金額」。最終的な支出が負担額と等しいこともここで確かめる
 */
function flowsAllOrders(nets: Nets, owed: Nets, paid: Nets, from: string, to: string): number[] {
  const people = Object.keys(nets)
  expect(
    Object.values(nets).reduce((a, b) => a + b, 0),
    '全員の過不足を足すと 0',
  ).toBe(0)
  const debtors = people.filter((p) => nets[p] < 0)
  const creditors = people.filter((p) => nets[p] > 0)
  const out: number[] = []
  for (const ds of permutations(debtors)) {
    for (const cs of permutations(creditors)) {
      const need = new Map(ds.map((p) => [p, -nets[p]]))
      const want = new Map(cs.map((p) => [p, nets[p]]))
      const flow = new Map<string, number>()
      const outlay: Nets = Object.fromEntries(people.map((p) => [p, paid[p]]))
      for (const d of ds) {
        for (const c of cs) {
          const x = Math.min(need.get(d)!, want.get(c)!)
          if (x <= 0) continue
          need.set(d, need.get(d)! - x)
          want.set(c, want.get(c)! - x)
          flow.set(`${d}>${c}`, (flow.get(`${d}>${c}`) ?? 0) + x)
          outlay[d] += x // 払った
          outlay[c] -= x // 受け取った
        }
      }
      for (const p of people) expect(outlay[p], `精算後の${p}の支出は負担額と等しい`).toBe(owed[p])
      out.push(flow.get(`${from}>${to}`) ?? 0)
    }
  }
  return out
}

/** よくある間違いの値が選択肢に入る割合 */
function presence(id: string, mistake: (q: Question) => number | null): number {
  let applicable = 0
  let found = 0
  run(id, (q) => {
    const m = mistake(q)
    if (m === null || !(m > 0) || !Number.isInteger(m) || m === correct(q)) return
    applicable++
    if (q.choices!.some((c) => val(c) === m)) found++
  })
  expect(applicable).toBeGreaterThan(50)
  return found / applicable
}

// ---- 問題文の読み取り ----

/** 「Pが交通費12,000円、Qが…円」の払った額（出てこない人は 0 円） */
function parseThree(stem: string) {
  const head = stem.split('立て替えて支払った')[0]
  const paid: Nets = { P: 0, Q: 0, R: 0 }
  for (const m of head.matchAll(/([PQR])が[^PQR。、]*?([\d,]+)円/g)) paid[m[1]] += num(m[2])
  const total = paid.P + paid.Q + paid.R
  expect(total % 3, stem).toBe(0)
  const owed: Nets = { P: total / 3, Q: total / 3, R: total / 3 }
  const nets: Nets = { P: 0, Q: 0, R: 0 }
  for (const p of ['P', 'Q', 'R']) nets[p] = paid[p] - owed[p]
  return { paid, owed, nets, total }
}

describe('nv-settlement 全般', () => {
  it('型が3つ以上あり、難易度1が1つ以上ある', () => {
    expect(settlement.length).toBeGreaterThanOrEqual(3)
    expect(settlement.length).toBeLessThanOrEqual(5)
    expect(settlement.filter((g) => g.difficulty === 1).length).toBeGreaterThanOrEqual(1)
  })

  for (const g of settlement) {
    it(`${g.id}: 選択肢は5つ以上で重複せず、解説の最後は「答え: 正解」、体裁がそろっている`, () => {
      for (const seed of SEEDS) {
        const q = g.generate(seed)
        expect(q.choices!.length, `seed=${seed}`).toBeGreaterThanOrEqual(5)
        expect(q.explanation[q.explanation.length - 1], `seed=${seed}`).toBe(`答え: ${correctText(q)}`)
        expect(new Set(q.choices).size, `seed=${seed}`).toBe(q.choices!.length)
        for (const c of q.choices!) expect(/^[1-9][\d,]*円$/.test(c), `seed=${seed} ${c}`).toBe(true)
        // 精算の金額は 500 円単位（電卓なしで計算しやすい数）
        expect(correct(q) % 500, `seed=${seed}`).toBe(0)
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
      expect(stat.pairs).toBeGreaterThan(300)
    })
  }

  it('問題の生成で Math.random を使っていない', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random は使わない（乱数は rng から取る）')
    })
    try {
      for (const g of settlement) for (const seed of SEEDS.slice(0, 30)) g.generate(seed)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('nv-settlement/three（3人で立て替えた費用の精算）', () => {
  it('どの精算の順番でも、問われた金額が正解と一致する（2人の間の金額／1人の受け取り・支払いの合計）', () => {
    const asks = new Set<string>()
    run('three', (q, seed) => {
      const { paid, owed, nets } = parseThree(q.stem)
      const ctx = `seed=${seed}\n${q.stem}\n${q.choices!.join(' / ')}`
      const pair = /([PQR])が([PQR])に払う金額はいくらか/.exec(q.stem)
      if (pair) {
        asks.add('pair')
        const flows = flowsAllOrders(nets, owed, paid, pair[1], pair[2])
        expect(new Set(flows).size, `精算の順番によらず金額が決まる ${ctx}`).toBe(1)
        expect(flows[0], ctx).toBeGreaterThan(0)
        expect(correct(q), ctx).toBe(flows[0])
      } else {
        asks.add('net')
        const m = /([PQR])は、精算によって他の2人との間で、全部でいくら(受け取る|支払う)ことになるか/.exec(q.stem)!
        // 受け取る人は過不足がプラス、支払う人はマイナス（質問の言葉と一致している）
        expect(m[2] === '受け取る' ? nets[m[1]] > 0 : nets[m[1]] < 0, ctx).toBe(true)
        expect(correct(q), ctx).toBe(Math.abs(nets[m[1]]))
      }
    })
    expect(asks.size).toBe(2)
  })

  it('払っていない人（0円）が出る問題もある', () => {
    let zero = 0
    run('three', (q) => {
      if (q.stem.includes('何も支払っていない')) zero++
    })
    expect(zero).toBeGreaterThan(30)
  })

  it('よくある間違い（払う人の不足分と受け取る人の多く払った分の、答えではない方）が選択肢に入る', () => {
    const rate = presence('three', (q) => {
      const pair = /([PQR])が([PQR])に払う金額はいくらか/.exec(q.stem)
      if (!pair) return null
      const { nets } = parseThree(q.stem)
      return Math.max(-nets[pair[1]], nets[pair[2]])
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-settlement/borrow（以前の貸し借りを含めた精算）', () => {
  const parse = (q: Question) => {
    const { paid, owed, nets } = parseThree(q.stem)
    const loan = /以前に([PQR])が([PQR])から([\d,]+)円を借りたままになっていた/.exec(q.stem)!
    const [, borrower, lender, L] = loan
    const pair = /貸し借りの分も含めて、([PQR])が([PQR])に払う金額はいくらか/.exec(q.stem)!
    return { paid, owed, nets, borrower, lender, L: num(L), from: pair[1], to: pair[2] }
  }

  it('貸し借りの分を借りた人の払う額・貸した人の受け取る額に加えて精算しても、どの順番でも正解と一致する', () => {
    const dirs = new Set<string>()
    run('borrow', (q, seed) => {
      const { paid, owed, nets, borrower, lender, L, from, to } = parse(q)
      const ctx = `seed=${seed}\n${q.stem}\n${q.choices!.join(' / ')}`
      dirs.add(borrower === from ? 'from-owes' : 'to-owes')
      expect([borrower, lender].sort(), `貸し借りは質問の2人の間 ${ctx}`).toEqual([from, to].sort())
      // 借りた人は L だけ多く払い、貸した人は L だけ多く受け取る。負担額に L を足し引きして考える
      const nets2: Nets = { ...nets }
      nets2[borrower] -= L
      nets2[lender] += L
      const owed2: Nets = { ...owed }
      owed2[borrower] += L
      owed2[lender] -= L
      const flows = flowsAllOrders(nets2, owed2, paid, from, to)
      expect(new Set(flows).size, `精算の順番によらず金額が決まる ${ctx}`).toBe(1)
      expect(correct(q), ctx).toBe(flows[0])
    })
    expect(dirs.size).toBe(2) // 払う額が増える場合も、減る場合も出る
  })

  it('よくある間違い（貸し借りを忘れた金額）が選択肢に入る', () => {
    const rate = presence('borrow', (q) => {
      const { paid, owed, nets, from, to } = parse(q)
      const flows = flowsAllOrders(nets, owed, paid, from, to)
      return new Set(flows).size === 1 ? flows[0] : null
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-settlement/ratio（4人で割合を決めて分担する精算）', () => {
  const parse = (q: Question) => {
    const head = /費用の合計は([\d,]+)円で、(Pが全額を立て替えて支払った|Pが([\d,]+)円、Qが([\d,]+)円を立て替えて支払った)。/.exec(q.stem)!
    const T = num(head[1])
    const paid: Nets = { P: 0, Q: 0, R: 0, S: 0 }
    if (head[3]) {
      paid.P = num(head[3])
      paid.Q = num(head[4])
    } else paid.P = T
    const pct = /Pが(\d+)%、Qが(\d+)%、Rが(\d+)%、Sが(\d+)%の割合/.exec(q.stem)
    const ratio = /負担の比を ([\d:]+) として/.exec(q.stem)
    const w = (pct ? pct.slice(1).map(Number) : ratio![1].split(':').map(Number)) as number[]
    const sum = w.reduce((a, b) => a + b, 0)
    const owed: Nets = {}
    ;['P', 'Q', 'R', 'S'].forEach((p, i) => {
      expect((T * w[i]) % sum, q.stem).toBe(0)
      owed[p] = (T * w[i]) / sum
    })
    const nets: Nets = {}
    for (const p of ['P', 'Q', 'R', 'S']) nets[p] = paid[p] - owed[p]
    const pair = /([PQRS])が([PQRS])に払う金額はいくらか/.exec(q.stem)!
    return { T, paid, owed, nets, w, sum, from: pair[1], to: pair[2], pct: Boolean(pct), twoPayers: Boolean(head[3]) }
  }

  it('各自の負担額（割合）と立て替えた額から、どの順番でも正解と一致する', () => {
    const kinds = new Set<string>()
    run('ratio', (q, seed) => {
      const { paid, owed, nets, from, to, pct, twoPayers, w, T } = parse(q)
      const ctx = `seed=${seed}\n${q.stem}\n${q.choices!.join(' / ')}`
      kinds.add(`${pct ? '%' : '比'}-${twoPayers ? '2人' : '1人'}`)
      expect(w.length, ctx).toBe(4)
      expect(owed.P + owed.Q + owed.R + owed.S, ctx).toBe(T)
      const flows = flowsAllOrders(nets, owed, paid, from, to)
      expect(new Set(flows).size, `精算の順番によらず金額が決まる ${ctx}`).toBe(1)
      expect(flows[0], ctx).toBeGreaterThan(0)
      expect(correct(q), ctx).toBe(flows[0])
    })
    expect(kinds.size).toBe(4) // % と比、立て替えた人が1人／2人
  })

  it('よくある間違い（等しく分けた額）が選択肢に入る', () => {
    const rate = presence('ratio', (q) => {
      const { T } = parse(q)
      return T % 4 === 0 ? T / 4 : null
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})

describe('nv-settlement/partial（費用ごとに分担する人が違う精算）', () => {
  const parse = (q: Question) => {
    const paid: Nets = { P: 0, Q: 0, R: 0, S: 0 }
    const owed: Nets = { P: 0, Q: 0, R: 0, S: 0 }
    const items: { amount: number; payer: string; sharers: string[] }[] = []
    const re = /([^。\d]+?)([\d,]+)円は(4人全員で|([PQRS])を除く3人で|([PQRS])と([PQRS])の2人で)等しく分担することにし、([PQRS])が立て替えた。/g
    for (const m of q.stem.matchAll(re)) {
      const amount = num(m[2])
      const sharers = m[3] === '4人全員で' ? ['P', 'Q', 'R', 'S'] : m[4] ? ['P', 'Q', 'R', 'S'].filter((p) => p !== m[4]) : [m[5], m[6]]
      items.push({ amount, payer: m[7], sharers })
    }
    // 費用ごとに、分担する人が立て替えた人へ 1 人分を払う、と考える（2人の間の貸し借りの表）
    const debt: Record<string, Record<string, number>> = {}
    for (const p of ['P', 'Q', 'R', 'S']) debt[p] = { P: 0, Q: 0, R: 0, S: 0 }
    for (const it of items) {
      paid[it.payer] += it.amount
      for (const s of it.sharers) {
        owed[s] += it.amount / it.sharers.length
        if (s !== it.payer) debt[s][it.payer] += it.amount / it.sharers.length
      }
    }
    const nets: Nets = {}
    for (const p of ['P', 'Q', 'R', 'S']) nets[p] = paid[p] - owed[p]
    const pair = /([PQRS])が([PQRS])に払う金額はいくらか/.exec(q.stem)!
    return { items, paid, owed, nets, debt, from: pair[1], to: pair[2] }
  }

  it('費用ごとの負担と立て替えから、どの順番でも正解と一致する（3つの費用、4人／3人／2人で分担）', () => {
    const sizes = new Set<string>()
    run('partial', (q, seed) => {
      const { items, paid, owed, nets, debt, from, to } = parse(q)
      const ctx = `seed=${seed}\n${q.stem}\n${q.choices!.join(' / ')}`
      expect(items.length, ctx).toBe(3)
      sizes.add(items.map((it) => it.sharers.length).join(','))
      for (const it of items) {
        expect(it.sharers, `立て替えた人は分担する人の中にいる ${ctx}`).toContain(it.payer)
        expect(Number.isInteger(it.amount / it.sharers.length), ctx).toBe(true)
      }
      // 2人の間の貸し借りの表から出した人ごとの過不足も、払った額 − 負担額と同じ
      for (const p of ['P', 'Q', 'R', 'S']) {
        let net = 0
        for (const o of ['P', 'Q', 'R', 'S']) net += debt[o][p] - debt[p][o] // p が受け取る − p が払う
        expect(net, `${p} ${ctx}`).toBe(nets[p])
      }
      const flows = flowsAllOrders(nets, owed, paid, from, to)
      expect(new Set(flows).size, `精算の順番によらず金額が決まる ${ctx}`).toBe(1)
      expect(flows[0], ctx).toBeGreaterThan(0)
      expect(correct(q), ctx).toBe(flows[0])
    })
    expect([...sizes]).toEqual(['4,3,2']) // 全員／1人を除く3人／2人 の順に3つの費用
  })

  it('よくある間違い（相手が立て替えた費用のうち自分の分だけを答えた額）が選択肢に入る', () => {
    const rate = presence('partial', (q) => {
      const { items, from, to } = parse(q)
      return items.filter((it) => it.payer === to && it.sharers.includes(from)).reduce((s, it) => s + it.amount / it.sharers.length, 0)
    })
    expect(rate).toBeGreaterThan(0.6)
  })
})
