import { describe, expect, it } from 'vitest'
import type { Question, TopicId } from '../types'
import { getTopic, TOPICS } from '../data/topics'
import { addDays } from './date'
import {
  answerRun,
  applyMockRecord,
  buildMock,
  buildMockResult,
  groupProgress,
  lastMockResult,
  MOCK_KINDS,
  MOCK_SPECS,
  mockAttemptEntries,
  nominalCounts,
  outcomeOf,
  recentMockResults,
  sectionProgress,
  startRun,
  tickRun,
  type MockResult,
  type MockSource,
} from './mock'
import { createRng } from './rng'

// ---- 差し替え用の問題の取り出し口（公開段階・実際の問題データに左右されないようにする） ----

function authoredQ(topic: TopicId, n: number, groupKey?: string): Question {
  const t = getTopic(topic)
  return {
    key: `${topic}-${String(n).padStart(3, '0')}`,
    testType: 'spi',
    section: t.section,
    topic,
    difficulty: 1,
    format: 'single',
    stem: `${topic} の問題 ${n}`,
    choices: ['ア', 'イ', 'ウ'],
    answer: 0,
    explanation: ['答え: ア'],
    targetSec: t.targetSec,
    source: 'authored',
    ...(groupKey ? { groupKey, passage: `${groupKey} の文章` } : {}),
  }
}

function generatedQ(topic: TopicId, seed: number): Question {
  const t = getTopic(topic)
  const generatorId = `${topic}/test`
  return {
    key: `${generatorId}#${seed}`,
    testType: 'spi',
    section: t.section,
    topic,
    difficulty: 1,
    format: 'single',
    stem: `${topic} 生成 ${seed}`,
    choices: ['ア', 'イ', 'ウ'],
    answer: 1,
    explanation: ['答え: イ'],
    targetSec: t.targetSec,
    source: 'generated',
    generatorId,
    seed,
  }
}

type Pools = Partial<Record<TopicId, Question[]>>

function makeSource(open: readonly TopicId[], pools: Pools): MockSource {
  return {
    isOpen: (t) => open.includes(t),
    authoredPool: (t, seen, seed) => {
      const rng = createRng(seed)
      const pool = pools[t] ?? []
      return [...rng.shuffle(pool.filter((q) => !seen.has(q.key))), ...rng.shuffle(pool.filter((q) => seen.has(q.key)))]
    },
    generate: (t, n, seed) => Array.from({ length: n }, (_, i) => generatedQ(t, seed + i)),
  }
}

/** 作成問題の分野（kind が authored）の問題を十分な数そろえた、全分野が公開済みの状態 */
function fullPools(): Pools {
  const pools: Pools = {}
  for (const t of TOPICS) {
    if (t.kind !== 'authored') continue
    if (t.id === 'vb-reading') {
      // 長文読解はすべて組問題（3問ずつ5本）
      pools[t.id] = Array.from({ length: 5 }, (_, g) =>
        Array.from({ length: 3 }, (_, i) => authoredQ(t.id, g * 3 + i + 1, `vb-reading-g${g + 1}`)),
      ).flat()
    } else if (t.id === 'nv-inference') {
      // 単独12問＋3問の組2つ
      pools[t.id] = [
        ...Array.from({ length: 12 }, (_, i) => authoredQ(t.id, i + 1)),
        ...[1, 2, 3].map((i) => authoredQ(t.id, 100 + i, 'nv-inference-g1')),
        ...[1, 2, 3].map((i) => authoredQ(t.id, 200 + i, 'nv-inference-g2')),
      ]
    } else {
      pools[t.id] = Array.from({ length: 40 }, (_, i) => authoredQ(t.id, i + 1))
    }
  }
  return pools
}

const ALL_OPEN: TopicId[] = TOPICS.map((t) => t.id)
const NONE = new Set<string>()

function countBy(qs: Question[]): Partial<Record<TopicId, number>> {
  const m: Partial<Record<TopicId, number>> = {}
  for (const q of qs) m[q.topic] = (m[q.topic] ?? 0) + 1
  return m
}

// ---------------------------------------------------------------------------

describe('模試の構成（計画）', () => {
  it('計算の基礎は出さない。分野の区分（言語/非言語）が計画の欄と合っている', () => {
    for (const kind of MOCK_KINDS) {
      const spec = MOCK_SPECS[kind]
      for (const e of spec.verbal) expect(getTopic(e.topic).section).toBe('verbal')
      for (const e of spec.nonverbal) expect(getTopic(e.topic).section).toBe('nonverbal')
      for (const e of [...spec.verbal, ...spec.nonverbal]) expect(e.topic).not.toBe('nv-basics')
    }
  })

  it('目安時間の合計が、全体の時間（35分・15分）を超えない', () => {
    for (const kind of MOCK_KINDS) {
      const spec = MOCK_SPECS[kind]
      const sec = [...spec.verbal, ...spec.nonverbal].reduce(
        (s, e) => s + getTopic(e.topic).targetSec * ((e.singles ?? 0) + (e.groups ?? 0) * 3),
        0,
      )
      expect(sec).toBeLessThanOrEqual(spec.totalSec)
      // 余りすぎてもいない（本番の時間いっぱいを使う作りにする）
      expect(sec).toBeGreaterThan(spec.totalSec * 0.75)
    }
    expect(MOCK_SPECS.full.totalSec).toBe(35 * 60)
    expect(MOCK_SPECS.mini.totalSec).toBe(15 * 60)
  })

  it('問題数の目安: 35分は言語 約12〜13問・非言語 18問、ミニは言語5問・非言語7問', () => {
    const full = nominalCounts('full')
    expect(full.nonverbal).toBe(18)
    expect(full.verbal).toBeGreaterThanOrEqual(12)
    expect(full.verbal).toBeLessThanOrEqual(13)
    expect(nominalCounts('mini')).toEqual({ verbal: 5, nonverbal: 7, total: 12 })
  })
})

describe('buildMock（問題を選ぶ）', () => {
  const source = makeSource(ALL_OPEN, fullPools())

  it('35分: 分野ごとの出題数が計画どおり', () => {
    const b = buildMock('full', source, NONE, 1)
    const c = countBy(b.questions)
    expect(c).toMatchObject({
      'vb-relation': 3,
      'vb-meaning': 3,
      'vb-usage': 2,
      'vb-order': 1,
      'vb-blank': 1,
      'vb-reading': 3,
      'nv-inference': 5, // 組3問＋単独2問
      'nv-table': 2,
      'nv-combination': 2,
      'nv-probability': 2,
      'nv-profit': 1,
      'nv-ratio': 1,
      'nv-discount': 1,
      'nv-installment': 1,
      'nv-settlement': 1,
      'nv-speed': 1,
      'nv-sets': 1,
    })
    expect(b.verbalCount).toBe(13)
    expect(b.nonverbalCount).toBe(18)
    expect(b.questions).toHaveLength(31)
    expect(b.totalSec).toBe(2100)
    expect(b.kind).toBe('full')
  })

  it('15分: 言語5問（二語の関係2・語句の意味2・語句の用法1）→ 非言語7問', () => {
    const b = buildMock('mini', source, NONE, 1)
    expect(countBy(b.questions)).toEqual({
      'vb-relation': 2,
      'vb-meaning': 2,
      'vb-usage': 1,
      'nv-inference': 2,
      'nv-combination': 1,
      'nv-probability': 1,
      'nv-profit': 1,
      'nv-table': 1,
      'nv-sets': 1,
    })
    expect(b.verbalCount).toBe(5)
    expect(b.nonverbalCount).toBe(7)
    expect(b.totalSec).toBe(900)
    // ミニの推論は単独の問題（組問題ではない）
    expect(b.questions.filter((q) => q.topic === 'nv-inference').every((q) => !q.groupKey)).toBe(true)
  })

  it('言語をすべて終えてから非言語（途中で戻らない）。計算の基礎は出ない', () => {
    for (const kind of MOCK_KINDS) {
      for (let seed = 1; seed <= 20; seed++) {
        const b = buildMock(kind, source, NONE, seed)
        const sections = b.questions.map((q) => q.section)
        const firstNon = sections.indexOf('nonverbal')
        expect(firstNon).toBe(b.verbalCount)
        expect(sections.slice(0, firstNon).every((s) => s === 'verbal')).toBe(true)
        expect(sections.slice(firstNon).every((s) => s === 'nonverbal')).toBe(true)
        expect(b.questions.some((q) => q.topic === 'nv-basics')).toBe(false)
      }
    }
  })

  it('組問題は連続して並び、組の中は番号順。同じ問題を2回出さない', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = buildMock('full', source, NONE, seed)
      const keys = b.questions.map((q) => q.key)
      expect(new Set(keys).size).toBe(keys.length)
      const groups = new Map<string, number[]>()
      b.questions.forEach((q, i) => {
        if (q.groupKey) groups.set(q.groupKey, [...(groups.get(q.groupKey) ?? []), i])
      })
      for (const [g, idx] of groups) {
        expect(idx[idx.length - 1] - idx[0], g).toBe(idx.length - 1) // 間に他の問題が入らない
        const gk = idx.map((i) => b.questions[i].key)
        expect(gk, g).toEqual([...gk].sort((a, b2) => a.localeCompare(b2, 'en', { numeric: true })))
      }
      // 長文読解は1組、推論は組が1つまで
      expect([...groups.keys()].filter((g) => g.startsWith('vb-reading')).length).toBe(1)
      expect([...groups.keys()].filter((g) => g.startsWith('nv-inference')).length).toBe(1)
    }
  })

  it('同じ seed なら同じ問題が同じ順で出る。seed が違えば変わる', () => {
    const a = buildMock('full', source, NONE, 42).questions.map((q) => q.key)
    const b = buildMock('full', source, NONE, 42).questions.map((q) => q.key)
    expect(b).toEqual(a)
    const orders = new Set<string>()
    for (let seed = 1; seed <= 10; seed++) orders.add(buildMock('full', source, NONE, seed).questions.map((q) => q.key).join())
    expect(orders.size).toBeGreaterThan(5)
  })

  it('作成問題は、まだ解いていない問題を優先する', () => {
    // 二語の関係は40問中37問を解いた → 残りの3問が必ず出る
    const pool = fullPools()['vb-relation']!
    const seen = new Set(pool.slice(0, 37).map((q) => q.key))
    for (let seed = 1; seed <= 10; seed++) {
      const b = buildMock('full', source, seen, seed)
      const keys = b.questions.filter((q) => q.topic === 'vb-relation').map((q) => q.key)
      expect(keys.sort()).toEqual(pool.slice(37).map((q) => q.key).sort())
    }
  })

  it('組問題も、まだ解いていない組を優先する', () => {
    const inference = fullPools()['nv-inference']!
    const seen = new Set(inference.filter((q) => q.groupKey === 'nv-inference-g1').map((q) => q.key))
    for (let seed = 1; seed <= 10; seed++) {
      const b = buildMock('full', source, seen, seed)
      expect(b.questions.some((q) => q.groupKey === 'nv-inference-g2')).toBe(true)
      expect(b.questions.some((q) => q.groupKey === 'nv-inference-g1')).toBe(false)
    }
  })

  it('生成問題は毎回新しい seed で作る（seed が違えば別の問題）', () => {
    const a = buildMock('full', source, NONE, 1).questions.filter((q) => q.source === 'generated').map((q) => q.key)
    const b = buildMock('full', source, NONE, 2).questions.filter((q) => q.source === 'generated').map((q) => q.key)
    expect(a.length).toBeGreaterThan(0)
    expect(a.filter((k) => b.includes(k))).toHaveLength(0)
  })

  it('公開されていない分野は飛ばし、同じ区分の公開済みの分野で問題数を保つ（1回目の公開の状態）', () => {
    const open = TOPICS.filter((t) => t.release <= 1).map((t) => t.id)
    const closed = new Set<TopicId>(TOPICS.filter((t) => t.release > 1).map((t) => t.id))
    const s = makeSource(open, fullPools())
    for (const kind of MOCK_KINDS) {
      const nominal = nominalCounts(kind)
      for (let seed = 1; seed <= 10; seed++) {
        const b = buildMock(kind, s, NONE, seed)
        expect(b.questions.some((q) => closed.has(q.topic))).toBe(false)
        expect(b.verbalCount).toBe(nominal.verbal)
        expect(b.nonverbalCount).toBe(nominal.nonverbal)
        expect(new Set(b.questions.map((q) => q.key)).size).toBe(b.questions.length)
      }
    }
  })

  it('組問題が無い（長文読解が未公開）ときは、足りない分を単独の問題で埋める', () => {
    const pools = fullPools()
    delete pools['vb-reading']
    const s = makeSource(ALL_OPEN, pools)
    const b = buildMock('full', s, NONE, 3)
    expect(b.questions.some((q) => q.topic === 'vb-reading')).toBe(false)
    expect(b.verbalCount).toBe(nominalCounts('full').verbal)
    expect(b.questions.every((q) => !q.groupKey || q.topic === 'nv-inference')).toBe(true)
  })

  it('組が小さい（2問）ときは、足りない1問を埋めて全体の問題数を保つ', () => {
    const pools = fullPools()
    pools['nv-inference'] = [
      ...Array.from({ length: 12 }, (_, i) => authoredQ('nv-inference', i + 1)),
      ...[1, 2].map((i) => authoredQ('nv-inference', 100 + i, 'nv-inference-g1')),
    ]
    const s = makeSource(ALL_OPEN, pools)
    const b = buildMock('full', s, NONE, 5)
    expect(b.nonverbalCount).toBe(18)
    expect(b.questions.filter((q) => q.groupKey === 'nv-inference-g1')).toHaveLength(2)
  })

  it('問題が足りないときは少なく出す（落ちない）。何も出せなければ空', () => {
    // 二語の関係が2問しかなく、ほかの言語分野は未公開
    const poor = makeSource(['vb-relation', 'nv-profit'], {
      'vb-relation': [authoredQ('vb-relation', 1), authoredQ('vb-relation', 2)],
    })
    const b = buildMock('mini', poor, NONE, 1)
    expect(b.verbalCount).toBe(2)
    expect(b.nonverbalCount).toBe(7) // 損益算は生成問題なので何問でも作れる
    const none = buildMock('full', makeSource([], {}), NONE, 1)
    expect(none.questions).toEqual([])
    expect(none.verbalCount + none.nonverbalCount).toBe(0)
  })

  it('取り出し口が例外を投げない前提で、生成が空を返す分野は飛ばして埋める', () => {
    const base = makeSource(ALL_OPEN, fullPools())
    const s: MockSource = { ...base, generate: (t, n, seed) => (t === 'nv-table' ? [] : base.generate(t, n, seed)) }
    const b = buildMock('full', s, NONE, 1)
    expect(b.questions.some((q) => q.topic === 'nv-table')).toBe(false)
    expect(b.nonverbalCount).toBe(18)
  })

  it('実際の取り出し口（bank）でも、どの seed でも壊れず、区分の順・重複なしを守る', async () => {
    const { tryBuildMock } = await import('./mockSource')
    for (const kind of MOCK_KINDS) {
      for (let seed = 1; seed <= 5; seed++) {
        const b = tryBuildMock(kind, NONE, seed)
        expect(b).not.toBeNull()
        if (!b) continue
        const keys = b.questions.map((q) => q.key)
        expect(new Set(keys).size).toBe(keys.length)
        expect(b.questions.slice(0, b.verbalCount).every((q) => q.section === 'verbal')).toBe(true)
        expect(b.questions.slice(b.verbalCount).every((q) => q.section === 'nonverbal')).toBe(true)
        expect(b.questions.some((q) => q.topic === 'nv-basics')).toBe(false)
        expect(b.questions.length).toBeLessThanOrEqual(nominalCounts(kind).total + 2)
      }
    }
  })
})

describe('区分・組の位置', () => {
  const qs = [
    authoredQ('vb-relation', 1),
    authoredQ('vb-reading', 1, 'g'),
    authoredQ('vb-reading', 2, 'g'),
    authoredQ('nv-profit', 1),
    authoredQ('nv-profit', 2),
  ]
  it('sectionProgress', () => {
    expect(sectionProgress(qs, 0)).toEqual({ section: 'verbal', no: 1, total: 3 })
    expect(sectionProgress(qs, 2)).toEqual({ section: 'verbal', no: 3, total: 3 })
    expect(sectionProgress(qs, 3)).toEqual({ section: 'nonverbal', no: 1, total: 2 })
  })
  it('groupProgress', () => {
    expect(groupProgress(qs, 0)).toBeNull()
    expect(groupProgress(qs, 1)).toEqual({ no: 1, total: 2 })
    expect(groupProgress(qs, 2)).toEqual({ no: 2, total: 2 })
  })
})

// ---------------------------------------------------------------------------

describe('時間の進み方', () => {
  // 制限時間 10秒・20秒・30秒の3問。全体は100秒
  const qs = [10, 20, 30].map((sec, i) => ({ ...authoredQ('nv-profit', i + 1), targetSec: sec }))
  const total = 100_000
  const t0 = 5_000

  it('制限時間の前は何も変わらない（同じ run を返す）', () => {
    const run = startRun(t0)
    expect(tickRun(run, qs, total, t0)).toBe(run)
    expect(tickRun(run, qs, total, t0 + 9_999)).toBe(run)
  })

  it('制限時間になると、答えないまま次へ進む（時間切れ＝不正解・かかった時間は制限時間）', () => {
    const run = tickRun(startRun(t0), qs, total, t0 + 10_000)
    expect(run.index).toBe(1)
    expect(run.qStartedAt).toBe(t0 + 10_000)
    expect(run.answers).toEqual([{ status: 'timeout', timeMs: 10_000, endedAt: t0 + 10_000 }])
    expect(run.finishedAt).toBeUndefined()
  })

  it('画面が裏に回っていて何問ぶんも過ぎていても、順に時間切れにして正しい位置に戻る', () => {
    const run = tickRun(startRun(t0), qs, total, t0 + 35_000)
    expect(run.answers.map((a) => a.status)).toEqual(['timeout', 'timeout'])
    expect(run.index).toBe(2)
    expect(run.qStartedAt).toBe(t0 + 30_000) // 10秒＋20秒のあと
    // 3問目の残り時間は、そこから数える
    const next = tickRun(run, qs, total, t0 + 59_999)
    expect(next).toBe(run)
    const done = tickRun(run, qs, total, t0 + 60_000)
    expect(done.finishedAt).toBe(t0 + 60_000)
    expect(done.answers.map((a) => a.status)).toEqual(['timeout', 'timeout', 'timeout'])
  })

  it('最後の問題が時間切れになったら、模試は終了する', () => {
    const run = tickRun(startRun(t0), qs, total, t0 + 500_000)
    expect(run.finishedAt).toBe(t0 + 60_000)
    expect(run.index).toBe(3)
  })

  it('全体の時間が切れたら終了し、残りは未回答（いまの問題も未回答）', () => {
    // 全体は25秒。1問目（10秒）は時間切れ、2問目の途中（20秒かかる）で全体の時間が切れる
    const run = tickRun(startRun(t0), qs, 25_000, t0 + 40_000)
    expect(run.finishedAt).toBe(t0 + 25_000)
    expect(run.answers.map((a) => a.status)).toEqual(['timeout', 'unanswered', 'unanswered'])
    expect(run.index).toBe(3)
    // 終わったあとは何も変わらない
    expect(tickRun(run, qs, 25_000, t0 + 90_000)).toBe(run)
  })

  it('全体の時間ちょうどでも終了する', () => {
    const run = tickRun(startRun(t0), qs, 15_000, t0 + 15_000)
    expect(run.finishedAt).toBe(t0 + 15_000)
    expect(run.answers.map((a) => a.status)).toEqual(['timeout', 'unanswered', 'unanswered'])
  })

  it('選んで「次へ」: 正誤が決まり、かかった時間が記録され、次の問題が始まる', () => {
    const run = answerRun(startRun(t0), qs, total, [0], t0 + 4_000)
    expect(run.answers).toEqual([{ status: 'answered', selection: [0], correct: true, timeMs: 4_000, endedAt: t0 + 4_000 }])
    expect(run.index).toBe(1)
    expect(run.qStartedAt).toBe(t0 + 4_000)
    const wrong = answerRun(run, qs, total, [2], t0 + 9_000)
    expect(wrong.answers[1]).toMatchObject({ status: 'answered', correct: false, timeMs: 5_000 })
  })

  it('押すより先に制限時間が過ぎていたら、答えは無効で時間切れ扱い', () => {
    const run = answerRun(startRun(t0), qs, total, [0], t0 + 12_000)
    expect(run.answers).toEqual([{ status: 'timeout', timeMs: 10_000, endedAt: t0 + 10_000 }])
    expect(run.index).toBe(1)
    expect(run.qStartedAt).toBe(t0 + 10_000)
  })

  it('最後の問題に答えたら終了する。全体の時間が切れたあとの回答は無効', () => {
    let run = startRun(t0)
    run = answerRun(run, qs, total, [0], t0 + 1_000)
    run = answerRun(run, qs, total, [0], t0 + 2_000)
    run = answerRun(run, qs, total, [0], t0 + 3_000)
    expect(run.finishedAt).toBe(t0 + 3_000)
    expect(run.answers.every((a) => a.status === 'answered')).toBe(true)
    expect(answerRun(run, qs, total, [0], t0 + 4_000)).toBe(run)

    const late = answerRun(startRun(t0), qs, 8_000, [0], t0 + 9_000)
    expect(late.answers.map((a) => a.status)).toEqual(['unanswered', 'unanswered', 'unanswered'])
    expect(late.finishedAt).toBe(t0 + 8_000)
  })

  it('かかった時間は制限時間を超えて記録されない', () => {
    // 制限時間ちょうど手前で押す
    const run = answerRun(startRun(t0), qs, total, [0], t0 + 9_999)
    const a = run.answers[0]
    expect(a.status === 'answered' && a.timeMs).toBe(9_999)
  })
})

describe('結果の集計と記録', () => {
  const qs = [
    authoredQ('vb-relation', 1),
    authoredQ('vb-relation', 2),
    authoredQ('vb-meaning', 1),
    authoredQ('nv-profit', 1),
    authoredQ('nv-profit', 2),
    authoredQ('nv-ratio', 1),
  ].map((q) => ({ ...q, targetSec: 10 }))
  const total = 35_000
  const t0 = 1_760_000_000_000

  // 問1 正解 / 問2 不正解 / 問3 時間切れ / 問4 正解 / 問5 時間切れ / 問6 全体の時間切れで未回答
  const run = (() => {
    let r = startRun(t0)
    r = answerRun(r, qs, total, [0], t0 + 3_000)
    r = answerRun(r, qs, total, [1], t0 + 6_000)
    r = tickRun(r, qs, total, t0 + 16_000)
    r = answerRun(r, qs, total, [0], t0 + 20_000)
    return tickRun(r, qs, total, t0 + 100_000)
  })()

  it('走らせ方の前提（結果の種類）', () => {
    expect(run.answers.map(outcomeOf)).toEqual(['correct', 'wrong', 'timeout', 'correct', 'timeout', 'unanswered'])
    expect(run.finishedAt).toBe(t0 + 35_000)
  })

  const result = buildMockResult('full', qs, run)

  it('正解数・時間切れ・未回答・かかった時間・区分別・分野別', () => {
    expect(result).toMatchObject({
      id: `full-${t0}`,
      kind: 'full',
      at: new Date(t0 + 35_000).toISOString(),
      total: 6,
      correct: 2,
      timeouts: 2,
      unanswered: 1,
      durationSec: 35,
    })
    expect(result.bySection).toEqual({ verbal: { total: 3, correct: 1 }, nonverbal: { total: 3, correct: 1 } })
    expect(result.byTopic).toEqual({
      'vb-relation': { total: 2, correct: 1 },
      'vb-meaning': { total: 1, correct: 0 },
      'nv-profit': { total: 2, correct: 1 },
      'nv-ratio': { total: 1, correct: 0 },
    })
    // 内訳は問題数を超えない
    expect(result.correct + result.timeouts + result.unanswered).toBeLessThanOrEqual(result.total)
  })

  it('保存する形は storage の検査をそのまま通る', async () => {
    const { migrate } = await import('./storage')
    expect(migrate({ mockResults: [result] }).mockResults).toEqual([result])
  })

  it('記録に残すのは回答した問題と時間切れの問題だけ（未回答は含めない）。時間切れは不正解・制限時間', () => {
    const entries = mockAttemptEntries(qs, run)
    expect(entries.map((e) => e.question.key)).toEqual(qs.slice(0, 5).map((q) => q.key))
    expect(entries.map((e) => e.correct)).toEqual([true, false, false, true, false])
    expect(entries.map((e) => e.timeMs)).toEqual([3_000, 3_000, 10_000, 4_000, 10_000])
    expect(entries.map((e) => e.endedAt)).toEqual([t0 + 3_000, t0 + 6_000, t0 + 16_000, t0 + 20_000, t0 + 30_000])
  })

  it('回答の記録（mode: mock）と復習リスト: 不正解と時間切れが翌日の復習に入る', () => {
    const finishedIso = result.at
    const { attempts, reviews } = applyMockRecord([], [], mockAttemptEntries(qs, run), finishedIso)
    expect(attempts).toHaveLength(5)
    expect(attempts.every((a) => a.mode === 'mock' && !a.usedHint)).toBe(true)
    expect(attempts.map((a) => a.questionKey)).not.toContain(qs[5].key)
    expect(attempts[2]).toMatchObject({ questionKey: qs[2].key, correct: false, timeMs: 10_000, topic: 'vb-meaning' })
    expect(attempts.every((a) => !Number.isNaN(new Date(a.at).getTime()))).toBe(true)

    expect(reviews.map((r) => r.questionKey).sort()).toEqual([qs[1].key, qs[2].key, qs[4].key].sort())
    const day = new Date(finishedIso)
    const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    expect(reviews.every((r) => r.stage === 0 && r.dueDate === addDays(today, 1))).toBe(true)
  })

  it('すでに復習リストにある問題を間違えたら、1回目の復習からやり直し。正解してもリストは変わらない', () => {
    const existing = [
      { questionKey: qs[1].key, topic: qs[1].topic, stage: 2 as const, dueDate: '2099-01-01', addedAt: '2026-10-01T00:00:00.000Z' },
      { questionKey: qs[0].key, topic: qs[0].topic, stage: 1 as const, dueDate: '2099-01-02', addedAt: '2026-10-01T00:00:00.000Z' },
    ]
    const { reviews } = applyMockRecord([], existing, mockAttemptEntries(qs, run), result.at)
    expect(reviews.find((r) => r.questionKey === qs[1].key)?.stage).toBe(0)
    // 正解した問題（問1）は、そのまま
    expect(reviews.find((r) => r.questionKey === qs[0].key)).toEqual(existing[1])
  })

  it('全部時間切れでも、未回答だけでも集計できる', () => {
    const allTimeout = tickRun(startRun(t0), qs, 600_000, t0 + 600_000)
    const r1 = buildMockResult('mini', qs, allTimeout)
    expect(r1).toMatchObject({ correct: 0, timeouts: 6, unanswered: 0, durationSec: 60 })
    const allUnanswered = tickRun(startRun(t0), qs, 5_000, t0 + 5_000)
    // 最初の問題（10秒）が終わる前に全体の時間が切れる
    const r2 = buildMockResult('mini', qs, allUnanswered)
    expect(r2).toMatchObject({ correct: 0, timeouts: 0, unanswered: 6, durationSec: 5 })
    expect(mockAttemptEntries(qs, allUnanswered)).toEqual([])
  })
})

describe('模試の記録の並べ方', () => {
  const mk = (id: string, kind: 'full' | 'mini', at: string): MockResult => ({
    id,
    kind,
    at,
    total: 10,
    correct: 5,
    timeouts: 0,
    unanswered: 0,
    durationSec: 100,
    bySection: { verbal: { total: 5, correct: 3 }, nonverbal: { total: 5, correct: 2 } },
    byTopic: {},
  })
  const list = [
    ...Array.from({ length: 12 }, (_, i) => mk(`f${i}`, 'full', `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`)).reverse(),
    mk('m1', 'mini', '2026-10-20T10:00:00.000Z'),
  ]

  it('種類ごとに直近10回を古い順で返す', () => {
    const full = recentMockResults(list, 'full', 10)
    expect(full.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `f${i + 2}`))
    expect(recentMockResults(list, 'mini').map((r) => r.id)).toEqual(['m1'])
    expect(recentMockResults([], 'full')).toEqual([])
  })

  it('いちばん新しい結果', () => {
    expect(lastMockResult(list)?.id).toBe('m1')
    expect(lastMockResult(list, 'full')?.id).toBe('f11')
    expect(lastMockResult([])).toBeUndefined()
  })
})
