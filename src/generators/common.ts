import type { Difficulty, Generator, Question, TopicId } from '../types'
import { getTopic } from '../data/topics'
import { createRng, type Rng } from '../lib/rng'

export function makeGeneratedKey(generatorId: string, seed: number): string {
  return `${generatorId}#${seed}`
}

export function parseGeneratedKey(key: string): { generatorId: string; seed: number } | null {
  const m = /^(.+)#(\d+)$/.exec(key)
  return m ? { generatorId: m[1], seed: Number(m[2]) } : null
}

/** 生成関数が返す中身。key・分野情報・seed などは defineGenerator が補う */
export type GeneratedBody = Pick<Question, 'stem' | 'choices' | 'answer' | 'explanation'> &
  Partial<Pick<Question, 'format' | 'hint' | 'passage' | 'table' | 'targetSec' | 'groupKey'>>

type GeneratorMeta = {
  id: string
  topic: TopicId
  difficulty: Difficulty
  label: string
}

/**
 * 問題の型を定義する。
 * build には seed から作った乱数 rng が渡る。乱数は必ず rng から取ること（Math.random 禁止）。
 * 条件に合う数字が出るまで引き直すときも rng を使えば、同じ seed で同じ問題になる。
 */
export function defineGenerator(meta: GeneratorMeta, build: (rng: Rng) => GeneratedBody): Generator {
  const topic = getTopic(meta.topic)
  return {
    ...meta,
    generate(seed: number): Question {
      const body = build(createRng(seed))
      return {
        key: makeGeneratedKey(meta.id, seed),
        testType: 'spi',
        section: topic.section,
        topic: meta.topic,
        difficulty: meta.difficulty,
        format: body.format ?? 'single',
        targetSec: body.targetSec ?? topic.targetSec,
        source: 'generated',
        generatorId: meta.id,
        seed,
        ...body,
      }
    },
  }
}

/**
 * 条件を満たす値が出るまで引き直す。
 * 200回で見つからなければ例外（テストで気づけるようにする）
 */
export function retry<T>(rng: Rng, make: (rng: Rng) => T, ok: (v: T) => boolean): T {
  for (let i = 0; i < 200; i++) {
    const v = make(rng)
    if (ok(v)) return v
  }
  throw new Error('retry: 条件を満たす値が見つからない')
}
