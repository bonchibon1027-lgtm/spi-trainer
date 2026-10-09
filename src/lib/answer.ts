import type { Question } from '../types'

// 回答の正誤判定。single / multi は選んだ添字、numeric は入力文字列。

export type Selection = number[] | string

/** 全角数字・全角記号を半角にし、空白とカンマを除く */
export function normalizeNumeric(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[－−ー]/g, '-')
    .replace(/[\s,，、]/g, '')
}

export function isCorrect(q: Question, selection: Selection): boolean {
  if (q.format === 'numeric') {
    if (typeof selection !== 'string') return false
    const a = normalizeNumeric(selection)
    const b = normalizeNumeric(String(q.answer))
    if (a === '') return false
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-9
    return a === b
  }
  if (typeof selection === 'string') return false
  const chosen = [...selection].sort((x, y) => x - y)
  const answer = answerIndexes(q)
  return chosen.length === answer.length && chosen.every((v, i) => v === answer[i])
}

/** 正解の添字（single / multi）。numeric では空 */
export function answerIndexes(q: Question): number[] {
  if (q.format === 'numeric') return []
  if (Array.isArray(q.answer)) return [...q.answer].sort((x, y) => x - y)
  return typeof q.answer === 'number' ? [q.answer] : []
}

/** A, B, C… */
export function choiceLabel(i: number): string {
  return String.fromCharCode(65 + i)
}
