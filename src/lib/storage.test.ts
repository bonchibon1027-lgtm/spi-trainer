import { afterEach, describe, expect, it, vi } from 'vitest'
import { PREV_KEY_PREFIX, STORAGE_KEY, emptyData, exportBackup, loadData, migrate, parseBackup } from './storage'

const attempt = {
  questionKey: 'nv-profit/markup#1',
  topic: 'nv-profit',
  mode: 'drill',
  correct: true,
  usedHint: false,
  timeMs: 12000,
  at: '2026-10-10T00:00:00.000Z',
}

const mockResult = {
  id: 'full-1760000000000',
  kind: 'full',
  at: '2026-10-10T00:35:00.000Z',
  total: 30,
  correct: 20,
  timeouts: 3,
  unanswered: 2,
  durationSec: 2100,
  bySection: { verbal: { total: 12, correct: 9 }, nonverbal: { total: 18, correct: 11 } },
  byTopic: { 'vb-relation': { total: 3, correct: 3 }, 'nv-profit': { total: 1, correct: 0 } },
}

describe('migrate（壊れたデータでも落ちない）', () => {
  it('null・文字列・配列などは初期状態になる', () => {
    for (const v of [null, undefined, 1, 'x', [], true]) {
      expect(migrate(v)).toEqual(emptyData())
    }
  })

  it('正しいデータはそのまま通る', () => {
    const d = {
      version: 2,
      settings: { examDate: '2026-11-05', drillSize: 10, theme: 'dark' },
      attempts: [attempt],
      reviews: [
        { questionKey: 'nv-profit/markup#1', topic: 'nv-profit', generatorId: 'nv-profit/markup', stage: 1, dueDate: '2026-10-13', addedAt: '2026-10-10T00:00:00.000Z' },
      ],
      flags: [{ questionKey: 'nv-profit/markup#1', memo: 'めも', at: '2026-10-10T00:00:00.000Z' }],
      importedQuestions: [],
      mockResults: [mockResult],
    }
    expect(migrate(d)).toEqual(d)
  })

  it('模試の記録が無い古いデータは [] で補う', () => {
    const m = migrate({ version: 1, settings: { drillSize: 5, theme: 'dark' }, attempts: [attempt], reviews: [] })
    expect(m.mockResults).toEqual([])
    expect(m.attempts).toHaveLength(1)
    expect(emptyData().mockResults).toEqual([])
  })

  it('模試の記録: 壊れたものだけ取り除き、同じ id は1件にまとめる', () => {
    const m = migrate({
      mockResults: [
        mockResult,
        { ...mockResult }, // 同じ id
        { ...mockResult, id: 'mini-1', kind: 'mini' },
        { ...mockResult, id: 'bad-kind', kind: 'long' },
        { ...mockResult, id: 'bad-at', at: 'yesterday' },
        { ...mockResult, id: 'over', correct: 31 },
        { ...mockResult, id: 'sum-over', correct: 20, timeouts: 8, unanswered: 5 },
        { ...mockResult, id: 'neg', timeouts: -1 },
        { ...mockResult, id: 'frac', total: 3.5 },
        { ...mockResult, id: 'no-section', bySection: undefined },
        { ...mockResult, id: 'bad-section', bySection: { verbal: { total: 2, correct: 5 }, nonverbal: { total: 1, correct: 1 } } },
        { ...mockResult, id: '' },
        { ...mockResult, id: 'dur', durationSec: 'long' },
        'x',
        null,
      ],
    })
    expect(m.mockResults.map((r) => r.id)).toEqual(['full-1760000000000', 'mini-1'])
  })

  it('模試の記録: 分野別の壊れた項目だけ捨てる（欠けていても {} で補う）', () => {
    const m = migrate({
      mockResults: [
        { ...mockResult, id: 'a', byTopic: { 'nv-profit': { total: 2, correct: 1 }, zzz: { total: 1, correct: 1 }, 'nv-ratio': { total: 1, correct: 4 }, 'nv-sets': 'x' } },
        { ...mockResult, id: 'b', byTopic: 'oops' },
        { ...mockResult, id: 'c', byTopic: undefined },
      ],
    })
    expect(m.mockResults.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(m.mockResults[0].byTopic).toEqual({ 'nv-profit': { total: 2, correct: 1 } })
    expect(m.mockResults[1].byTopic).toEqual({})
    expect(m.mockResults[2].byTopic).toEqual({})
  })

  it('不正な設定値は既定値に戻る', () => {
    const m = migrate({ settings: { examDate: '2026-02-30', drillSize: 7, theme: 'pink' } })
    expect(m.settings).toEqual({ drillSize: 5, theme: 'light' })
  })

  it('v1 で保存された「自動」は「ライト」に移り、v2 の「自動」はそのまま', () => {
    expect(migrate({ version: 1, settings: { drillSize: 5, theme: 'auto' } }).settings.theme).toBe('light')
    expect(migrate({ version: 1, settings: { drillSize: 5, theme: 'dark' } }).settings.theme).toBe('dark')
    expect(migrate({ version: 2, settings: { drillSize: 5, theme: 'auto' } }).settings.theme).toBe('auto')
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

  it('模試の記録もバックアップに含まれ、件数が数えられる', () => {
    const d = migrate({ ...emptyData(), mockResults: [mockResult, { ...mockResult, id: 'mini-1', kind: 'mini' }] })
    const r = parseBackup(exportBackup(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.mockResults).toHaveLength(2)
      expect(r.data).toEqual(d)
      expect(r.summary.mockResults).toBe(2)
      expect(r.summary.skipped).toBe(0)
    }
  })

  it('模試の記録が無い古いバックアップも読み込める。壊れた模試の記録は読み飛ばし件数に数える', () => {
    const old = parseBackup(JSON.stringify({ version: 1, settings: {}, attempts: [], reviews: [] }))
    expect(old.ok && old.data.mockResults).toEqual([])
    const broken = parseBackup(
      JSON.stringify({ version: 2, settings: {}, attempts: [], reviews: [], mockResults: [mockResult, { nope: 1 }] }),
    )
    expect(broken.ok && broken.summary.mockResults).toBe(1)
    expect(broken.ok && broken.summary.skipped).toBe(1)
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

// ---- 読み込み（loadData）: 元のデータを失わないこと ----

/** localStorage の代わり。fail に当てはまるキーへの書き込みは失敗させる（容量不足のまね） */
class FakeStorage {
  map = new Map<string, string>()
  constructor(private fail: (key: string) => boolean = () => false) {}
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    if (this.fail(k)) throw new Error('QuotaExceededError')
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  keys() {
    return [...this.map.keys()]
  }
}

describe('loadData', () => {
  const use = (st: FakeStorage) => vi.stubGlobal('localStorage', st)
  afterEach(() => vi.unstubAllGlobals())

  const v1 = {
    version: 1,
    settings: { drillSize: 5, theme: 'auto' },
    attempts: [attempt],
    reviews: [],
    flags: [],
    importedQuestions: [],
  }

  it('v1 のデータは、記録をそのまま引き継ぎ、元の文字列を prev-v1 に残す', () => {
    const st = new FakeStorage()
    st.setItem(STORAGE_KEY, JSON.stringify(v1))
    use(st)
    const r = loadData()
    expect(r.saveBlocked).toBe(false)
    expect(r.dropped).toBe(0)
    expect(r.data.attempts).toEqual([attempt])
    expect(r.data.settings.theme).toBe('light')
    expect(st.getItem(`${PREV_KEY_PREFIX}1`)).toBe(JSON.stringify(v1))
    // 読み込んだだけでは本体を書き換えない
    expect(st.getItem(STORAGE_KEY)).toBe(JSON.stringify(v1))
  })

  it('今の版で壊れた項目がなければ、何も退避しない', () => {
    const st = new FakeStorage()
    st.setItem(STORAGE_KEY, exportBackup(emptyData()))
    use(st)
    const r = loadData()
    expect(r.saveBlocked).toBe(false)
    expect(st.keys()).toEqual([STORAGE_KEY])
  })

  it('壊れた記録を取り除いたときは、元の文字列を残し、取り除いた数を返す', () => {
    const st = new FakeStorage()
    const raw = { ...v1, version: 2, attempts: [attempt, { ...attempt, timeMs: -1 }] }
    st.setItem(STORAGE_KEY, JSON.stringify(raw))
    use(st)
    const r = loadData()
    expect(r.dropped).toBe(1)
    expect(r.saveBlocked).toBe(false)
    expect(st.getItem(`${PREV_KEY_PREFIX}2`)).toBe(JSON.stringify(raw))
  })

  it('引き継ぎ前のデータを退避できないときは、書き戻しを止める', () => {
    const st = new FakeStorage((k) => k.startsWith(PREV_KEY_PREFIX))
    st.map.set(STORAGE_KEY, JSON.stringify(v1))
    use(st)
    const r = loadData()
    expect(r.saveBlocked).toBe(true)
    expect(r.data.attempts).toEqual([attempt])
  })

  it('このアプリより新しい版のデータは、書き戻しを止める', () => {
    const st = new FakeStorage()
    st.setItem(STORAGE_KEY, JSON.stringify({ ...v1, version: 99 }))
    use(st)
    expect(loadData().saveBlocked).toBe(true)
  })

  it('JSON として読めないデータは退避して初期状態で始める。退避できなければ書き戻しを止める', () => {
    const ok = new FakeStorage()
    ok.setItem(STORAGE_KEY, '{broken')
    use(ok)
    const r1 = loadData()
    expect(r1.recovered).toBe(true)
    expect(r1.saveBlocked).toBe(false)
    expect(ok.keys().some((k) => k.startsWith('spi-trainer:data:broken-'))).toBe(true)

    const ng = new FakeStorage((k) => k.startsWith('spi-trainer:data:broken-'))
    ng.map.set(STORAGE_KEY, '{broken')
    use(ng)
    const r2 = loadData()
    expect(r2.recovered).toBe(true)
    expect(r2.saveBlocked).toBe(true)
    expect(ng.getItem(STORAGE_KEY)).toBe('{broken')
  })
})
