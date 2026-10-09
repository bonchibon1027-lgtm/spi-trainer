import { describe, expect, it } from 'vitest'
import { emptyData, exportBackup, migrate, parseBackup } from './storage'

const attempt = {
  questionKey: 'nv-profit/markup#1',
  topic: 'nv-profit',
  mode: 'drill',
  correct: true,
  usedHint: false,
  timeMs: 12000,
  at: '2026-10-10T00:00:00.000Z',
}

describe('migrate（壊れたデータでも落ちない）', () => {
  it('null・文字列・配列などは初期状態になる', () => {
    for (const v of [null, undefined, 1, 'x', [], true]) {
      expect(migrate(v)).toEqual(emptyData())
    }
  })

  it('正しいデータはそのまま通る', () => {
    const d = {
      version: 1,
      settings: { examDate: '2026-11-05', drillSize: 10, theme: 'dark' },
      attempts: [attempt],
      reviews: [
        { questionKey: 'nv-profit/markup#1', topic: 'nv-profit', generatorId: 'nv-profit/markup', stage: 1, dueDate: '2026-10-13', addedAt: '2026-10-10T00:00:00.000Z' },
      ],
      flags: [{ questionKey: 'nv-profit/markup#1', memo: 'めも', at: '2026-10-10T00:00:00.000Z' }],
      importedQuestions: [],
    }
    expect(migrate(d)).toEqual(d)
  })

  it('不正な設定値は既定値に戻る', () => {
    const m = migrate({ settings: { examDate: '2026-02-30', drillSize: 7, theme: 'pink' } })
    expect(m.settings).toEqual({ drillSize: 5, theme: 'auto' })
  })

  it('壊れた記録だけ取り除く', () => {
    const m = migrate({
      attempts: [attempt, { ...attempt, topic: 'nope' }, { ...attempt, timeMs: -5 }, { ...attempt, at: 'bad' }, 'x', null, { ...attempt, correct: 'yes' }],
      reviews: [
        { questionKey: 'a', topic: 'nv-ratio', stage: 3, dueDate: '2026-10-10', addedAt: '2026-10-10T00:00:00.000Z' },
        { questionKey: 'b', topic: 'nv-ratio', stage: 0, dueDate: 'tomorrow', addedAt: '2026-10-10T00:00:00.000Z' },
        { questionKey: 'c', topic: 'nv-ratio', stage: 0, dueDate: '2026-10-11' },
      ],
      flags: [{ questionKey: '', memo: '', at: '2026-10-10T00:00:00.000Z' }],
    })
    expect(m.attempts).toHaveLength(1)
    expect(m.reviews.map((r) => r.questionKey)).toEqual(['c'])
    expect(m.flags).toEqual([])
  })

  it('復習・記録の同じキーは1件にまとめる', () => {
    const r = { questionKey: 'a', topic: 'nv-ratio', stage: 0, dueDate: '2026-10-11', addedAt: '2026-10-10T00:00:00.000Z' }
    expect(migrate({ reviews: [r, { ...r, stage: 1 }] }).reviews).toHaveLength(1)
  })

  it('取り込んだ問題は検査に通るものだけ残る', () => {
    const good = {
      key: 'imp-001',
      topic: 'nv-inference',
      difficulty: 2,
      format: 'single',
      stem: '問題文',
      choices: ['ア', 'イ'],
      answer: 1,
      explanation: ['解説。答え: イ'],
      targetSec: 90,
    }
    const bad = { ...good, key: 'imp-002', answer: 5 }
    const m = migrate({ importedQuestions: [good, bad, 'x', { ...good, key: 'imp-003', topic: 'zzz' }] })
    expect(m.importedQuestions.map((q) => q.key)).toEqual(['imp-001'])
    expect(m.importedQuestions[0]).toMatchObject({ source: 'imported', section: 'nonverbal', testType: 'spi' })
  })
})

describe('バックアップの読み込み検査', () => {
  it('書き出したものは読み込める', () => {
    const d = { ...emptyData(), attempts: [{ ...attempt, topic: 'nv-profit' as const, mode: 'drill' as const }] }
    const r = parseBackup(exportBackup(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toEqual(d)
      expect(r.summary.attempts).toBe(1)
      expect(r.summary.skipped).toBe(0)
    }
  })

  it('JSONでない・形が違うものは断る', () => {
    expect(parseBackup('これはJSONではありません').ok).toBe(false)
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('{}').ok).toBe(false)
    expect(parseBackup('{"version":1}').ok).toBe(false)
    expect(parseBackup('{"version":99,"settings":{},"attempts":[],"reviews":[]}').ok).toBe(false)
  })

  it('読み飛ばした件数を数える', () => {
    const text = JSON.stringify({ version: 1, settings: {}, attempts: [attempt, { nope: 1 }], reviews: [] })
    const r = parseBackup(text)
    expect(r.ok && r.summary.skipped).toBe(1)
  })
})
