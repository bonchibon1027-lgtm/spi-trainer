import { describe, expect, it } from 'vitest'
import { drawForDrill } from './bank'
import { authoredFor } from '../content'

describe('drawForDrill（作成問題の分野）', () => {
  it('組問題は、同じ文章の問題をまとめて番号順に出す（途中で切らない）', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const qs = drawForDrill('vb-reading', 5, new Set(), seed)
      expect(qs.length).toBeGreaterThanOrEqual(5)
      // 同じ groupKey の問題が連続し、key の昇順で、組の全問がそろっている
      const groups = new Map<string, string[]>()
      qs.forEach((q, i) => {
        const g = q.groupKey!
        const prev = groups.get(g)
        if (prev) expect(qs[i - 1].groupKey, `seed=${seed}`).toBe(g)
        groups.set(g, [...(prev ?? []), q.key])
      })
      for (const [g, keys] of groups) {
        const all = authoredFor('vb-reading').filter((q) => q.groupKey === g).map((q) => q.key).sort()
        expect(keys).toEqual(all)
      }
    }
  })

  it('まだ解いていない問題（組）を先に出す', () => {
    const all = authoredFor('vb-relation')
    const seen = new Set(all.slice(0, all.length - 3).map((q) => q.key))
    const qs = drawForDrill('vb-relation', 5, seen, 7)
    expect(qs.slice(0, 3).every((q) => !seen.has(q.key))).toBe(true)
    expect(qs.length).toBe(5)
  })
})
