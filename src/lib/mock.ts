import type { Attempt, Question, ReviewItem, Section, TopicId } from '../types'
import { getTopic, TOPICS } from '../data/topics'
import { isCorrect, type Selection } from './answer'
import { isoToDateStr, todayStr } from './date'
import { applyPracticeResult, resultFromQuestion } from './review'
import { createRng, type Rng } from './rng'

// 本番形式の模試（純粋関数）。
// - buildMock : 問題を選ぶ（言語 → 非言語の順。組問題は連続）
// - startRun / tickRun / answerRun : 時間の進み方（時間切れ・全体の時間切れ）
// - buildMockResult / mockAttemptEntries : 結果の集計と記録
// 画面側は Date.now() を渡すだけ。ここでは時計を直接見ない（テストしやすくするため）。

export type MockKind = 'full' | 'mini'

export const MOCK_KINDS: readonly MockKind[] = ['full', 'mini']

/** 組問題の「ふつうの大きさ」。公開された組が小さいときの不足を数えるのに使う */
export const GROUP_NOMINAL_SIZE = 3

/** 出題計画の1行。singles = 単独の問題の数、groups = 組問題の組数 */
export type PlanEntry = { topic: TopicId; singles?: number; groups?: number }

export type MockSpec = {
  kind: MockKind
  label: string
  /** 「35分」のような短い名前 */
  shortLabel: string
  minutes: number
  totalSec: number
  verbal: PlanEntry[]
  nonverbal: PlanEntry[]
}

// 分野ごとの出題数の目安。計算の基礎（nv-basics）は出さない。
// 目安時間（targetSec）の合計が全体の時間とほぼ同じになるように決めてある。
export const MOCK_SPECS: Record<MockKind, MockSpec> = {
  full: {
    kind: 'full',
    label: 'テストセンター風 模試',
    shortLabel: '35分',
    minutes: 35,
    totalSec: 35 * 60,
    verbal: [
      { topic: 'vb-relation', singles: 3 },
      { topic: 'vb-meaning', singles: 3 },
      { topic: 'vb-usage', singles: 2 },
      { topic: 'vb-order', singles: 1 },
      { topic: 'vb-blank', singles: 1 },
      { topic: 'vb-reading', groups: 1 },
    ],
    nonverbal: [
      { topic: 'nv-inference', groups: 1, singles: 2 },
      { topic: 'nv-table', singles: 2 },
      { topic: 'nv-combination', singles: 2 },
      { topic: 'nv-probability', singles: 2 },
      { topic: 'nv-profit', singles: 1 },
      { topic: 'nv-ratio', singles: 1 },
      { topic: 'nv-discount', singles: 1 },
      { topic: 'nv-installment', singles: 1 },
      { topic: 'nv-settlement', singles: 1 },
      { topic: 'nv-speed', singles: 1 },
      { topic: 'nv-sets', singles: 1 },
    ],
  },
  mini: {
    kind: 'mini',
    label: 'ミニ模試',
    shortLabel: '15分',
    minutes: 15,
    totalSec: 15 * 60,
    verbal: [
      { topic: 'vb-relation', singles: 2 },
      { topic: 'vb-meaning', singles: 2 },
      { topic: 'vb-usage', singles: 1 },
    ],
    nonverbal: [
      { topic: 'nv-inference', singles: 2 },
      { topic: 'nv-combination', singles: 1 },
      { topic: 'nv-probability', singles: 1 },
      { topic: 'nv-profit', singles: 1 },
      { topic: 'nv-table', singles: 1 },
      { topic: 'nv-sets', singles: 1 },
    ],
  },
}

export function isMockKind(v: unknown): v is MockKind {
  return v === 'full' || v === 'mini'
}

function entryNominal(e: PlanEntry): number {
  return (e.singles ?? 0) + (e.groups ?? 0) * GROUP_NOMINAL_SIZE
}

/** 計画どおりに出せたときの問題数の目安 */
export function nominalCounts(kind: MockKind): { verbal: number; nonverbal: number; total: number } {
  const spec = MOCK_SPECS[kind]
  const verbal = spec.verbal.reduce((s, e) => s + entryNominal(e), 0)
  const nonverbal = spec.nonverbal.reduce((s, e) => s + entryNominal(e), 0)
  return { verbal, nonverbal, total: verbal + nonverbal }
}

// ---------------------------------------------------------------------------
// 問題を選ぶ
// ---------------------------------------------------------------------------

/** 問題の取り出し口（mockSource.ts が bank.ts につなぐ。テストでは差し替える） */
export type MockSource = {
  /** 公開済みで、出せる問題がある分野か */
  isOpen(topic: TopicId): boolean
  /** 作成問題の分野の全問題。解いていない問題を先に、それぞれ seed でシャッフルして返す */
  authoredPool(topic: TopicId, seen: ReadonlySet<string>, seed: number): Question[]
  /** 生成問題の分野から n 問。型がばらけるように、新しい seed で作る */
  generate(topic: TopicId, n: number, seed: number): Question[]
}

export type MockBuild = {
  kind: MockKind
  totalSec: number
  /** 言語 → 非言語の順。組問題は連続して並ぶ */
  questions: Question[]
  verbalCount: number
  nonverbalCount: number
}

type TopicPool = {
  takeSingles(n: number): Question[]
  takeGroups(n: number): Question[][]
}

const MAX_SEED = 2 ** 31 - 1

function byKey(a: Question, b: Question): number {
  return a.key.localeCompare(b.key, 'en', { numeric: true })
}

function makeTopicPool(topic: TopicId, source: MockSource, seen: ReadonlySet<string>, rng: Rng, used: Set<string>): TopicPool {
  if (getTopic(topic).kind === 'generated') {
    return {
      takeSingles(n) {
        const out: Question[] = []
        // 作れなかった・同じ問題が出たときのために、数回まで引き直す
        for (let attempt = 0; attempt < 3 && out.length < n; attempt++) {
          for (const q of source.generate(topic, n - out.length, rng.int(1, MAX_SEED))) {
            if (out.length >= n || used.has(q.key)) continue
            used.add(q.key)
            out.push(q)
          }
        }
        return out
      },
      // 生成問題の組問題はまだ無い。出せなければ、足りない分は同じ区分の別分野で埋める
      takeGroups: () => [],
    }
  }

  let pool: Question[] | null = null
  let singles: Question[] = []
  let groups: Question[][] = []
  const load = () => {
    if (pool) return
    pool = source.authoredPool(topic, seen, rng.int(1, MAX_SEED))
    singles = pool.filter((q) => !q.groupKey)
    const map = new Map<string, Question[]>()
    for (const q of pool) {
      if (!q.groupKey) continue
      const list = map.get(q.groupKey)
      if (list) list.push(q)
      else map.set(q.groupKey, [q])
    }
    // まだ解いていない問題が多い組を先に。同じなら pool の順（シャッフル済み）
    groups = [...map.values()]
      .map((g, i) => ({ g: g.sort(byKey), i, seenN: g.filter((q) => seen.has(q.key)).length }))
      .sort((a, b) => a.seenN - b.seenN || a.i - b.i)
      .map((x) => x.g)
  }
  return {
    takeSingles(n) {
      load()
      const out: Question[] = []
      while (out.length < n && singles.length > 0) {
        const q = singles.shift()!
        if (used.has(q.key)) continue
        used.add(q.key)
        out.push(q)
      }
      return out
    },
    takeGroups(n) {
      load()
      const out: Question[][] = []
      while (out.length < n && groups.length > 0) {
        const g = groups.shift()!
        if (g.some((q) => used.has(q.key))) continue
        g.forEach((q) => used.add(q.key))
        out.push(g)
      }
      return out
    },
  }
}

/**
 * 模試の問題を選ぶ。
 * - 公開されていない分野・問題がない分野は飛ばし、同じ区分（言語/非言語）の別分野で数を保つ
 * - 作成問題は、まだ解いていない問題を優先する
 * - 組問題（同じ groupKey）は連続して並べる。区分の中の並びは、組を1かたまりとして seed でシャッフル
 * - 同じ seed・同じ条件なら、必ず同じ問題が同じ順で出る
 */
export function buildMock(kind: MockKind, source: MockSource, seen: ReadonlySet<string>, seed: number): MockBuild {
  const spec = MOCK_SPECS[kind]
  const rng = createRng(seed)
  const used = new Set<string>()
  const pools = new Map<TopicId, TopicPool>()
  const poolOf = (topic: TopicId): TopicPool => {
    let p = pools.get(topic)
    if (!p) {
      p = makeTopicPool(topic, source, seen, rng, used)
      pools.set(topic, p)
    }
    return p
  }

  const buildSection = (section: Section, entries: PlanEntry[]): Question[] => {
    const blocks: Question[][] = []
    let target = 0
    let have = 0
    for (const e of entries) {
      target += entryNominal(e)
      if (!source.isOpen(e.topic)) continue
      const pool = poolOf(e.topic)
      if (e.groups) {
        for (const g of pool.takeGroups(e.groups)) {
          blocks.push(g)
          have += g.length
        }
      }
      if (e.singles) {
        for (const q of pool.takeSingles(e.singles)) {
          blocks.push([q])
          have += 1
        }
      }
    }

    // 足りない分は、同じ区分の公開済みの分野から1問ずつ順番に足す（よく出る分野が先）
    if (have < target) {
      const fallback = TOPICS.filter((t) => t.section === section && t.id !== 'nv-basics' && source.isOpen(t.id))
        .map((t, i) => ({ t, i }))
        .sort((a, b) => b.t.frequency - a.t.frequency || a.i - b.i)
        .map((x) => x.t)
      let progressed = true
      while (have < target && progressed) {
        progressed = false
        for (const t of fallback) {
          if (have >= target) break
          const got = poolOf(t.id).takeSingles(1)
          if (got.length > 0) {
            blocks.push([got[0]])
            have += 1
            progressed = true
          }
        }
      }
    }
    return rng.shuffle(blocks).flat()
  }

  const verbal = buildSection('verbal', spec.verbal)
  const nonverbal = buildSection('nonverbal', spec.nonverbal)
  return {
    kind,
    totalSec: spec.totalSec,
    questions: [...verbal, ...nonverbal],
    verbalCount: verbal.length,
    nonverbalCount: nonverbal.length,
  }
}

/** 区分の中で何問目か（画面の「言語 3 / 12」用） */
export function sectionProgress(questions: readonly Question[], index: number): { section: Section; no: number; total: number } {
  const section = questions[index].section
  let no = 0
  let total = 0
  questions.forEach((q, i) => {
    if (q.section !== section) return
    total += 1
    if (i <= index) no += 1
  })
  return { section, no, total }
}

/** 組問題の何問目か。組問題でなければ null */
export function groupProgress(questions: readonly Question[], index: number): { no: number; total: number } | null {
  const key = questions[index].groupKey
  if (!key) return null
  let no = 0
  let total = 0
  questions.forEach((q, i) => {
    if (q.groupKey !== key) return
    total += 1
    if (i <= index) no += 1
  })
  return { no, total }
}

// ---------------------------------------------------------------------------
// 時間の進み方
// ---------------------------------------------------------------------------

export type MockAnswer =
  /** 選んで「次へ」を押した */
  | { status: 'answered'; selection: Selection; correct: boolean; timeMs: number; endedAt: number }
  /** 制限時間になって、答えないまま次へ進んだ（不正解） */
  | { status: 'timeout'; timeMs: number; endedAt: number }
  /** 全体の時間が切れて、解けなかった */
  | { status: 'unanswered' }

export type MockRun = {
  /** 模試を始めた時刻（ミリ秒） */
  startedAt: number
  /** いま出している問題の番号。終了したら answers.length と同じ（= 問題数） */
  index: number
  /** いまの問題を出した時刻 */
  qStartedAt: number
  /** 確定した結果。進行中は index 個、終了後は問題数ぶん */
  answers: MockAnswer[]
  /** 終了した時刻。進行中は undefined */
  finishedAt?: number
}

export function startRun(now: number): MockRun {
  return { startedAt: now, index: 0, qStartedAt: now, answers: [] }
}

function limitMs(q: Pick<Question, 'targetSec'>): number {
  return q.targetSec * 1000
}

/** 残りの問題をすべて「未回答」にして終える */
function finishUnanswered(run: MockRun, total: number, at: number): MockRun {
  const answers = [...run.answers]
  while (answers.length < total) answers.push({ status: 'unanswered' })
  return { ...run, index: total, answers, finishedAt: at }
}

/**
 * 時計を now まで進める。
 * - 問題の制限時間を過ぎていれば、時間切れにして次へ（画面が裏に回っていて何問ぶんも過ぎていた場合は、順に処理する）
 * - 全体の時間が切れたら終了し、残りは未回答
 * 何も変わらなければ、同じ run をそのまま返す。
 */
export function tickRun(run: MockRun, questions: readonly Question[], totalMs: number, now: number): MockRun {
  if (run.finishedAt !== undefined) return run
  const total = questions.length
  const deadline = run.startedAt + totalMs
  let cur = run
  for (;;) {
    if (cur.index >= total) return { ...cur, finishedAt: Math.min(now, deadline) }
    const q = questions[cur.index]
    const qEnd = cur.qStartedAt + limitMs(q)
    if (qEnd > now || qEnd > deadline) break
    const answers: MockAnswer[] = [...cur.answers, { status: 'timeout', timeMs: limitMs(q), endedAt: qEnd }]
    cur =
      cur.index + 1 >= total
        ? { ...cur, index: total, answers, finishedAt: qEnd }
        : { ...cur, index: cur.index + 1, qStartedAt: qEnd, answers }
    if (cur.finishedAt !== undefined) return cur
  }
  if (now >= deadline) return finishUnanswered(cur, total, deadline)
  return cur
}

/**
 * 「次へ」を押した。まず時計を now まで進め、その問題が時間切れになっていなければ答えを確定する。
 * 押すより先に時間切れになっていたら、答えは無効（時間切れとして次へ進んだ状態を返す）。
 */
export function answerRun(
  run: MockRun,
  questions: readonly Question[],
  totalMs: number,
  selection: Selection,
  now: number,
): MockRun {
  const cur = tickRun(run, questions, totalMs, now)
  if (cur.finishedAt !== undefined || cur.index !== run.index) return cur
  const q = questions[cur.index]
  const timeMs = Math.min(limitMs(q), Math.max(0, now - cur.qStartedAt))
  const answers: MockAnswer[] = [
    ...cur.answers,
    { status: 'answered', selection, correct: isCorrect(q, selection), timeMs, endedAt: now },
  ]
  if (cur.index + 1 >= questions.length) return { ...cur, index: questions.length, answers, finishedAt: now }
  return { ...cur, index: cur.index + 1, qStartedAt: now, answers }
}

// ---------------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------------

export type Tally = { total: number; correct: number }

/** 保存する模試の結果 */
export type MockResult = {
  id: string
  kind: MockKind
  /** 終わった日時（ISO 8601） */
  at: string
  total: number
  correct: number
  timeouts: number
  unanswered: number
  durationSec: number
  bySection: { verbal: Tally; nonverbal: Tally }
  byTopic: Partial<Record<TopicId, Tally>>
}

export type MockOutcome = 'correct' | 'wrong' | 'timeout' | 'unanswered'

export function outcomeOf(a: MockAnswer): MockOutcome {
  if (a.status === 'unanswered') return 'unanswered'
  if (a.status === 'timeout') return 'timeout'
  return a.correct ? 'correct' : 'wrong'
}

/** 終了した模試の結果を集計する */
export function buildMockResult(kind: MockKind, questions: readonly Question[], run: MockRun): MockResult {
  const finishedAt = run.finishedAt ?? run.startedAt
  const bySection = { verbal: { total: 0, correct: 0 }, nonverbal: { total: 0, correct: 0 } }
  const byTopic: Partial<Record<TopicId, Tally>> = {}
  let correct = 0
  let timeouts = 0
  let unanswered = 0
  questions.forEach((q, i) => {
    const a = run.answers[i] ?? { status: 'unanswered' as const }
    const o = outcomeOf(a)
    const ok = o === 'correct'
    if (ok) correct += 1
    if (o === 'timeout') timeouts += 1
    if (o === 'unanswered') unanswered += 1
    bySection[q.section].total += 1
    if (ok) bySection[q.section].correct += 1
    const t = byTopic[q.topic] ?? { total: 0, correct: 0 }
    t.total += 1
    if (ok) t.correct += 1
    byTopic[q.topic] = t
  })
  return {
    id: `${kind}-${run.startedAt}`,
    kind,
    at: new Date(finishedAt).toISOString(),
    total: questions.length,
    correct,
    timeouts,
    unanswered,
    durationSec: Math.max(0, Math.round((finishedAt - run.startedAt) / 1000)),
    bySection,
    byTopic,
  }
}

/** 記録に残す1問ぶん（回答した問題と、時間切れの問題。未回答は含めない） */
export type MockAttemptEntry = {
  question: Question
  correct: boolean
  timeMs: number
  /** その問題が終わった時刻（ミリ秒） */
  endedAt: number
}

export function mockAttemptEntries(questions: readonly Question[], run: MockRun): MockAttemptEntry[] {
  const out: MockAttemptEntry[] = []
  questions.forEach((question, i) => {
    const a = run.answers[i]
    if (!a || a.status === 'unanswered') return
    out.push({
      question,
      correct: a.status === 'answered' ? a.correct : false,
      timeMs: a.timeMs,
      endedAt: a.endedAt,
    })
  })
  return out
}

/** 模試の結果を、回答の記録と復習リストに反映する（既存の復習ルールのまま） */
export function applyMockRecord(
  attempts: Attempt[],
  reviews: ReviewItem[],
  entries: readonly MockAttemptEntry[],
  finishedIso: string,
): { attempts: Attempt[]; reviews: ReviewItem[] } {
  const today = isoToDateStr(finishedIso) ?? todayStr()
  const nextAttempts = [...attempts]
  let nextReviews = reviews
  for (const e of entries) {
    const at = new Date(e.endedAt).toISOString()
    const timeMs = Math.max(0, Math.round(e.timeMs))
    nextAttempts.push({
      questionKey: e.question.key,
      topic: e.question.topic,
      mode: 'mock',
      correct: e.correct,
      usedHint: false,
      timeMs,
      at,
    })
    nextReviews = applyPracticeResult(
      nextReviews,
      resultFromQuestion(e.question, { correct: e.correct, usedHint: false, timeMs }),
      today,
      at,
    )
  }
  return { attempts: nextAttempts, reviews: nextReviews }
}

// ---------------------------------------------------------------------------
// 記録の表示用
// ---------------------------------------------------------------------------

export function mockAccuracy(r: Pick<MockResult, 'total' | 'correct'>): number {
  return r.total > 0 ? r.correct / r.total : 0
}

function byAtAsc(a: MockResult, b: MockResult): number {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0
}

/** 種類ごとの直近 n 回（古い順。グラフ用） */
export function recentMockResults(results: readonly MockResult[], kind: MockKind, n = 10): MockResult[] {
  return results
    .filter((r) => r.kind === kind)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => byAtAsc(a.r, b.r) || a.i - b.i)
    .map((x) => x.r)
    .slice(-n)
}

/** いちばん新しい結果（種類を指定しなければ全体から） */
export function lastMockResult(results: readonly MockResult[], kind?: MockKind): MockResult | undefined {
  const list = kind ? results.filter((r) => r.kind === kind) : results
  return list.reduce<MockResult | undefined>((best, r) => (!best || r.at >= best.at ? r : best), undefined)
}
