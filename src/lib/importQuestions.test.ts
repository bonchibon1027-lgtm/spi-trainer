import { describe, expect, it } from 'vitest'
import { checkImport, stripCodeFence } from './importQuestions'

const good = {
  key: 'imp-001',
  topic: 'nv-inference',
  difficulty: 2,
  format: 'single',
  stem: 'A、B、Cの3人が一列に並んでいる。Aは先頭ではない。',
  choices: ['Aは最後尾', 'Bは先頭', 'Cは先頭'],
  answer: 0,
  explanation: ['先頭はBかC。', '答え: Aは最後尾'],
}

const none = () => false

describe('問題の取り込み検査', () => {
  it('正しい問題は取り込める（分野から補う項目が付く）', () => {
    const r = checkImport(JSON.stringify([good]), none)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.questions).toHaveLength(1)
      expect(r.questions[0]).toMatchObject({ source: 'imported', section: 'nonverbal', testType: 'spi', targetSec: 120 })
    }
  })

  it('```json の囲みや { questions: [...] } の形も読める', () => {
    expect(stripCodeFence('```json\n[1]\n```')).toBe('[1]')
    expect(checkImport('```json\n' + JSON.stringify([good]) + '\n```', none).ok).toBe(true)
    expect(checkImport(JSON.stringify({ questions: [good] }), none).ok).toBe(true)
    expect(checkImport(JSON.stringify(good), none).ok).toBe(true)
  })

  it('JSONでない・空・配列でないものは全体のエラー', () => {
    for (const t of ['これは文章', '[]', '{"a":1}', '42']) {
      const r = checkImport(t, none)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.fatal).toBeTruthy()
    }
  })

  it('エラーは問題ごとに出て、1つでもあれば全部取り込まない', () => {
    const bad = { ...good, key: 'imp-002', answer: 9 }
    const r = checkImport(JSON.stringify([good, bad, 'x']), none)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.problems.map((p) => p.no)).toEqual([2, 3])
      expect(r.problems[0].key).toBe('imp-002')
      expect(r.problems[0].messages.join()).toContain('answer')
    }
  })

  it('既存の key と重複したら拒否する', () => {
    const r = checkImport(JSON.stringify([good]), (k) => k === 'imp-001')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems[0].messages.join()).toContain('すでに')
  })

  it('貼り付けた中の重複・key なし・生成問題と紛らわしい key も拒否する', () => {
    const r = checkImport(JSON.stringify([good, good, { ...good, key: undefined }, { ...good, key: 'x#123' }]), none)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.map((p) => p.no)).toEqual([2, 3, 4])
  })

  it('分野が不正・形が崩れているものも落ちずに報告する', () => {
    const r = checkImport(
      JSON.stringify([{ ...good, key: 'a', topic: 'zzz' }, { ...good, key: 'b', choices: 'abc' }, { ...good, key: 'c', table: { headers: 1 } }]),
      none,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems).toHaveLength(3)
  })

  it('余計な項目（source・generatorId など）は読み捨てる', () => {
    const r = checkImport(JSON.stringify([{ ...good, source: 'authored', generatorId: 'x', seed: 1, extra: 'y' }]), none)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.questions[0].source).toBe('imported')
      expect('generatorId' in r.questions[0]).toBe(false)
      expect('extra' in r.questions[0]).toBe(false)
    }
  })
})
