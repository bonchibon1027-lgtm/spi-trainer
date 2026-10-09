import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, formatClock, formatSec, isDateStr, toDateStr } from './date'
import { clip, parseRich, plainText } from './text'
import { choiceLabel, isCorrect } from './answer'
import type { Question } from '../types'

describe('日付', () => {
  it('addDays は月・年をまたぐ', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-10', 7)).toBe('2026-10-17')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('daysBetween', () => {
    expect(daysBetween('2026-10-10', '2026-11-05')).toBe(26)
    expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0)
    expect(daysBetween('2026-10-10', '2026-10-09')).toBe(-1)
  })
  it('isDateStr', () => {
    expect(isDateStr('2026-10-10')).toBe(true)
    expect(isDateStr('2026-02-30')).toBe(false)
    expect(isDateStr('2026/10/10')).toBe(false)
    expect(isDateStr(20261010)).toBe(false)
  })
  it('toDateStr は現地日付', () => {
    expect(toDateStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('時間の表示', () => {
    expect(formatSec(75)).toBe('1分15秒')
    expect(formatSec(45)).toBe('45秒')
    expect(formatSec(120)).toBe('2分')
    expect(formatClock(75_900)).toBe('1:15')
  })
})

describe('RichText の読み取り', () => {
  it('分数と改行を取り出す', () => {
    expect(parseRich('{{3/5}}を求める\nつぎ')).toEqual([
      { type: 'frac', num: '3', den: '5' },
      { type: 'text', text: 'を求める' },
      { type: 'br' },
      { type: 'text', text: 'つぎ' },
    ])
  })
  it('文字として書かれた \\n も改行にする', () => {
    expect(parseRich('a\\nb').map((t) => t.type)).toEqual(['text', 'br', 'text'])
  })
  it('一覧用の短い表示', () => {
    expect(plainText('{{2/3}} × 6\n= 4')).toBe('2/3 × 6 = 4')
    expect(clip('あいうえおかきくけこ', 5)).toBe('あいうえお…')
  })
})

function q(over: Partial<Question>): Question {
  return {
    key: 'k',
    testType: 'spi',
    section: 'nonverbal',
    topic: 'nv-inference',
    difficulty: 1,
    format: 'single',
    stem: 's',
    choices: ['a', 'b', 'c'],
    answer: 1,
    explanation: ['x'],
    targetSec: 60,
    source: 'authored',
    ...over,
  }
}

describe('正誤判定', () => {
  it('single', () => {
    expect(isCorrect(q({}), [1])).toBe(true)
    expect(isCorrect(q({}), [0])).toBe(false)
    expect(isCorrect(q({}), [])).toBe(false)
  })
  it('multi は順番に関係なく、全部一致したときだけ正解', () => {
    const m = q({ format: 'multi', answer: [0, 2] })
    expect(isCorrect(m, [2, 0])).toBe(true)
    expect(isCorrect(m, [0])).toBe(false)
    expect(isCorrect(m, [0, 1, 2])).toBe(false)
  })
  it('numeric は全角やカンマを許す', () => {
    const n = q({ format: 'numeric', choices: undefined, answer: '1200' })
    expect(isCorrect(n, '1,200')).toBe(true)
    expect(isCorrect(n, '１２００')).toBe(true)
    expect(isCorrect(n, '1200.0')).toBe(true)
    expect(isCorrect(n, '1201')).toBe(false)
    expect(isCorrect(n, '')).toBe(false)
  })
  it('選択肢のラベル', () => {
    expect([0, 1, 2, 4].map(choiceLabel)).toEqual(['A', 'B', 'C', 'E'])
  })
})
