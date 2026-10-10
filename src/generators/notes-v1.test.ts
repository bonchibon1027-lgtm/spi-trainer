import { describe, expect, it } from 'vitest'
import { noteFiles } from '../content'
import { noteTexts, validateNote } from '../lib/validate'
import type { Figure, Note } from '../types'
import { checkCalc, checkChain } from './arith-check'

// v1.0 で追加した4分野（料金の割引・分割払い・代金の精算・表の読み取り）の解き方ノートの検査。
//   1. ノートの形（validateNote）と、型・図・例題の数がそろっているか
//   2. 本文の途中式（A = B = C）と、計算式（calc）の数値が合っているか（pitfalls はわざと誤った式を書くので除く）
//   3. 例題の答えを、問題文の数字から別の方法で計算し直した値と照らし合わせる

const TOPICS = ['nv-discount', 'nv-installment', 'nv-settlement', 'nv-table'] as const

const figuresOf = (note: Note, pattern: number): Figure[] => {
  const ex = note.patterns[pattern].example
  return [...(ex.figure ? [ex.figure] : []), ...ex.steps.flatMap((s) => (s.figure ? [s.figure] : []))]
}

describe('式の検査（checkCalc）自体の確認', () => {
  it('正しい式は通り、間違った式は見つかる', () => {
    expect(checkCalc('1,800 × 0.8 = 1,440円、1,000 × 0.8 = 800円')).toEqual([])
    expect(checkCalc('100% − 20% = 80% = 0.8')).toEqual([])
    expect(checkCalc('{{3/4}} ÷ 6 = {{3/24}} = {{1/8}}')).toEqual([])
    expect(checkCalc('Pは 12,000 − 5,000 = 7,000円 多い、Rは 5,000 − 0 = 5,000円 足りない')).toEqual([])
    expect(checkCalc('1,800 × 0.8 = 1,400円')).not.toEqual([])
    expect(checkCalc('{{3/4}} ÷ 6 = {{3/12}}')).not.toEqual([])
    expect(checkCalc('7,000 − 2,000 − 5,000 = 1')).not.toEqual([])
  })
})

describe('v1.0 の解き方ノート', () => {
  for (const topic of TOPICS) {
    describe(topic, () => {
      const note = noteFiles[topic]

      it('ノートがあり、形が正しい（型が4つ以上）', () => {
        expect(note, `${topic}.json がある`).toBeDefined()
        expect(note.topic).toBe(topic)
        expect(validateNote(note)).toEqual([])
        expect(note.patterns.length).toBeGreaterThanOrEqual(4)
        expect(note.formulas.length).toBeGreaterThanOrEqual(3)
        expect(note.pitfalls.length).toBeGreaterThanOrEqual(4)
      })

      it('型ごとに、具体的な数字の例題があり、図が付いている。手順は text と calc に分かれている', () => {
        note.patterns.forEach((p, i) => {
          expect(figuresOf(note, i).length, `${p.title} に図がある`).toBeGreaterThanOrEqual(1)
          expect(p.example.steps.length, `${p.title} の手順`).toBeGreaterThanOrEqual(3)
          expect(p.example.steps.filter((s) => s.calc).length, `${p.title} に計算式がある`).toBeGreaterThanOrEqual(2)
          expect(/\d/.test(p.example.stem) || Boolean(p.example.table), `${p.title} の例題に数字（または数字の表）がある`).toBe(true)
          expect(p.point, `${p.title} にコツがある`).toBeTruthy()
        })
      })

      it('本文の途中式の数値が合っている（pitfalls を除く）', () => {
        const stat = { pairs: 0 }
        for (const line of noteTexts({ ...note, pitfalls: [] })) {
          // 「。」「、」で区切った1文ずつ調べる
          for (const clause of line.split(/[。、]/)) {
            expect(checkChain(clause, stat), `${topic}\n${line}`).toEqual([])
          }
        }
        expect(stat.pairs).toBeGreaterThan(20)
      })

      it('計算式（calc）の数値が、単位をはずしても合っている', () => {
        const calcs = note.patterns.flatMap((p) => p.example.steps.flatMap((s) => (s.calc ? [s.calc] : [])))
        expect(calcs.length, `${topic} に calc がある`).toBeGreaterThan(10)
        for (const calc of calcs) expect(checkCalc(calc), `${topic}\n${calc}`).toEqual([])
      })

      it('公式の例の式も合っている', () => {
        for (const f of note.formulas) {
          for (const clause of f.example.split(/[。、]/)) {
            expect(checkChain(clause), `${topic} ${f.label}\n${f.example}`).toEqual([])
            expect(checkCalc(clause.replace(/^.*→/, '')), `${topic} ${f.label}\n${f.example}`).toEqual([])
          }
        }
      })

      it('図の中の表の強調（highlight）が表の中を指している', () => {
        note.patterns.forEach((_, i) => {
          for (const f of figuresOf(note, i)) {
            if (f.type !== 'table') continue
            for (const [r, c] of f.highlight ?? []) {
              expect(f.table.rows[r]?.[c], `${topic} パターン${i + 1} の highlight [${r},${c}]`).toBeDefined()
            }
          }
        })
      })
    })
  }

  it('nv-table: 例題には表がつき、手順の図の表は例題の表と同じ。型は generators の5つに対応している', () => {
    const note = noteFiles['nv-table']
    expect(note.patterns.length).toBe(5)
    note.patterns.forEach((p, i) => {
      expect(p.example.table, `パターン${i + 1} に例題の表`).toBeDefined()
      const tables = figuresOf(note, i).filter((f): f is Extract<Figure, { type: 'table' }> => f.type === 'table')
      expect(tables.length, `パターン${i + 1} に強調つきの表の図`).toBeGreaterThanOrEqual(1)
      for (const t of tables) {
        expect(t.table, `パターン${i + 1}`).toEqual(p.example.table)
        expect((t.highlight ?? []).length, `パターン${i + 1} の highlight`).toBeGreaterThanOrEqual(1)
      }
    })
    // 構成比・何倍・増加率・構成比と人数・2年分（table.ts の share / times / growth / composition / two-year）
    const titles = note.patterns.map((p) => p.title).join(' / ')
    for (const word of ['合計に占める割合', '何倍', '増加率', '構成比', '2年分']) expect(titles, titles).toContain(word)
  })

  it('nv-settlement: 例題の表で、払った額 − 負担額 の列が正しい', () => {
    const note = noteFiles['nv-settlement']
    const n = (s: string) => Number(s.replace(/[^\d]/g, ''))
    const sign = (s: string) => (s.startsWith('−') ? -1 : 1)
    let checked = 0
    note.patterns.forEach((_, i) => {
      for (const f of figuresOf(note, i)) {
        if (f.type !== 'table') continue
        let sum = 0
        for (const row of f.table.rows) {
          const net = sign(row[3]) * n(row[3])
          // 列の並びは「払った額」「負担額」の順の表と、「負担額」「払った額」の順の表がある
          const [a, b] = f.table.headers[1] === '払った額' ? [n(row[1]), n(row[2])] : [n(row[2]), n(row[1])]
          expect(a - b, `${row.join(' ')}`).toBe(net)
          sum += net
          checked++
        }
        expect(sum, '過不足の合計は0').toBe(0)
      }
    })
    expect(checked).toBeGreaterThanOrEqual(7)
  })
})

// ---- 例題の答えを、問題文の数字から別の方法で求め直す ----

/** 答えの文字列の数値（"18,400円" → 18400、"{{1/8}}" → 0.125、"7回目（…）" → 7、"25%" → 25） */
function answerValue(s: string): number {
  const f = /^\{\{(\d+)\/(\d+)\}\}/.exec(s)
  if (f) return Number(f[1]) / Number(f[2])
  return Number(/^[\d,.]+/.exec(s)![0].replace(/,/g, ''))
}

/** 1人ずつ料金を足し上げる（限度を超えた人から割引） */
function crowdFee(people: number, limit: number, price: number, discountPct: number): number {
  let sum = 0
  for (let i = 1; i <= people; i++) sum += i <= limit ? price : (price * (100 - discountPct)) / 100
  return sum
}

describe('v1.0 のノートの例題の答え（別の方法で計算し直す）', () => {
  const ans = (topic: string, i: number) => answerValue(noteFiles[topic].patterns[i].example.answer)

  it('nv-discount', () => {
    // 回数券: 25回分を、1回ずつ買う／11回券（10回分の料金）を買う、の全部の組み合わせで最安を探す
    const best: number[] = [0]
    for (let i = 1; i <= 25; i++) best[i] = Math.min(best[i - 1] + 800, best[Math.max(0, i - 11)] + 800 * 10)
    expect(ans('nv-discount', 0)).toBe(best[25])
    // 割引日: 大人2人・子ども3人を1人ずつ足す
    let total = 0
    for (let i = 0; i < 2; i++) total += (1800 * 80) / 100
    for (let i = 0; i < 3; i++) total += (1000 * 80) / 100
    expect(ans('nv-discount', 1)).toBe(total)
    expect(ans('nv-discount', 2)).toBe(crowdFee(32, 20, 1000, 20))
    expect(ans('nv-discount', 3)).toBe(crowdFee(15, 20, 1000, 20) * 2 - crowdFee(30, 20, 1000, 20))
    let x = 1
    while (!(2700 + 800 * x < 1200 * x)) x++
    expect(ans('nv-discount', 4)).toBe(x)
    // 団体割引のコツの例: 合計36,000円なら40人
    let people = 0
    let sum = 0
    while (sum < 36000) sum += crowdFee(++people, 20, 1000, 20) - crowdFee(people - 1, 20, 1000, 20)
    expect([sum, people]).toEqual([36000, 40])
  })

  it('nv-installment', () => {
    // 総額を1として、頭金 1/4 のあと、残りを6回払いで払い切る
    const each = (1 - 1 / 4) / 6
    expect(ans('nv-installment', 0)).toBeCloseTo(each, 12)
    expect(1 / 4 + each * 6).toBeCloseTo(1, 12)
    // 金額: 72,000円、頭金 1/3、残り8回
    expect(ans('nv-installment', 1)).toBe((72000 - 72000 / 3) / 8)
    // 1回目 1/2、2回目は残りの 1/3、3回目は残りすべて
    let rest = 1
    const pays: number[] = []
    pays.push(1 / 2)
    rest -= 1 / 2
    pays.push(rest / 3)
    rest -= rest / 3
    pays.push(rest)
    expect(pays.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(ans('nv-installment', 2)).toBeCloseTo(pays[2], 12)
    expect(60000 * (pays[2])).toBeCloseTo(20000, 6)
    // 手数料: 残り60,000円に5%、6回
    expect(ans('nv-installment', 3)).toBe((60000 + (60000 * 5) / 100) / 6)
    // 毎月12,000円ずつ: 1回ずつ払っていく
    let remain = 95000 - 15000
    let month = 0
    let last = 0
    while (remain > 0) {
      last = Math.min(12000, remain)
      remain -= last
      month++
    }
    expect([ans('nv-installment', 4), last]).toEqual([month, 8000])
    // 一括払いと分割払い
    expect(ans('nv-installment', 5)).toBe(30000 + 11000 * 6 - (90000 * 95) / 100)
  })

  it('nv-settlement', () => {
    const rule = (paid: Record<string, number>, owed: Record<string, number>, from: string, to: string, loan?: [string, string, number]) => {
      const nets: Record<string, number> = {}
      for (const p of Object.keys(paid)) nets[p] = paid[p] - owed[p]
      if (loan) {
        nets[loan[0]] -= loan[2] // 借りた人は払う額が増える
        nets[loan[1]] += loan[2] // 貸した人は受け取る額が増える
      }
      expect(Object.values(nets).reduce((a, b) => a + b, 0)).toBe(0)
      const creditors = Object.keys(nets).filter((p) => nets[p] > 0)
      const debtors = Object.keys(nets).filter((p) => nets[p] < 0)
      // 受け取る人が1人だけなら不足分を払い、払う人が1人だけなら相手の受け取り分を払う
      if (creditors.length === 1 && creditors[0] === to) return -nets[from]
      if (debtors.length === 1 && debtors[0] === from) return nets[to]
      throw new Error('金額が1つに決まらない')
    }
    expect(ans('nv-settlement', 0)).toBe(rule({ P: 12000, Q: 3000, R: 0 }, { P: 5000, Q: 5000, R: 5000 }, 'R', 'P'))
    expect(ans('nv-settlement', 1)).toBe(
      rule({ P: 9000, Q: 3000, R: 0 }, { P: 4000, Q: 4000, R: 4000 }, 'R', 'P', ['R', 'P', 1000]),
    )
    // 貸し借りの向きが逆なら 3,000円（コツの文）
    expect(rule({ P: 9000, Q: 3000, R: 0 }, { P: 4000, Q: 4000, R: 4000 }, 'R', 'P', ['P', 'R', 1000])).toBe(3000)
    expect(ans('nv-settlement', 2)).toBe(
      rule({ P: 16000, Q: 0, R: 0, S: 0 }, { P: 6000, Q: 4000, R: 4000, S: 2000 }, 'R', 'P'),
    )
    // 費用ごとに分担する人が違う: 宿泊費 8,000 は4人、夕食代 3,000 は S 以外の3人
    const owed: Record<string, number> = { P: 0, Q: 0, R: 0, S: 0 }
    for (const p of ['P', 'Q', 'R', 'S']) owed[p] += 8000 / 4
    for (const p of ['P', 'Q', 'R']) owed[p] += 3000 / 3
    expect(ans('nv-settlement', 3)).toBe(rule({ P: 8000, Q: 3000, R: 0, S: 0 }, owed, 'R', 'P'))
  })

  it('nv-table', () => {
    expect(ans('nv-table', 0)).toBeCloseTo((160 / 800) * 100, 9) // 構成比
    expect(ans('nv-table', 1)).toBeCloseTo(300 / 120, 9) // 何倍
    expect(ans('nv-table', 2)).toBeCloseTo(((1000 - 800) / 800) * 100, 9) // 増加率
    expect(ans('nv-table', 3)).toBeCloseTo(((72 * 100) / 30) * 0.35, 9) // 構成比と人数
    expect(ans('nv-table', 4)).toBe((1000 * 15) / 100 - (800 * 10) / 100) // 2年分
    // 例題の表の合計の行・構成比の合計
    const t0 = noteFiles['nv-table'].patterns[0].example.table!
    expect(t0.rows.slice(0, 4).reduce((s, r) => s + Number(r[1]), 0)).toBe(Number(t0.rows[4][1]))
    const t3 = noteFiles['nv-table'].patterns[3].example.table!
    expect(t3.rows.slice(0, 4).reduce((s, r) => s + Number(r[1]), 0)).toBe(Number(t3.rows[4][1]))
  })
})
