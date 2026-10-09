import { describe, expect, it } from 'vitest'
import type { Question, ReviewItem } from '../types'
import {
  applyPracticeResult,
  applyReviewResult,
  buildReviewQueue,
  countDueReviews,
  dueReviews,
  needsReview,
  resolveReviewQuestion,
  type AnswerResult,
  type QuestionSource,
} from './review'

const NOW = '2026-10-10T09:00:00.000Z'
const TODAY = '2026-10-10'

function result(over: Partial<AnswerResult> = {}): AnswerResult {
  return {
    questionKey: 'nv-profit/markup#1',
    topic: 'nv-profit',
    generatorId: 'nv-profit/markup',
    targetSec: 75,
    correct: true,
    usedHint: false,
    timeMs: 60_000,
    ...over,
  }
}

function item(over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    questionKey: 'nv-profit/markup#1',
    topic: 'nv-profit',
    generatorId: 'nv-profit/markup',
    stage: 0,
    dueDate: TODAY,
    addedAt: NOW,
    ...over,
  }
}

describe('needsReview（要復習の条件）', () => {
  const base = { correct: true, usedHint: false, timeMs: 60_000, targetSec: 75 }
  it('正解・ヒントなし・時間内なら不要', () => {
    expect(needsReview(base)).toBe(false)
  })
  it('不正解なら要復習', () => {
    expect(needsReview({ ...base, correct: false })).toBe(true)
  })
  it('ヒントを使ったら要復習', () => {
    expect(needsReview({ ...base, usedHint: true })).toBe(true)
  })
  it('目安の2倍ちょうどは対象外、超えたら要復習', () => {
    expect(needsReview({ ...base, timeMs: 150_000 })).toBe(false)
    expect(needsReview({ ...base, timeMs: 150_001 })).toBe(true)
  })
})

describe('applyPracticeResult（ドリル・模試の結果）', () => {
  it('不正解なら stage 0・翌日で追加される', () => {
    const next = applyPracticeResult([], result({ correct: false }), TODAY, NOW)
    expect(next).toEqual([item({ dueDate: '2026-10-11', addedAt: NOW })])
  })

  it('生成問題は generatorId も持つ。作成問題は持たない', () => {
    const a = applyPracticeResult([], result({ correct: false }), TODAY, NOW)
    expect(a[0].generatorId).toBe('nv-profit/markup')
    const b = applyPracticeResult(
      [],
      result({ questionKey: 'nv-inference-001', topic: 'nv-inference', generatorId: undefined, correct: false }),
      TODAY,
      NOW,
    )
    expect('generatorId' in b[0]).toBe(false)
  })

  it('既に復習リストにあれば stage 0・翌日に戻す', () => {
    const before = [item({ stage: 2, dueDate: '2026-10-20' })]
    const next = applyPracticeResult(before, result({ usedHint: true }), TODAY, NOW)
    expect(next).toHaveLength(1)
    expect(next[0].stage).toBe(0)
    expect(next[0].dueDate).toBe('2026-10-11')
  })

  it('要復習でなければ何も変えない', () => {
    const before = [item({ stage: 1, dueDate: '2026-10-15' })]
    expect(applyPracticeResult(before, result(), TODAY, NOW)).toBe(before)
    expect(applyPracticeResult([], result(), TODAY, NOW)).toEqual([])
  })

  it('時間オーバー（目安の2倍超）でも追加される', () => {
    const next = applyPracticeResult([], result({ timeMs: 200_000 }), TODAY, NOW)
    expect(next).toHaveLength(1)
  })

  it('月またぎの翌日も正しい', () => {
    const next = applyPracticeResult([], result({ correct: false }), '2026-10-31', NOW)
    expect(next[0].dueDate).toBe('2026-11-01')
  })
})

describe('applyReviewResult（復習の結果）', () => {
  const ok = { correct: true, usedHint: false, timeMs: 30_000, targetSec: 75 }

  it('stage 0 → 1（3日後）', () => {
    const next = applyReviewResult([item({ stage: 0 })], 'nv-profit/markup#1', ok, TODAY)
    expect(next[0]).toMatchObject({ stage: 1, dueDate: '2026-10-13' })
  })

  it('stage 1 → 2（7日後）', () => {
    const next = applyReviewResult([item({ stage: 1 })], 'nv-profit/markup#1', ok, TODAY)
    expect(next[0]).toMatchObject({ stage: 2, dueDate: '2026-10-17' })
  })

  it('stage 2 → 卒業（リストから消える）', () => {
    const next = applyReviewResult([item({ stage: 2 })], 'nv-profit/markup#1', ok, TODAY)
    expect(next).toEqual([])
  })

  it('不正解なら stage 0・翌日に戻る', () => {
    const next = applyReviewResult([item({ stage: 2 })], 'nv-profit/markup#1', { ...ok, correct: false }, TODAY)
    expect(next[0]).toMatchObject({ stage: 0, dueDate: '2026-10-11' })
  })

  it('正解でもヒントを使えば進まず stage 0・翌日', () => {
    const next = applyReviewResult([item({ stage: 1 })], 'nv-profit/markup#1', { ...ok, usedHint: true }, TODAY)
    expect(next[0]).toMatchObject({ stage: 0, dueDate: '2026-10-11' })
  })

  it('ほかの項目は変えない。項目が無ければ何もしない', () => {
    const other = item({ questionKey: 'other', stage: 1 })
    const target = item({ stage: 0 })
    const next = applyReviewResult([other, target], 'nv-profit/markup#1', ok, TODAY)
    expect(next[0]).toBe(other)
    const same = [other]
    expect(applyReviewResult(same, 'missing', ok, TODAY)).toBe(same)
  })
})

describe('dueReviews（今日の復習）', () => {
  it('期限が今日以前のものだけ、古い順', () => {
    const list = [
      item({ questionKey: 'c', dueDate: '2026-10-11' }),
      item({ questionKey: 'b', dueDate: '2026-10-10' }),
      item({ questionKey: 'a', dueDate: '2026-10-08' }),
    ]
    expect(dueReviews(list, TODAY).map((r) => r.questionKey)).toEqual(['a', 'b'])
  })
})

// 問題の取り出し口を差し替えて確認する
function fakeQuestion(key: string, extra: Partial<Question> = {}): Question {
  return {
    key,
    testType: 'spi',
    section: 'nonverbal',
    topic: 'nv-profit',
    difficulty: 1,
    format: 'single',
    stem: 'q',
    choices: ['a', 'b'],
    answer: 0,
    explanation: ['x'],
    targetSec: 75,
    source: 'authored',
    ...extra,
  }
}

const src: QuestionSource = {
  getQuestionByKey: (key) => (key === 'missing' ? undefined : fakeQuestion(key)),
  freshVariant: (gid, seed = 999) => (gid === 'none' ? undefined : fakeQuestion(`${gid}#${seed}`, { generatorId: gid })),
}

describe('resolveReviewQuestion（復習で出す問題）', () => {
  it('stage 0 は同じ問題', () => {
    expect(resolveReviewQuestion(item({ stage: 0 }), src)?.key).toBe('nv-profit/markup#1')
  })
  it('stage 1 以降で generatorId があれば同じ型の新しい問題', () => {
    expect(resolveReviewQuestion(item({ stage: 1 }), src, 7)?.key).toBe('nv-profit/markup#7')
    expect(resolveReviewQuestion(item({ stage: 2 }), src, 8)?.key).toBe('nv-profit/markup#8')
  })
  it('作成問題（generatorId なし）は常に同じ問題', () => {
    const it2 = item({ questionKey: 'nv-inference-003', topic: 'nv-inference', generatorId: undefined, stage: 2 })
    expect(resolveReviewQuestion(it2, src)?.key).toBe('nv-inference-003')
  })
  it('問題が見つからなければ undefined', () => {
    expect(resolveReviewQuestion(item({ questionKey: 'missing', generatorId: undefined }), src)).toBeUndefined()
    expect(resolveReviewQuestion(item({ stage: 1, generatorId: 'none' }), src)).toBeUndefined()
  })
})

describe('buildReviewQueue / countDueReviews', () => {
  const list = [
    item({ questionKey: 'a#1', generatorId: 'g/a', stage: 0, dueDate: '2026-10-09' }),
    item({ questionKey: 'missing', generatorId: undefined, stage: 0, dueDate: '2026-10-09' }),
    item({ questionKey: 'c#1', generatorId: 'g/c', stage: 1, dueDate: '2026-10-10' }),
    item({ questionKey: 'd#1', generatorId: 'g/d', stage: 0, dueDate: '2026-10-12' }),
  ]
  it('見つからない問題は飛ばし、期限前は含めない', () => {
    const queue = buildReviewQueue(list, TODAY, src)
    expect(queue.map((x) => x.item.questionKey)).toEqual(['a#1', 'c#1'])
    expect(queue[1].question.generatorId).toBe('g/c')
  })
  it('件数も同じ数え方', () => {
    expect(countDueReviews(list, TODAY, src)).toBe(2)
  })
})

describe('問題の取り出しで例外が出ても止まらない', () => {
  it('例外は「見つからない」として扱う', () => {
    const boom: QuestionSource = {
      getQuestionByKey: () => {
        throw new Error('x')
      },
      freshVariant: () => {
        throw new Error('y')
      },
    }
    expect(resolveReviewQuestion(item({ stage: 0 }), boom)).toBeUndefined()
    expect(resolveReviewQuestion(item({ stage: 1 }), boom)).toBeUndefined()
    expect(buildReviewQueue([item({ stage: 1 })], TODAY, boom)).toEqual([])
  })

  it('新しい seed の問題は、作れない seed に当たったら引き直す', () => {
    let calls = 0
    const flaky: QuestionSource = {
      getQuestionByKey: () => undefined,
      freshVariant: (gid) => {
        calls++
        if (calls < 3) throw new Error('bad seed')
        return fakeQuestion(`${gid}#ok`, { generatorId: gid })
      },
    }
    const queue = buildReviewQueue([item({ stage: 1 })], TODAY, flaky)
    expect(queue).toHaveLength(1)
    expect(calls).toBe(3)
  })
})

