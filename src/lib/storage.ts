import type { Attempt, AttemptMode, Question, ReviewItem, TopicId } from '../types'
import { getTopic, isTopicId } from '../data/topics'
import { isDateStr } from './date'
import { isMockKind, type MockResult, type Tally } from './mock'
import { validateQuestion } from './validate'

// 学習記録の保存（localStorage）。壊れたデータや古い版でも落ちないようにする。

export const STORAGE_KEY = 'spi-trainer:data'
const BROKEN_KEY_PREFIX = 'spi-trainer:data:broken-'
// 1: v0.9  2: v1.0（既定のテーマを「ライト」に変更）
export const DATA_VERSION = 2

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
  /** 模試の結果（古い記録には無いので、読み込み時に [] で補う） */
  mockResults: MockResult[]
}

// 白×青の明るい配色を基本にする。スマホがダークモードでも明るく表示する（設定で切り替え可）
export const DEFAULT_SETTINGS: Settings = { drillSize: 5, theme: 'light' }

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    attempts: [],
    reviews: [],
    flags: [],
    importedQuestions: [],
    mockResults: [],
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

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function cleanTally(v: unknown): Tally | null {
  if (!isObject(v) || !isCount(v.total) || !isCount(v.correct) || v.correct > v.total) return null
  return { total: v.total, correct: v.correct }
}

function cleanMockResult(v: unknown): MockResult | null {
  if (!isObject(v)) return null
  if (typeof v.id !== 'string' || v.id === '') return null
  if (!isMockKind(v.kind)) return null
  if (!isIso(v.at)) return null
  if (!isCount(v.total) || !isCount(v.correct) || !isCount(v.timeouts) || !isCount(v.unanswered)) return null
  if (v.correct > v.total || v.correct + v.timeouts + v.unanswered > v.total) return null
  if (typeof v.durationSec !== 'number' || !Number.isFinite(v.durationSec) || v.durationSec < 0) return null
  if (!isObject(v.bySection)) return null
  const verbal = cleanTally(v.bySection.verbal)
  const nonverbal = cleanTally(v.bySection.nonverbal)
  if (!verbal || !nonverbal) return null
  const byTopic: Partial<Record<TopicId, Tally>> = {}
  if (isObject(v.byTopic)) {
    for (const [k, t] of Object.entries(v.byTopic)) {
      const tally = cleanTally(t)
      if (isTopicId(k) && tally) byTopic[k] = tally
    }
  }
  return {
    id: v.id,
    kind: v.kind,
    at: v.at,
    total: v.total,
    correct: v.correct,
    timeouts: v.timeouts,
    unanswered: v.unanswered,
    durationSec: Math.round(v.durationSec),
    bySection: { verbal, nonverbal },
    byTopic,
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
  // version が無い・古い・新しい場合も、読める項目だけ拾う
  const settings = cleanSettings(raw.settings)
  // v1 の既定は「自動」だった。v1 で保存された「自動」は、新しい既定の「ライト」に移す（1回だけ）
  if (raw.version !== DATA_VERSION && settings.theme === 'auto') settings.theme = 'light'
  return {
    version: DATA_VERSION,
    settings,
    attempts: cleanList(raw.attempts, cleanAttempt),
    reviews: uniqueBy(cleanList(raw.reviews, cleanReview), (r) => r.questionKey),
    flags: uniqueBy(cleanList(raw.flags, cleanFlag), (f) => f.questionKey),
    importedQuestions: uniqueBy(cleanList(raw.importedQuestions, cleanImported), (q) => q.key),
    mockResults: uniqueBy(cleanList(raw.mockResults, cleanMockResult), (m) => m.id),
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

/** 版が変わる読み込みや、壊れた項目を取り除いた読み込みの前に、元の文字列を残しておくキー（版ごとに1つ） */
export const PREV_KEY_PREFIX = 'spi-trainer:data:prev-v'

export type LoadResult = {
  data: AppData
  /** 保存データが壊れていて読めなかったとき true（壊れたデータは別のキーに退避済み、または退避に失敗） */
  recovered: boolean
  /**
   * true のときは自動で書き戻さない（元のデータを守るため）。
   * - 壊れたデータや引き継ぎ前のデータを、別のキーに退避できなかった
   * - このアプリより新しい版のデータだった（書き戻すと新しい項目が消える）
   */
  saveBlocked: boolean
  /** 読み込むときに取り除いた、壊れた記録の数 */
  dropped: number
}

function trySet(st: Storage, key: string, value: string): boolean {
  try {
    st.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const LIST_KEYS = ['attempts', 'reviews', 'flags', 'importedQuestions', 'mockResults'] as const

/** 読み込みで取り除かれた記録の数（形がまるごと読めないときは 1 以上） */
function countDropped(raw: unknown, data: AppData): number {
  if (!isObject(raw)) return 1
  return LIST_KEYS.reduce((n, k) => {
    const before = Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0
    return n + Math.max(0, before - data[k].length)
  }, 0)
}

export function loadData(): LoadResult {
  const empty = (): LoadResult => ({ data: emptyData(), recovered: false, saveBlocked: false, dropped: 0 })
  const st = getStorage()
  if (!st) return empty()
  let raw: string | null = null
  try {
    raw = st.getItem(STORAGE_KEY)
  } catch {
    return empty()
  }
  if (raw === null) return empty()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // JSON として読めない: 別のキーに退避してから初期状態で始める。退避できなければ元のデータを上書きしない
    const saved = trySet(st, `${BROKEN_KEY_PREFIX}${Date.now()}`, raw)
    return { data: emptyData(), recovered: true, saveBlocked: !saved, dropped: 0 }
  }

  const data = migrate(parsed)
  const dropped = countDropped(parsed, data)
  const version = isObject(parsed) ? parsed.version : undefined
  // このアプリより新しい版のデータ（古いアプリが残っていた場合など）: 書き戻すと新しい項目が消えるので保存しない
  if (typeof version === 'number' && version > DATA_VERSION) return { data, recovered: false, saveBlocked: true, dropped }
  // 版が変わる（v1 → v2 など）、または壊れた項目を取り除いた: 書き戻す前に元の文字列を残す
  if (version !== DATA_VERSION || dropped > 0) {
    const saved = trySet(st, `${PREV_KEY_PREFIX}${typeof version === 'number' ? version : 0}`, raw)
    if (!saved) return { data, recovered: false, saveBlocked: true, dropped }
  }
  return { data, recovered: false, saveBlocked: false, dropped }
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
  mockResults: number
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
  const rawCount =
    rawLen(raw.attempts) + rawLen(raw.reviews) + rawLen(raw.flags) + rawLen(raw.importedQuestions) + rawLen(raw.mockResults)
  const kept =
    data.attempts.length + data.reviews.length + data.flags.length + data.importedQuestions.length + data.mockResults.length
  return {
    ok: true,
    data,
    summary: {
      attempts: data.attempts.length,
      reviews: data.reviews.length,
      flags: data.flags.length,
      importedQuestions: data.importedQuestions.length,
      mockResults: data.mockResults.length,
      skipped: Math.max(0, rawCount - kept),
    },
  }
}
