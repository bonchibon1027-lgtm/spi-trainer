import type { Attempt, TopicId, TopicMeta } from '../types'
import { TOPICS } from '../data/topics'
import { isoToDateStr } from './date'

// 苦手分析（純粋関数）

/** 「直近」とみなす問題数 */
export const RECENT_N = 20
/** この問題数に満たない分野は「練習中」 */
export const MIN_ATTEMPTS_FOR_STATUS = 5
/** 「得意」になるのに必要な問題数 */
export const MIN_ATTEMPTS_FOR_STRONG = 10
export const WEAK_BELOW = 0.6
export const STRONG_AT_LEAST = 0.8
/** 平均時間が目安のこの倍率を超えたら「時間がかかっている」 */
export const SLOW_RATIO = 1.2

export type TopicStatus = 'untouched' | 'weak' | 'practicing' | 'strong'

export const STATUS_LABEL: Record<TopicStatus, string> = {
  untouched: '未着手',
  weak: '苦手',
  practicing: '練習中',
  strong: '得意',
}

export type TopicStat = {
  topic: TopicId
  /** 挑戦数（全モード） */
  attempts: number
  /** 直近20問のうち実際に数えた問題数 */
  recentCount: number
  /** 直近20問の正答率（0〜1）。未着手は null */
  recentAccuracy: number | null
  /** 直近20問の平均時間（秒）。未着手は null */
  recentAvgSec: number | null
  /** 目安時間（秒） */
  targetSec: number
  status: TopicStatus
}

export function statusOf(
  attempts: number,
  accuracy: number | null,
  avgSec: number | null,
  targetSec: number,
): TopicStatus {
  if (attempts === 0 || accuracy === null || avgSec === null) return 'untouched'
  if (attempts < MIN_ATTEMPTS_FOR_STATUS) return 'practicing'
  if (accuracy < WEAK_BELOW) return 'weak'
  if (attempts >= MIN_ATTEMPTS_FOR_STRONG && accuracy >= STRONG_AT_LEAST && avgSec <= targetSec * SLOW_RATIO) return 'strong'
  return 'practicing'
}

/** 古い順にそろえる（同じ時刻なら元の順） */
function chronological(attempts: Attempt[]): Attempt[] {
  return attempts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.at < y.a.at ? -1 : x.a.at > y.a.at ? 1 : x.i - y.i))
    .map((x) => x.a)
}

export function computeTopicStat(meta: Pick<TopicMeta, 'id' | 'targetSec'>, attempts: Attempt[]): TopicStat {
  const mine = chronological(attempts.filter((a) => a.topic === meta.id))
  const recent = mine.slice(-RECENT_N)
  const accuracy = recent.length ? recent.filter((a) => a.correct).length / recent.length : null
  const avgSec = recent.length ? recent.reduce((s, a) => s + a.timeMs, 0) / recent.length / 1000 : null
  return {
    topic: meta.id,
    attempts: mine.length,
    recentCount: recent.length,
    recentAccuracy: accuracy,
    recentAvgSec: avgSec,
    targetSec: meta.targetSec,
    status: statusOf(mine.length, accuracy, avgSec, meta.targetSec),
  }
}

export function computeAllStats(attempts: Attempt[], topics: readonly TopicMeta[] = TOPICS): Map<TopicId, TopicStat> {
  const byTopic = new Map<TopicId, Attempt[]>()
  for (const a of attempts) {
    const list = byTopic.get(a.topic)
    if (list) list.push(a)
    else byTopic.set(a.topic, [a])
  }
  return new Map(topics.map((t) => [t.id, computeTopicStat(t, byTopic.get(t.id) ?? [])]))
}

export type OverallStat = {
  attempts: number
  correct: number
  /** 0〜1。1問もなければ null */
  accuracy: number | null
}

export function overallStat(attempts: Attempt[]): OverallStat {
  const correct = attempts.filter((a) => a.correct).length
  return { attempts: attempts.length, correct, accuracy: attempts.length ? correct / attempts.length : null }
}

/** 今日（現地日付）に解いた問題数 */
export function countToday(attempts: Attempt[], today: string): number {
  return attempts.filter((a) => isoToDateStr(a.at) === today).length
}

// ---- おすすめ分野 ----

export type Recommendation = {
  topic: TopicId
  kind: 'warmup' | 'untouched' | 'weak' | 'slow' | 'practicing' | 'maintain'
  /** 画面に出す理由の文 */
  reason: string
}

export const WARMUP_TOPIC: TopicId = 'nv-basics'

function pct(x: number): number {
  return Math.round(x * 100)
}

/**
 * 次にやる分野を1つ選ぶ。
 * candidates には「公開済みで問題がある分野」だけを渡す。
 * まだ1問も解いていなければ計算の基礎を勧め、そのあとは
 * 1) 未着手（よく出る順） 2) 苦手（正答率の低い順） 3) 時間がかかっている（超過率の高い順） 4) 練習中（正答率の低い順）
 */
export function recommendNext(
  candidates: readonly { stat: TopicStat; frequency: number }[],
  totalAttempts: number,
): Recommendation | null {
  if (candidates.length === 0) return null

  if (totalAttempts === 0) {
    const w = candidates.find((c) => c.stat.topic === WARMUP_TOPIC)
    if (w) return { topic: WARMUP_TOPIC, kind: 'warmup', reason: 'まずはウォームアップ。分数・小数・割合の計算に慣れましょう' }
  }

  // 同じ条件なら分野一覧の並び順（引数の順）を保つ
  const stable = <T,>(items: T[], cmp: (a: T, b: T) => number): T[] =>
    items
      .map((x, i) => ({ x, i }))
      .sort((a, b) => cmp(a.x, b.x) || a.i - b.i)
      .map((v) => v.x)

  const untouched = stable(
    candidates.filter((c) => c.stat.status === 'untouched'),
    (a, b) => b.frequency - a.frequency,
  )
  if (untouched.length) {
    const c = untouched[0]
    return {
      topic: c.stat.topic,
      kind: 'untouched',
      reason: c.frequency >= 3 ? 'よく出るのに、まだ手をつけていません' : 'まだ手をつけていません',
    }
  }

  const weak = stable(
    candidates.filter((c) => c.stat.status === 'weak'),
    (a, b) => (a.stat.recentAccuracy ?? 0) - (b.stat.recentAccuracy ?? 0),
  )
  if (weak.length) {
    const c = weak[0]
    return {
      topic: c.stat.topic,
      kind: 'weak',
      reason: `正答率が${pct(c.stat.recentAccuracy ?? 0)}%です。ノートを読み直してから練習しましょう`,
    }
  }

  const ratio = (c: { stat: TopicStat }) => (c.stat.recentAvgSec ?? 0) / c.stat.targetSec
  const slow = stable(
    candidates.filter((c) => c.stat.status !== 'untouched' && ratio(c) > SLOW_RATIO),
    (a, b) => ratio(b) - ratio(a),
  )
  if (slow.length) {
    const c = slow[0]
    return {
      topic: c.stat.topic,
      kind: 'slow',
      reason: `正解はできていますが、時間がかかっています（平均${Math.round(c.stat.recentAvgSec ?? 0)}秒・目安${c.stat.targetSec}秒）`,
    }
  }

  const practicing = stable(
    candidates.filter((c) => c.stat.status === 'practicing'),
    (a, b) => (a.stat.recentAccuracy ?? 0) - (b.stat.recentAccuracy ?? 0),
  )
  if (practicing.length) {
    const c = practicing[0]
    return {
      topic: c.stat.topic,
      kind: 'practicing',
      reason: `練習中です（正答率${pct(c.stat.recentAccuracy ?? 0)}%）。もう少し解いて定着させましょう`,
    }
  }

  // すべて得意: 正答率がいちばん低いものを勧める
  const rest = stable(candidates.slice(), (a, b) => (a.stat.recentAccuracy ?? 1) - (b.stat.recentAccuracy ?? 1))
  return {
    topic: rest[0].stat.topic,
    kind: 'maintain',
    reason: 'どの分野も得意になっています。感覚を保つために解いておきましょう',
  }
}
