import { getTopic } from '../data/topics'
import type { TopicId } from '../types'
import { isTopicOpen } from './availability'
import { drawForDrill } from './bank'
import { buildMock, type MockBuild, type MockKind, type MockSource } from './mock'

/** 模試で問題を取り出すときに使う口（bank.ts の関数をそのままつなぐ） */
export const bankMockSource: MockSource = {
  isOpen: (topic: TopicId) => isTopicOpen(getTopic(topic)),
  // 作成問題は、解いていない問題を先にした全問題をもらう（bank.ts の drawForDrill を流用）
  authoredPool: (topic, seen, seed) => drawForDrill(topic, Number.MAX_SAFE_INTEGER, seen, seed),
  generate: (topic, n, seed) => {
    // 生成の途中で例外が出る seed があっても、別の seed で引き直す
    for (let i = 0; i < 5; i++) {
      try {
        return drawForDrill(topic, n, new Set(), seed + i * 7919)
      } catch {
        // 次の seed で試す
      }
    }
    return []
  },
}

/** 画面用。どんな不具合があっても例外を投げず、作れなければ null */
export function tryBuildMock(kind: MockKind, seen: ReadonlySet<string>, seed: number): MockBuild | null {
  try {
    const b = buildMock(kind, bankMockSource, seen, seed)
    return b.questions.length > 0 ? b : null
  } catch {
    return null
  }
}
