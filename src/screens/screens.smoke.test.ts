import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { AppProvider } from '../state/AppState'
import { SessionSummary, type SessionResult } from '../components/PracticeSession'
import { NoteView } from '../components/NoteView'
import { QuestionView, Steps } from '../components/QuestionView'
import { GENERATORS } from '../lib/bank'
import { AUTHORED_QUESTIONS, noteFiles } from '../content'
import { addDays, todayStr } from '../lib/date'
import { STORAGE_KEY } from '../lib/storage'
import type { Note, Question } from '../types'

// 画面の「最初の描画」が例外なく出ることの確認（ブラウザなしで動く簡易テスト）。
// クリックなどの操作は確認できないので、操作の確認はブラウザで行う。

function memoryStorage(initial?: unknown): Storage {
  const m = new Map<string, string>()
  if (initial !== undefined) m.set(STORAGE_KEY, JSON.stringify(initial))
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

/** サーバー描画が文字の間に入れる <!-- --> を取り除く */
function clean(html: string): string {
  return html.replace(/<!-- -->/g, '')
}

function render(path: string): string {
  return clean(renderToString(h(AppProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(App)))))
}

// react-router がサーバー描画のとき出す useLayoutEffect の警告は、このテストでは無関係
beforeAll(() => {
  const orig = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect')) return
    orig(...args)
  }
})

const g = globalThis as unknown as { localStorage?: Storage }

afterEach(() => {
  delete g.localStorage
})

describe('画面の描画（記録なし）', () => {
  beforeEach(() => {
    g.localStorage = memoryStorage()
  })

  const cases: [string, string][] = [
    ['/', 'SPIは株式会社リクルートの登録商標'],
    ['/topics', '損益算'],
    ['/topics?s=verbal', '二語の関係'],
    ['/topic/nv-profit', '練習する'],
    ['/topic/nv-discount', '近日追加'],
    ['/topic/nv-inference', '推論'],
    ['/topic/unknown', '分野が見つかりません'],
    ['/note/nv-profit', '解き方ノート'],
    ['/note/unknown', '分野が見つかりません'],
    ['/drill/nv-profit?n=5', '1 / 5'],
    ['/drill/nv-discount', '近日追加'],
    ['/drill/unknown', '分野が見つかりません'],
    ['/review', '今日の復習はありません'],
    ['/review?go=1', '今日の復習はありません'],
    ['/stats', '全体'],
    ['/settings', '学習記録のバックアップ'],
    ['/nothing-here', 'ページが見つかりません'],
  ]
  for (const [path, text] of cases) {
    it(`${path}`, () => {
      expect(render(path)).toContain(text)
    })
  }

  it('ドリル画面に時間ゲージ・回答ボタン・目安が出る', () => {
    const html = render('/drill/nv-profit?n=5')
    expect(html).toContain('回答する')
    expect(html).toContain('目安')
    expect(html).toContain('練習をやめる')
  })

  it('記録がなければホームは「計算の基礎」をすすめる', () => {
    expect(render('/')).toContain('計算の基礎')
  })
})

describe('画面の描画（記録あり）', () => {
  const today = todayStr()
  const gen = GENERATORS.find((x) => x.topic === 'nv-profit')!
  const q = gen.generate(7)
  const at = new Date().toISOString()
  const data = {
    version: 1,
    settings: { examDate: addDays(today, 20), drillSize: 10, theme: 'dark' },
    attempts: [
      { questionKey: q.key, topic: 'nv-profit', mode: 'drill', correct: false, usedHint: true, timeMs: 90000, at },
      { questionKey: q.key, topic: 'nv-profit', mode: 'review', correct: true, usedHint: false, timeMs: 40000, at },
    ],
    reviews: [
      { questionKey: q.key, topic: 'nv-profit', generatorId: gen.id, stage: 0, dueDate: today, addedAt: at },
      { questionKey: 'nv-profit/markup#99', topic: 'nv-profit', generatorId: gen.id, stage: 1, dueDate: addDays(today, -1), addedAt: at },
      { questionKey: 'gone-001', topic: 'nv-inference', stage: 0, dueDate: today, addedAt: at },
      { questionKey: 'nv-profit/markup#5', topic: 'nv-profit', generatorId: gen.id, stage: 2, dueDate: addDays(today, 3), addedAt: at },
    ],
    flags: [{ questionKey: q.key, memo: '数字がおかしい', at }],
    importedQuestions: [],
  }

  beforeEach(() => {
    g.localStorage = memoryStorage(data)
  })

  it('ホーム: 残り日数と今日の復習（出せない問題は数えない）', () => {
    const html = render('/')
    expect(html).toContain('20')
    expect(html).toContain('復習をはじめる')
    expect(html).toContain('今日解いた問題')
  })

  it('復習を始めると1問目が出る', () => {
    const html = render('/review?go=1')
    expect(html).toContain('今日の復習')
    expect(html).toContain('1 / 2')
    expect(html).toContain('回答する')
  })

  it('復習の予定・分析・設定・分野の一覧', () => {
    expect(render('/review')).toContain('復習の予定')
    expect(render('/stats')).toContain('正答率')
    const settings = render('/settings')
    expect(settings).toContain(q.key)
    expect(settings).toContain('数字がおかしい')
    expect(render('/topics')).toContain('正答率')
    expect(render('/topic/nv-profit')).toContain('挑戦数')
  })
})

describe('部品の描画', () => {
  const q: Question = {
    key: 'nv-inference-001',
    testType: 'spi',
    section: 'nonverbal',
    topic: 'nv-inference',
    difficulty: 1,
    format: 'multi',
    passage: '前提その1\n前提その2',
    table: { headers: ['名前', '割合'], rows: [['A', '{{1/2}}'], ['B', '{{3/4}}']] },
    stem: '{{2/3}}を求めなさい。',
    choices: ['ア', '{{1/3}}', 'ウ'],
    answer: [0, 2],
    explanation: ['一歩目', '{{2/3}} × 6 = 4', '答え: ア、ウ'],
    targetSec: 90,
    source: 'authored',
  }

  it('回答後は正解と選んだ誤答の印が出る。分数は縦に積む', () => {
    const html = clean(renderToString(h(QuestionView, { question: q, selection: [0, 1], reveal: true })))
    expect(html).toContain('is-correct')
    expect(html).toContain('is-wrong')
    expect(html).toContain('class="frac"')
    expect(html).toContain('<br/>')
    expect(html).toContain('あなたの答え')
    expect(html).toContain('当てはまるものをすべて選んでください')
  })

  it('解説は最初の1ステップだけ。全部表示を指定すると全部出る', () => {
    const one = clean(renderToString(h(Steps, { steps: q.explanation })))
    expect(one).toContain('一歩目')
    expect(one).not.toContain('答え: ア、ウ')
    expect(one).toContain('次のステップ')
    const all = clean(renderToString(h(Steps, { steps: q.explanation, showAll: true })))
    expect(all).toContain('答え: ア、ウ')
    expect(all).not.toContain('次のステップ')
  })

  it('数値入力の問題も描画できる', () => {
    const n: Question = { ...q, format: 'numeric', choices: undefined, answer: '12' }
    const html = clean(renderToString(h(QuestionView, { question: n, selection: '12', reveal: true })))
    expect(html).toContain('正解')
  })

  it('終了画面: 正解数・時間・問題ごとの結果', () => {
    const results: SessionResult[] = [
      { question: q, correct: true, usedHint: false, timeMs: 30000, selection: [0, 2] },
      { question: q, correct: false, usedHint: true, timeMs: 200000, selection: [1] },
    ]
    const html = clean(
      renderToString(h(MemoryRouter, null, h(SessionSummary, { title: '推論', mode: 'drill', results, actions: h('span', null, 'ボタン') }))),
    )
    expect(html).toContain('1')
    expect(html).toContain('/ 2問 正解')
    expect(html).toContain('合計 3分50秒')
    expect(html).toContain('復習リストに入った問題: 1問')
    expect(html).toContain('問1')
    expect(html).toContain('問2')
  })

  it('ノート: 公式・型・例題・よくある間違い', () => {
    const note: Note = {
      topic: 'nv-profit',
      summary: '原価と{{1/2}}を考えます。',
      formulas: [{ label: '定価', body: '原価 × (1 + 利益率)' }],
      patterns: [{ title: '型1', steps: ['手順1', '手順2'] }],
      examples: [{ stem: '例題文', steps: ['式1', '式2'], answer: '300円' }],
      pitfalls: ['割合を足してしまう'],
    }
    const html = clean(renderToString(h(NoteView, { note })))
    for (const s of ['覚える公式', '型と解き方', '例題', 'よくある間違い', '解き方を見る', '答え: 300円']) {
      expect(html).toContain(s)
    }
  })
})

describe('実際の問題・ノートがすべて描画できる', () => {
  it('作成問題・生成問題（各型の数問）を、回答前・回答後の両方で描画できる', () => {
    const qs: Question[] = [...AUTHORED_QUESTIONS]
    for (const gen of GENERATORS) {
      for (let seed = 1; seed <= 5; seed++) {
        try {
          qs.push(gen.generate(seed))
        } catch {
          // 生成そのものの不具合は generators.test.ts が見つける。ここでは描画だけを確認する
        }
      }
    }
    expect(qs.length).toBeGreaterThan(0)
    for (const q of qs) {
      const before = clean(renderToString(h(QuestionView, { question: q, selection: q.format === 'numeric' ? '' : [] })))
      expect(before, q.key).toContain('class="stem"')
      const after = clean(renderToString(h(QuestionView, { question: q, selection: q.format === 'numeric' ? '1' : [0], reveal: true })))
      expect(after, q.key).not.toMatch(/NaN|undefined|\[object/)
      const steps = clean(renderToString(h(Steps, { steps: q.explanation, showAll: true })))
      expect(steps, q.key).not.toMatch(/NaN|undefined|\[object/)
    }
  })

  it('ノートがすべて描画できる', () => {
    for (const [file, note] of Object.entries(noteFiles)) {
      const html = clean(renderToString(h(NoteView, { note })))
      expect(html, file).toContain('この分野で聞かれること')
    }
  })

  it('問題がある分野のドリル・ノートのページが描画できる', () => {
    g.localStorage = memoryStorage()
    for (const t of new Set(AUTHORED_QUESTIONS.map((q) => q.topic))) {
      expect(render(`/drill/${t}`), t).toContain('回答する')
      expect(render(`/topic/${t}`), t).toContain('練習する')
    }
    for (const file of Object.keys(noteFiles)) {
      expect(render(`/note/${file}`), file).toContain('解き方ノート')
    }
  })
})

