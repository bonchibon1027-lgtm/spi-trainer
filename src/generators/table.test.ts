import { describe, expect, it } from 'vitest'
import generators, { drawComp, drawGrowth, drawShare, drawTimes, drawTwoYear, shareValues, timesValues } from './table'
import { createRng } from '../lib/rng'
import { correctChoiceText } from '../lib/validate'
import type { Question } from '../types'

// 表の読み取り（nv-table）の検証。
// 各型は最初に draw(rng) で数字を決めるので、同じ seed の rng で draw をやり直せば、問題に使われた数字が分かる。
// その数字から「表に書かれている値」と「正解」を、生成コードとは別の計算で求め直して照らし合わせる。

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104729 + 7)
const gen = (id: string) => generators.find((g) => g.id === id)!

/** 表のセルの "1,200" を数値にする */
const cell = (s: string) => Number(s.replace(/,/g, ''))
/** 選択肢の "30%" "1.5倍" "72人" から数値を取り出す */
const value = (s: string) => Number(s.replace(/,/g, '').replace(/[^\d.]/g, ''))

function correctValue(q: Question): number {
  const t = correctChoiceText(q)
  expect(t, q.key).toBeDefined()
  return value(t!)
}

describe('nv-table の問題の型', () => {
  it('構成比: 正解 = 問われた行 ÷ 合計 × 100、合計の行が各行の和', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-table/share').generate(seed)
      const p = drawShare(createRng(seed))
      const rows = q.table!.rows
      const vals = rows.slice(0, 4).map((r) => cell(r[1]))
      expect(vals).toEqual(shareValues(p))
      expect(cell(rows[4][1])).toBe(vals.reduce((a, b) => a + b, 0))
      const asked = vals[p.ask]
      expect(q.stem).toContain(rows[p.ask][0])
      expect(correctValue(q)).toBeCloseTo((asked / cell(rows[4][1])) * 100, 6)
    }
  })

  it('増加率: 正解 = (2024年 − 2023年) ÷ 2023年 × 100（問われた行）', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-table/growth').generate(seed)
      const p = drawGrowth(createRng(seed))
      const row = q.table!.rows[p.ask]
      expect(q.stem).toContain(row[0])
      const [a, b] = [cell(row[1]), cell(row[2])]
      expect(a).toBe(p.base)
      expect(correctValue(q)).toBeCloseTo(((b - a) / a) * 100, 6)
    }
  })

  it('何倍: 正解 = 比べる量 ÷ もとにする量（「〜の何倍」の「〜」で割る）', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-table/times').generate(seed)
      const p = drawTimes(createRng(seed))
      const rows = q.table!.rows
      expect(rows.map((r) => cell(r[1]))).toEqual(timesValues(p))
      // 問題文の最後の文は「Xの…は、Yの…の何倍か」。X と Y を順に読み取る
      const last = q.stem.split('である。')[1]
      const names = [...last.matchAll(/(店舗|部)[A-D]/g)].map((m) => m[0])
      expect(names.length, q.stem).toBe(2)
      const x = cell(rows.find((r) => r[0] === names[0])![1])
      const y = cell(rows.find((r) => r[0] === names[1])![1])
      expect(correctValue(q)).toBeCloseTo(x / y, 6)
    }
  })

  it('構成比と人数: 正解 = 分かっている人数 ÷ その構成比 × 問われた構成比', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-table/composition').generate(seed)
      const p = drawComp(createRng(seed))
      const rows = q.table!.rows
      expect(rows.slice(0, 4).reduce((s, r) => s + cell(r[1]), 0)).toBe(100)
      const known = Number(/は([\d,]+)人である/.exec(q.stem)![1].replace(/,/g, ''))
      // 小数の誤差を避けるため「人数 × 100 ÷ 構成比」の順に計算する
      const total = (known * 100) / cell(rows[p.known][1])
      expect(Number.isInteger(total), q.stem).toBe(true)
      expect(correctValue(q)).toBeCloseTo((total * cell(rows[p.ask][1])) / 100, 6)
      expect(q.stem).toContain(rows[p.ask][0])
    }
  })

  it('2年分: 正解 = 2024年の総数 × 割合 − 2023年の総数 × 割合（増えている）', () => {
    for (const seed of SEEDS) {
      const q = gen('nv-table/two-year').generate(seed)
      const p = drawTwoYear(createRng(seed))
      const [total, rate] = q.table!.rows
      const g1 = (cell(total[1]) * cell(rate[1])) / 100
      const g2 = (cell(total[2]) * cell(rate[2])) / 100
      expect(cell(total[1])).toBe(p.t1)
      expect(Number.isInteger(g1) && Number.isInteger(g2)).toBe(true)
      expect(g2 - g1).toBeGreaterThan(0)
      expect(correctValue(q)).toBe(g2 - g1)
    }
  })
})
