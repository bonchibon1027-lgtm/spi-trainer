import type { AuthoredQuestion, Question } from '../types'
import { normalizeAuthored } from '../content'
import { parseGeneratedKey } from '../generators/common'
import { validateQuestion } from './validate'

// 設定画面の「問題の追加」: 貼り付け・選択したJSONを AuthoredQuestion[] として検査し、取り込める形にする。

export type ImportProblem = {
  /** 何番目の問題か（1始まり） */
  no: number
  key: string
  messages: string[]
}

export type ImportCheck =
  | { ok: true; questions: Question[] }
  | { ok: false; fatal?: string; problems: ImportProblem[] }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Claude.ai の返答にありがちな ```json ... ``` の囲みを外す */
export function stripCodeFence(text: string): string {
  const t = text.trim()
  const m = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(t)
  return m ? m[1].trim() : t
}

// 取り込む項目。これ以外の項目（source や generatorId など）は読み捨てる
const KNOWN_FIELDS = [
  'key',
  'topic',
  'difficulty',
  'format',
  'groupKey',
  'passage',
  'table',
  'stem',
  'choices',
  'answer',
  'hint',
  'explanation',
  'targetSec',
] as const

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string')
}

/** validateQuestion が例外を出すような形の崩れを先に見つける */
function shapeErrors(o: Record<string, unknown>): string[] {
  const e: string[] = []
  if (typeof o.stem !== 'string') e.push('stem は文字列にしてください')
  if (o.choices !== undefined && !isStringArray(o.choices)) e.push('choices は文字列の配列にしてください')
  if (o.explanation !== undefined && !isStringArray(o.explanation)) e.push('explanation は文字列の配列にしてください')
  if (o.passage !== undefined && typeof o.passage !== 'string') e.push('passage は文字列にしてください')
  if (o.hint !== undefined && typeof o.hint !== 'string') e.push('hint は文字列にしてください')
  if (o.targetSec !== undefined && typeof o.targetSec !== 'number') e.push('targetSec は数値にしてください')
  if (o.table !== undefined) {
    const t = o.table
    if (!isObject(t) || !isStringArray(t.headers) || !Array.isArray(t.rows) || !t.rows.every(isStringArray)) {
      e.push('table は { headers: 文字列の配列, rows: 文字列の配列の配列 } の形にしてください')
    } else if (t.caption !== undefined && typeof t.caption !== 'string') {
      e.push('table.caption は文字列にしてください')
    }
  }
  return e
}

/**
 * 取り込む問題を検査する。
 * isKeyTaken: 今のアプリにすでにある key か（作成問題・取り込み済みの問題）
 * エラーが1つでもあれば、1問も取り込まない。
 */
export function checkImport(text: string, isKeyTaken: (key: string) => boolean): ImportCheck {
  let raw: unknown
  try {
    raw = JSON.parse(stripCodeFence(text))
  } catch (e) {
    const detail = e instanceof Error ? `（${e.message}）` : ''
    return { ok: false, fatal: `JSONとして読み取れませんでした${detail}`, problems: [] }
  }

  let list: unknown[]
  if (Array.isArray(raw)) list = raw
  else if (isObject(raw) && Array.isArray(raw.questions)) list = raw.questions
  else if (isObject(raw) && typeof raw.stem === 'string') list = [raw]
  else return { ok: false, fatal: '問題の配列（[ { ... }, { ... } ]）になっていません', problems: [] }

  if (list.length === 0) return { ok: false, fatal: '問題が1つも入っていません', problems: [] }

  const problems: ImportProblem[] = []
  const questions: Question[] = []
  const seen = new Set<string>()

  list.forEach((item, i) => {
    const no = i + 1
    if (!isObject(item)) {
      problems.push({ no, key: '', messages: ['問題の形（{ ... }）になっていません'] })
      return
    }
    const key = typeof item.key === 'string' ? item.key : ''
    const messages: string[] = []

    if (key === '') messages.push('key がありません')
    else {
      if (parseGeneratedKey(key)) messages.push('key に「#数字」で終わる形は使えません（自動生成の問題と区別できなくなります）')
      if (isKeyTaken(key)) messages.push('同じ key の問題がすでにあります')
      if (seen.has(key)) messages.push('貼り付けた中で key が重複しています')
      seen.add(key)
    }

    const shape = shapeErrors(item)
    messages.push(...shape)

    if (shape.length === 0 && key !== '') {
      try {
        const picked = Object.fromEntries(KNOWN_FIELDS.filter((k) => item[k] !== undefined).map((k) => [k, item[k]]))
        const q = normalizeAuthored(picked as unknown as AuthoredQuestion, 'imported')
        messages.push(...validateQuestion(q))
        if (messages.length === 0) questions.push(q)
      } catch (e) {
        messages.push(e instanceof Error && /unknown topic/.test(e.message) ? `topic が不正: ${String(item.topic)}` : '問題の形が正しくありません')
      }
    }

    if (messages.length > 0) problems.push({ no, key, messages })
  })

  return problems.length > 0 ? { ok: false, problems } : { ok: true, questions }
}
