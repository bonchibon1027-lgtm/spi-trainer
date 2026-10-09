import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Attempt, AttemptMode, Question } from '../types'
import { setImportedQuestions } from '../lib/bank'
import { isoToDateStr, todayStr } from '../lib/date'
import { applyPracticeResult, applyReviewResult, resultFromQuestion } from '../lib/review'
import {
  loadData,
  saveData,
  type AppData,
  type Flag,
  type Settings,
  type ThemeSetting,
} from '../lib/storage'

// アプリ全体の状態（学習記録）。変更のたびに localStorage へ保存する。

export type AnswerOutcome = { correct: boolean; usedHint: boolean; timeMs: number }

type Store = {
  data: AppData
  /** 保存データが壊れていて、初期状態から始めたとき true */
  recovered: boolean
  /** localStorage に保存できなかったとき true */
  saveFailed: boolean
  dismissRecovered: () => void
  updateSettings: (patch: Partial<Settings>) => void
  /**
   * 1問の結果を記録する。
   * mode が 'review' のときは reviewKey（復習リストの項目のキー）が必要。
   */
  recordAnswer: (q: Question, mode: AttemptMode, outcome: AnswerOutcome, reviewKey?: string) => void
  addFlag: (questionKey: string, memo: string) => void
  removeFlag: (questionKey: string) => void
  /** バックアップから丸ごと置き換える */
  replaceAll: (data: AppData) => void
  setImported: (qs: Question[]) => void
}

const Ctx = createContext<Store | null>(null)

export function useApp(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('AppProvider の外では使えません')
  return v
}

/** 表示テーマを <html> に反映する（CSS 側は data-theme を見る） */
export function applyTheme(theme: ThemeSetting): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    const r = loadData()
    // 取り込み済みの問題を、画面が問題を取り出す前に登録しておく
    setImportedQuestions(r.data.importedQuestions)
    return r
  })
  const [data, setData] = useState<AppData>(initial.data)
  const [recovered, setRecovered] = useState(initial.recovered)
  const [saveFailed, setSaveFailed] = useState(false)
  const first = useRef(true)

  // 保存。読み込んだだけの最初の1回は書き戻さない（壊れたデータを退避したあとに上書きする場合を除く）
  useEffect(() => {
    if (first.current) {
      first.current = false
      if (!initial.recovered) return
    }
    setSaveFailed(!saveData(data))
  }, [data, initial.recovered])

  useEffect(() => {
    applyTheme(data.settings.theme)
    try {
      const dark =
        data.settings.theme === 'dark' ||
        (data.settings.theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14181b' : '#f6f7f2')
    } catch {
      // theme-color は見た目の補助なので失敗しても続ける
    }
  }, [data.settings.theme])

  // 学習記録が消されないよう、ブラウザに永続化をお願いする（断られても問題なし）
  useEffect(() => {
    try {
      void navigator.storage?.persist?.()
    } catch {
      // 非対応の環境では何もしない
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => {
      const settings = { ...d.settings, ...patch }
      if (!settings.examDate) delete settings.examDate
      return { ...d, settings }
    })
  }, [])

  const recordAnswer = useCallback<Store['recordAnswer']>((q, mode, outcome, reviewKey) => {
    const now = new Date()
    const at = now.toISOString()
    const today = isoToDateStr(at) ?? todayStr(now)
    const attempt: Attempt = {
      questionKey: q.key,
      topic: q.topic,
      mode,
      correct: outcome.correct,
      usedHint: outcome.usedHint,
      timeMs: Math.max(0, Math.round(outcome.timeMs)),
      at,
    }
    const result = resultFromQuestion(q, { ...outcome, timeMs: attempt.timeMs })
    setData((d) => ({
      ...d,
      attempts: [...d.attempts, attempt],
      reviews:
        mode === 'review' && reviewKey
          ? applyReviewResult(d.reviews, reviewKey, result, today)
          : applyPracticeResult(d.reviews, result, today, at),
    }))
  }, [])

  const addFlag = useCallback((questionKey: string, memo: string) => {
    const flag: Flag = { questionKey, memo: memo.trim(), at: new Date().toISOString() }
    setData((d) => ({ ...d, flags: [...d.flags.filter((f) => f.questionKey !== questionKey), flag] }))
  }, [])

  const removeFlag = useCallback((questionKey: string) => {
    setData((d) => ({ ...d, flags: d.flags.filter((f) => f.questionKey !== questionKey) }))
  }, [])

  const replaceAll = useCallback((next: AppData) => {
    setImportedQuestions(next.importedQuestions)
    setData(next)
  }, [])

  const setImported = useCallback((qs: Question[]) => {
    setImportedQuestions(qs)
    setData((d) => ({ ...d, importedQuestions: qs }))
  }, [])

  const value = useMemo<Store>(
    () => ({
      data,
      recovered,
      saveFailed,
      dismissRecovered: () => setRecovered(false),
      updateSettings,
      recordAnswer,
      addFlag,
      removeFlag,
      replaceAll,
      setImported,
    }),
    [data, recovered, saveFailed, updateSettings, recordAnswer, addFlag, removeFlag, replaceAll, setImported],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

