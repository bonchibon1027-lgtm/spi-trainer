import { describe, expect, it } from 'vitest'
import type { Attempt, TopicId } from '../types'
import {
  computeAllStats,
  computeTopicStat,
  countToday,
  overallStat,
  recommendNext,
  statusOf,
  type TopicStat,
} from './stats'
import { TOPICS } from '../data/topics'

let clock = 0
function attempt(topic: TopicId, correct: boolean, timeSec = 30, at?: string): Attempt {
  clock += 1
  return {
    questionKey: `${topic}-${clock}`,
    topic,
    mode: 'drill',
    correct,
    usedHint: false,
    timeMs: timeSec * 1000,
    at: at ?? new Date(Date.UTC(2026, 9, 1, 0, 0, clock)).toISOString(),
  }
}

function many(topic: TopicId, correct: boolean[], timeSec = 30): Attempt[] {
  return correct.map((c) => attempt(topic, c, timeSec))
}

const meta = { id: 'nv-profit' as TopicId, targetSec: 75 }

describe('分野の状態', () => {
  it('0問 = 未着手', () => {
    expect(computeTopicStat(meta, []).status).toBe('untouched')
  })
  it('5問未満 = 練習中（全部不正解でも）', () => {
    expect(computeTopicStat(meta, many('nv-profit', [false, false, false, false])).status).toBe('practicing')
  })
  it('5問以上で正答率60%未満 = 苦手', () => {
    expect(computeTopicStat(meta, many('nv-profit', [true, true, false, false, false])).status).toBe('weak') // 40%
  })
  it('正答率ちょうど60% は苦手ではない', () => {
    expect(computeTopicStat(meta, many('nv-profit', [true, true, true, false, false])).status).toBe('practicing')
  })
  it('10問以上・正答率80%以上・時間が目安×1.2以内 = 得意', () => {
    const ok = many('nv-profit', [true, true, true, true, true, true, true, true, false, true], 75 * 1.2)
    expect(computeTopicStat(meta, ok).status).toBe('strong')
  })
  it('10問未満なら正答率が高くても練習中', () => {
    expect(computeTopicStat(meta, many('nv-profit', Array(9).fill(true))).status).toBe('practicing')
  })
  it('時間が目安×1.2を超えたら得意にならない', () => {
    expect(computeTopicStat(meta, many('nv-profit', Array(10).fill(true), 91)).status).toBe('practicing')
  })
  it('statusOf の境界', () => {
    expect(statusOf(10, 0.8, 90, 75)).toBe('strong')
    expect(statusOf(10, 0.79, 30, 75)).toBe('practicing')
    expect(statusOf(5, 0.59, 30, 75)).toBe('weak')
  })
})

describe('分野ごとの成績', () => {
  it('直近20問で数える（古い失敗は外れる）', () => {
    const old = many('nv-profit', Array(10).fill(false))
    const recent = many('nv-profit', Array(20).fill(true), 60)
    const s = computeTopicStat(meta, [...old, ...recent])
    expect(s.attempts).toBe(30)
    expect(s.recentCount).toBe(20)
    expect(s.recentAccuracy).toBe(1)
    expect(s.recentAvgSec).toBe(60)
  })
  it('時刻順に並べ替えてから直近を取る', () => {
    const a = attempt('nv-profit', false, 30, '2026-10-02T00:00:00.000Z')
    const b = attempt('nv-profit', true, 30, '2026-10-01T00:00:00.000Z')
    const filler = Array.from({ length: 19 }, (_, i) => attempt('nv-profit', true, 30, `2026-10-03T00:00:${String(i).padStart(2, '0')}.000Z`))
    // 並びが逆でも、時刻の古い b から外れる（直近20問 = a + filler）
    const s = computeTopicStat(meta, [a, b, ...filler])
    expect(s.recentCount).toBe(20)
    expect(s.recentAccuracy).toBe(19 / 20)
  })
  it('他の分野の記録は混ざらない', () => {
    const all = [...many('nv-profit', [true, true]), ...many('nv-ratio', [false, false, false])]
    const m = computeAllStats(all)
    expect(m.get('nv-profit')?.attempts).toBe(2)
    expect(m.get('nv-ratio')?.attempts).toBe(3)
    expect(m.get('nv-speed')?.status).toBe('untouched')
    expect(m.size).toBe(TOPICS.length)
  })
  it('全体の回答数と正答率、今日の問題数', () => {
    const list = [
      attempt('nv-profit', true, 30, '2026-10-10T03:00:00.000Z'),
      attempt('nv-profit', false, 30, '2026-10-10T04:00:00.000Z'),
      attempt('nv-ratio', true, 30, '2026-09-30T04:00:00.000Z'),
    ]
    expect(overallStat(list)).toEqual({ attempts: 3, correct: 2, accuracy: 2 / 3 })
    expect(overallStat([]).accuracy).toBeNull()
    // タイムゾーンに依存しないよう、記録と同じ方法で今日を求めて数える
    const todayStr = (iso: string) => {
      const d = new Date(iso)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }
    expect(countToday(list, todayStr('2026-10-10T03:00:00.000Z'))).toBeGreaterThanOrEqual(1)
    expect(countToday(list, '2000-01-01')).toBe(0)
  })
})

// ---- おすすめ ----

function stat(topic: TopicId, over: Partial<TopicStat> = {}): TopicStat {
  const meta = TOPICS.find((t) => t.id === topic)!
  return {
    topic,
    attempts: 0,
    recentCount: 0,
    recentAccuracy: null,
    recentAvgSec: null,
    targetSec: meta.targetSec,
    status: 'untouched',
    ...over,
  }
}

function cand(topic: TopicId, over: Partial<TopicStat> = {}) {
  return { stat: stat(topic, over), frequency: TOPICS.find((t) => t.id === topic)!.frequency }
}

describe('recommendNext（おすすめ分野）', () => {
  it('候補が無ければ null', () => {
    expect(recommendNext([], 0)).toBeNull()
  })

  it('まだ1問も解いていなければ計算の基礎（ウォームアップ）', () => {
    const r = recommendNext([cand('nv-inference'), cand('nv-basics'), cand('nv-ratio')], 0)
    expect(r?.topic).toBe('nv-basics')
    expect(r?.kind).toBe('warmup')
  })

  it('計算の基礎が候補になければ通常の順位づけ', () => {
    const r = recommendNext([cand('nv-inference'), cand('nv-ratio')], 0)
    expect(r?.kind).toBe('untouched')
  })

  it('1) 未着手の分野をよく出る順に', () => {
    const r = recommendNext(
      [
        cand('nv-basics', { attempts: 5, recentAccuracy: 0.4, recentAvgSec: 30, status: 'weak' }), // 苦手でも未着手が先
        cand('nv-speed'), // frequency 2
        cand('nv-ratio'), // frequency 3
      ],
      5,
    )
    expect(r?.topic).toBe('nv-ratio')
    expect(r?.kind).toBe('untouched')
    expect(r?.reason).toContain('よく出る')
  })

  it('2) 未着手が無ければ苦手を正答率の低い順に', () => {
    const r = recommendNext(
      [
        cand('nv-ratio', { attempts: 8, recentAccuracy: 0.5, recentAvgSec: 30, status: 'weak' }),
        cand('nv-profit', { attempts: 8, recentAccuracy: 0.3, recentAvgSec: 30, status: 'weak' }),
        cand('nv-speed', { attempts: 8, recentAccuracy: 0.7, recentAvgSec: 400, status: 'practicing' }),
      ],
      24,
    )
    expect(r?.topic).toBe('nv-profit')
    expect(r?.kind).toBe('weak')
    expect(r?.reason).toContain('30%')
  })

  it('3) 苦手が無ければ、時間がかかっている分野を超過率の高い順に', () => {
    const r = recommendNext(
      [
        cand('nv-ratio', { attempts: 12, recentAccuracy: 0.7, recentAvgSec: 30, status: 'practicing' }), // 目安60 → 余裕
        cand('nv-profit', { attempts: 12, recentAccuracy: 0.9, recentAvgSec: 100, status: 'practicing' }), // 目安75 → 1.33
        cand('nv-speed', { attempts: 12, recentAccuracy: 0.9, recentAvgSec: 180, status: 'practicing' }), // 目安90 → 2.0
      ],
      36,
    )
    expect(r?.topic).toBe('nv-speed')
    expect(r?.kind).toBe('slow')
  })

  it('4) 練習中を正答率の低い順に', () => {
    const r = recommendNext(
      [
        cand('nv-ratio', { attempts: 12, recentAccuracy: 0.75, recentAvgSec: 30, status: 'practicing' }),
        cand('nv-profit', { attempts: 12, recentAccuracy: 0.65, recentAvgSec: 30, status: 'practicing' }),
        cand('nv-speed', { attempts: 12, recentAccuracy: 0.95, recentAvgSec: 30, status: 'strong' }),
      ],
      36,
    )
    expect(r?.topic).toBe('nv-profit')
    expect(r?.kind).toBe('practicing')
  })

  it('すべて得意なら、いちばん正答率が低いものを維持用に勧める', () => {
    const r = recommendNext(
      [
        cand('nv-ratio', { attempts: 12, recentAccuracy: 0.9, recentAvgSec: 30, status: 'strong' }),
        cand('nv-profit', { attempts: 12, recentAccuracy: 0.85, recentAvgSec: 30, status: 'strong' }),
      ],
      24,
    )
    expect(r?.topic).toBe('nv-profit')
    expect(r?.kind).toBe('maintain')
  })
})
