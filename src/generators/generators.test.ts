import { describe, expect, it } from 'vitest'
import { GENERATORS } from './index'
import { correctChoiceText, validateQuestion } from '../lib/validate'

// 登録されているすべての「問題の型」を、seed を変えて大量に作って検査する。
// 型を足したら自動でここの検査対象になる。

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1)

describe('generators', () => {
  it('id が重複せず "<topic>/" で始まる', () => {
    const ids = GENERATORS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of GENERATORS) expect(g.id.startsWith(`${g.topic}/`)).toBe(true)
  })

  for (const g of GENERATORS) {
    describe(g.id, () => {
      it('1000通り作っても問題データとして正しい', () => {
        for (const seed of SEEDS) {
          const q = g.generate(seed)
          const errors = validateQuestion(q)
          expect(errors, `seed=${seed}\n${JSON.stringify(q, null, 2)}`).toEqual([])
          expect(q.topic).toBe(g.topic)
          expect(q.generatorId).toBe(g.id)
        }
      })

      it('同じ seed なら同じ問題になる', () => {
        for (const seed of SEEDS.slice(0, 50)) {
          expect(g.generate(seed)).toEqual(g.generate(seed))
        }
      })

      it('解説の最後のステップに正解が書かれている', () => {
        for (const seed of SEEDS) {
          const q = g.generate(seed)
          const correct = correctChoiceText(q)
          if (correct === undefined) continue
          const last = q.explanation[q.explanation.length - 1]
          expect(last, `seed=${seed}`).toContain(correct)
        }
      })

      it('正解の位置が1か所に偏らない', () => {
        const counts = new Map<number, number>()
        for (const seed of SEEDS) {
          const q = g.generate(seed)
          if (typeof q.answer === 'number') counts.set(q.answer, (counts.get(q.answer) ?? 0) + 1)
        }
        for (const c of counts.values()) expect(c / SEEDS.length).toBeLessThan(0.6)
      })

      it('同じ型でも問題が十分に変わる', () => {
        const stems = new Set(SEEDS.map((s) => g.generate(s).stem))
        expect(stems.size).toBeGreaterThanOrEqual(20)
      })
    })
  }
})
