import type { Attempt, AttemptMode, Question, ReviewItem } from '../types'
import { getTopic, isTopicId } from '../data/topics'
import { isDateStr } from './date'
import { validateQuestion } from './validate'

// 学習記録の保存（localStorage）。壊れたデータや古い版でも落ちないようにする。

export const STORAGE_KEY = 'spi-trainer:data'
const BROKEN_KEY_PREFIX = 'spi-trainer:data:broken-'
export const DATA_VERSION = 1

export type ThemeSetting = 'auto' | 'light' | 'dark'

export type Settings = {
  /** "YYYY-MM-DD" */
  examDate?: string
  drillSize: 5 | 10
  theme: ThemeSetting
}

/** 「この問題おかしい？」の記録 */
export type Flag = {
  questionKey: string
  memo: string
  /** ISO 8601 日時 */
  at: string
}

export type AppData = {
  version: typeof DATA_VERSION
  settings: Settings
  attempts: Attempt[]
  reviews: ReviewItem[]
  flags: Flag[]
  importedQuestions: Question[]
}

export const DEFAULT_SETTINGS: Settings = { drillSize: 5, theme: 'auto' }

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    attempts: [],
    reviews: [],
    flags: [],
    importedQuestions: [],
  }
}

// ---- 形の検査（migrate の部品） ----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(new Date(v).getTime())
}

const MODES: readonly AttemptMode[] = ['drill', 'mock', 'review']

function cleanAttempt(v: unknown): Attempt | null {
  if (!isObject(v)) return null
  if (typeof v.questionKey !== 'string' || v.questionKey === '') return null
  if (typeof v.topic !== 'string' || !isTopicId(v.topic)) return null
  if (typeof v.mode !== 'string' || !MODES.includes(v.mode as AttemptMode)) return null
  if (typeof v.correct !== 'boolean') return null
  if (typeof v.timeMs !== 'number' || !Number.isFinite(v.timeMs) || v.timeMs < 0) return null
  if (!isIso(v.at)) return null
  return {
    questionKey: v.questionKey,
    topic: v.topic,
    mode: v.mode as AttemptMode,
    correct: v.correct,
    usedHint: v.usedHint === true,
    timeMs: Math.round(v.timeMs),
    at: v.at,
  }
}

function cleanReview(v: unknown): ReviewItem | null {
  if (!isObject(v)) return null
  if (typeof v.questionKey !== 'string' || v.questionKey === '') return null
  if (typeof v.topic !== 'string' || !isTopicId(v.topic)) return null
  if (v.stage !== 0 && v.stage !== 1 && v.stage !== 2) return null
  if (!isDateStr(v.dueDate)) return null
  const item: ReviewItem = {
    questionKey: v.questionKey,
    topic: v.topic,
    stage: v.stage,
    dueDate: v.dueDate,
    addedAt: isIso(v.addedAt) ? v.addedAt : new Date(0).toISOString(),
  }
  if (typeof v.generatorId === 'string' && v.generatorId !== '') item.generatorId = v.generatorId
  return item
}

function cleanFlag(v: unknown): Flag | null {
  if (!isObject(v)) return null
  if (typeof v.questionKey !== 'string' || v.questionKey === '') return null
  if (!isIso(v.at)) return null
  return { questionKey: v.questionKey, memo: typeof v.memo === 'string' ? v.memo : '', at: v.at }
}

function cleanImported(v: unknown): Question | null {
  if (!isObject(v)) return null
  try {
    const q = { ...v, source: 'imported' } as unknown as Question
    delete q.generatorId
    delete q.seed
    if (validateQuestion(q).length > 0) return null
    return { ...q, testType: 'spi', section: getTopic(q.topic).section }
  } catch {
    return null
  }
}

function cleanSettings(v: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS }
  if (!isObject(v)) return s
  if (isDateStr(v.examDate)) s.examDate = v.examDate
  if (v.drillSize === 5 || v.drillSize === 10) s.drillSize = v.drillSize
  if (v.theme === 'auto' || v.theme === 'light' || v.theme === 'dark') s.theme = v.theme
  return s
}

function cleanList<T>(raw: unknown, clean: (v: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const v of raw) {
    const c = clean(v)
    if (c) out.push(c)
  }
  return out
}

/** 同じキーが複数あれば最初の1件だけ残す */
function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((t) => {
    const k = key(t)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * どんな値が来ても今の版の AppData にそろえる（例外を投げない）。
 * 版が上がったら、ここに旧版からの変換を足す。
 */
export function migrate(raw: unknown): AppData {
  if (!isObject(raw)) return emptyData()
  // 今は version 1 だけ。version が無い・古い・新しい場合も、読める項目だけ拾う
  return {
    version: DATA_VERSION,
    settings: cleanSettings(raw.settings),
    attempts: cleanList(raw.attempts, cleanAttempt),
    reviews: uniqueBy(cleanList(raw.reviews, cleanReview), (r) => r.questionKey),
    flags: uniqueBy(cleanList(raw.flags, cleanFlag), (f) => f.questionKey),
    importedQuestions: uniqueBy(cleanList(raw.importedQuestions, cleanImported), (q) => q.key),
  }
}

// ---- 読み込み・保存 ----

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export type LoadResult = {
  data: AppData
  /** 保存データが壊れていて読めなかったとき true（壊れたデータは別のキーに退避済み） */
  recovered: boolean
}

export function loadData(): LoadResult {
  const st = getStorage()
  if (!st) return { data: emptyData(), recovered: false }
  let raw: string | null = null
  try {
    raw = st.getItem(STORAGE_KEY)
  } catch {
    return { data: emptyData(), recovered: false }
  }
  if (raw === null) return { data: emptyData(), recovered: false }
  try {
    return { data: migrate(JSON.parse(raw)), recovered: false }
  } catch {
    try {
      st.setItem(`${BROKEN_KEY_PREFIX}${Date.now()}`, raw)
    } catch {
      // 退避できなくても続行する
    }
    return { data: emptyData(), recovered: true }
  }
}

/** 保存できたら true */
export function saveData(data: AppData): boolean {
  const st = getStorage()
  if (!st) return false
  try {
    st.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

// ---- バックアップの書き出し・読み込み ----

export function exportBackup(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export type BackupSummary = {
  attempts: number
  reviews: number
  flags: number
  importedQuestions: number
  /** 形が正しくなくて読み飛ばした件数 */
  skipped: number
}

export type BackupParse = { ok: true; data: AppData; summary: BackupSummary } | { ok: false; error: string }

function rawLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0
}

/** バックアップのテキストを検査して、読み込める形にする */
export function parseBackup(text: string): BackupParse {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSONとして読み取れませんでした。書き出したバックアップファイルを選んでください。' }
  }
  if (!isObject(raw)) return { ok: false, error: '学習記録の形式ではありません。' }
  if (typeof raw.version !== 'number') return { ok: false, error: '学習記録の形式ではありません（version がありません）。' }
  if (raw.version > DATA_VERSION) {
    return { ok: false, error: 'このアプリより新しい版のバックアップです。アプリを更新してから読み込んでください。' }
  }
  if (!isObject(raw.settings) || !Array.isArray(raw.attempts) || !Array.isArray(raw.reviews)) {
    return { ok: false, error: '学習記録の形式ではありません（settings / attempts / reviews が足りません）。' }
  }
  const data = migrate(raw)
  const rawCount = rawLen(raw.attempts) + rawLen(raw.reviews) + rawLen(raw.flags) + rawLen(raw.importedQuestions)
  const kept = data.attempts.length + data.reviews.length + data.flags.length + data.importedQuestions.length
  return {
    ok: true,
    data,
    summary: {
      attempts: data.attempts.length,
      reviews: data.reviews.length,
      flags: data.flags.length,
      importedQuestions: data.importedQuestions.length,
      skipped: Math.max(0, rawCount - kept),
    },
  }
}
