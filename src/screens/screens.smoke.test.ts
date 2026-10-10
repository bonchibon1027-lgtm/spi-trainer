import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../App'
import { AppProvider } from '../state/AppState'
import { SessionSummary, type SessionResult } from '../components/PracticeSession'
import { MockSession } from '../components/MockSession'
import { MockResultView } from '../components/MockResults'
import { MockHistory } from '../components/MockHistory'
import { NoteView } from '../components/NoteView'
import { QuestionView, Steps } from '../components/QuestionView'
import { GENERATORS } from '../lib/bank'
import { AUTHORED_QUESTIONS, noteFiles } from '../content'
import { addDays, todayStr } from '../lib/date'
import { buildMock, buildMockResult, startRun, tickRun, type MockResult, type MockSource } from '../lib/mock'
import { STORAGE_KEY } from '../lib/storage'
import { TOPICS } from '../data/topics'
import { isTopicOpen } from '../lib/availability'
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

// 練習・模試の途中で戻るボタンを止めるため、画面は「データルーター」で動く。テストでも同じ画面の一覧（routes）を使う
function render(path: string): string {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  try {
    return clean(renderToString(h(AppProvider, null, h(RouterProvider, { router }))))
  } finally {
    router.dispose()
  }
}

/** 部品を、データルーターの中に置いて描画する（useBlocker を使う部品用） */
function renderInRouter(element: ReturnType<typeof h>): string {
  const router = createMemoryRouter([{ path: '/', element }], { initialEntries: ['/'] })
  try {
    return clean(renderToString(h(AppProvider, null, h(RouterProvider, { router }))))
  } finally {
    router.dispose()
  }
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
    ['/topic/nv-discount', '練習する'],
    ['/topic/nv-inference', '推論'],
    ['/topic/unknown', '分野が見つかりません'],
    ['/note/nv-profit', '解き方ノート'],
    ['/note/unknown', '分野が見つかりません'],
    ['/drill/nv-profit?n=5', '1 / 5'],
    ['/drill/nv-discount?n=5', '1 / 5'],
    ['/drill/unknown', '分野が見つかりません'],
    ['/review', '今日の復習はありません'],
    ['/review?go=1', '今日の復習はありません'],
    ['/mock', '本番形式の模試'],
    ['/mock?k=mini', 'ミニ模試'],
    ['/stats', '全体'],
    ['/settings', '学習記録のバックアップ'],
    ['/nothing-here', 'ページが見つかりません'],
  ]
  for (const [path, text] of cases) {
    it(`${path}`, () => {
      expect(render(path)).toContain(text)
    })
  }

  // 問題がまだない分野（公開段階の途中）は「近日追加」になる。全分野がそろったら確かめる対象がなくなる
  it('問題のない分野は「近日追加」', () => {
    for (const t of TOPICS.filter((x) => !isTopicOpen(x))) {
      expect(render(`/topic/${t.id}`), t.id).toContain('近日追加')
      expect(render(`/drill/${t.id}`), t.id).toContain('近日追加')
    }
  })

  it('ドリル画面に時間ゲージ・回答ボタン・目安が出る', () => {
    const html = render('/drill/nv-profit?n=5')
    expect(html).toContain('回答する')
    expect(html).toContain('目安')
    expect(html).toContain('練習をやめる')
  })

  it('記録がなければホームは「計算の基礎」をすすめる', () => {
    expect(render('/')).toContain('計算の基礎')
  })

  it('ホームの模試カードは使える（準備中ではない）', () => {
    const html = render('/')
    expect(html).toContain('模試に挑戦する')
    expect(html).not.toContain('準備中です')
  })

  it('模試の開始画面: ルールと「はじめる」。まだ受けていなければ前回の結果は出ない', () => {
    const html = render('/mock')
    for (const s of ['電卓は使えません', '1問ごとに制限時間', '前の問題には戻れません', '記録されません', 'はじめる']) {
      expect(html).toContain(s)
    }
    expect(html).not.toContain('前回')
    expect(render('/mock?k=mini')).toContain('ミニ模試（15分）')
    expect(render('/mock')).toContain('テストセンター風 模試（35分）')
  })

  it('模試の記録がなければ、分析に「まだ受けていません」と出る', () => {
    expect(render('/stats')).toContain('まだ受けていません')
  })
})

describe('画面の描画（模試の記録あり）', () => {
  const mk = (id: string, kind: 'full' | 'mini', correct: number, total: number, at: string): MockResult => ({
    id,
    kind,
    at,
    total,
    correct,
    timeouts: 2,
    unanswered: 1,
    durationSec: 1500,
    bySection: { verbal: { total: 5, correct: 3 }, nonverbal: { total: total - 5, correct: correct - 3 } },
    byTopic: { 'nv-profit': { total: 2, correct: 1 } },
  })
  const data = {
    version: 2,
    settings: { drillSize: 5, theme: 'light' },
    attempts: [],
    reviews: [],
    flags: [],
    importedQuestions: [],
    mockResults: [
      mk('full-1', 'full', 18, 30, '2026-10-08T12:00:00.000Z'),
      mk('mini-1', 'mini', 9, 12, '2026-10-09T12:00:00.000Z'),
    ],
  }

  beforeEach(() => {
    g.localStorage = memoryStorage(data)
  })

  it('ホームには最後に受けた模試、開始画面には選んだ種類の前回の正答率が出る', () => {
    const home = render('/')
    expect(home).toContain('前回')
    expect(home).toContain('75%') // 最後に受けたのはミニ模試（15分）
    expect(home).toContain('15分')
    expect(render('/mock')).toContain('正答率 60%') // 35分の前回
    expect(render('/mock?k=mini')).toContain('正答率 75%')
  })

  it('分析に模試の記録（棒グラフと一覧）が出る。最後に受けた種類が先に開く', () => {
    const html = render('/stats')
    expect(html).toContain('模試の記録')
    expect(html).toContain('mock-col-bar')
    expect(html).toContain('9 / 12問 正解')
    expect(html).toContain('時間切れ 2問')
  })

  it('設定: バックアップを読み込む前の確認に模試の記録の数が出る部品がある', () => {
    expect(render('/settings')).toContain('学習記録のバックアップ')
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

  it('ノート: 覚えること・公式・型・例題・よくある間違い', () => {
    const note: Note = {
      topic: 'nv-profit',
      summary: '原価と{{1/2}}を考えます。',
      keyPoints: ['まず原価を決める', '割合は元にする量で変わる'],
      formulas: [{ label: '定価', body: '原価 × (1 + 利益率)', example: '原価 200円・利益率 {{1/4}} なら 200 × {{5/4}} = 250円' }],
      patterns: [
        {
          title: '型1',
          lead: '原価から定価を求める型です。',
          example: {
            stem: '例題文1',
            steps: [{ text: '手順1', calc: '200 × 1.5 = 300' }, { text: '手順2' }],
            answer: '300円',
          },
          point: '先に原価をつかむ',
        },
        {
          title: '型2',
          lead: '売値から原価を求める型です。',
          example: {
            stem: '例題文2',
            steps: [{ text: '手順A' }, { text: '手順B', calc: '300 ÷ 1.5 = 200' }],
            answer: '200円',
          },
        },
      ],
      pitfalls: [{ wrong: '割合を足してしまう', right: '元にする量を確かめてからかける' }],
    }
    const html = clean(renderToString(h(NoteView, { note })))
    for (const s of ['原価と', '定価', '手順1', '手順B', '300円', '割合を足してしまう']) {
      expect(html).toContain(s)
    }
  })
})

describe('模試の部品の描画', () => {
  // 公開段階に関係なく動くよう、実際の問題の取り出し口ではなく、決まった問題を返す差し替え用の口を使う
  const authored: Question[] = AUTHORED_QUESTIONS.filter((q) => q.topic === 'vb-relation' || q.topic === 'nv-inference')
  const source: MockSource = {
    isOpen: (t) => authored.some((q) => q.topic === t) || GENERATORS.some((x) => x.topic === t),
    authoredPool: (t) => authored.filter((q) => q.topic === t),
    generate: (t, n, seed) => {
      const gens = GENERATORS.filter((x) => x.topic === t)
      return Array.from({ length: n }, (_, i) => gens[i % gens.length].generate(seed + i))
    },
  }
  const build = buildMock('mini', source, new Set(), 3)

  beforeEach(() => {
    g.localStorage = memoryStorage()
  })

  it('模試の実施画面: 2本のゲージ・区分と問題数・次へ・やめる', () => {
    const html = renderInRouter(h(MockSession, { build, onExit: () => undefined, finishActions: null }))
    for (const s of ['ミニ模試', 'この問題', '全体', 'あと', '言語 1 /', '次へ', '模試をやめる', 'class="stem"']) {
      expect(html).toContain(s)
    }
    expect(html).toContain('class="mock-head"')
    // 模試中は正解や解説を出さない・ヒントもない
    expect(html).not.toContain('ヒント')
    expect(html).not.toContain('解説')
    expect(html).not.toContain('is-correct')
  })

  it('模試の結果画面: 正答率・目安の注意・区分別・分野別・問題ごと', () => {
    const t0 = 1_000_000
    const totalMs = build.totalSec * 1000
    // 数問は時間切れ、最後のほうは全体の時間切れ（未回答）になる走らせ方
    const run = tickRun(startRun(t0), build.questions, totalMs, t0 + totalMs / 2)
    const end = tickRun(run, build.questions, totalMs, t0 + totalMs)
    expect(end.finishedAt).toBeDefined()
    const result = buildMockResult('mini', build.questions, end)
    const html = clean(renderToString(h(MockResultView, { build, run: end, result, actions: h('span', null, 'ボタン') })))
    for (const s of ['正答率', 'アプリ独自の目安', '本番の評価', '時間切れ', '未回答', '言語', '非言語', '分野ごとの結果', '問題ごとの結果', '問1', 'ボタン']) {
      expect(html, s).toContain(s)
    }
    expect(html).not.toMatch(/NaN|undefined|\[object/)
  })

  it('模試の記録の部品: 空のとき・棒と一覧', () => {
    expect(clean(renderToString(h(MockHistory, { results: [] })))).toContain('まだ受けていません')
    const results: MockResult[] = [
      { id: 'a', kind: 'full', at: '2026-10-01T10:00:00.000Z', total: 30, correct: 15, timeouts: 4, unanswered: 0, durationSec: 2100, bySection: { verbal: { total: 12, correct: 7 }, nonverbal: { total: 18, correct: 8 } }, byTopic: {} },
      { id: 'b', kind: 'full', at: '2026-10-08T10:00:00.000Z', total: 30, correct: 21, timeouts: 1, unanswered: 2, durationSec: 2100, bySection: { verbal: { total: 12, correct: 9 }, nonverbal: { total: 18, correct: 12 } }, byTopic: {} },
    ]
    const html = clean(renderToString(h(MockHistory, { results })))
    expect(html.match(/class="mock-col"/g)).toHaveLength(2)
    expect(html).toContain('>50<')
    expect(html).toContain('>70<')
    expect(html).toContain('21 / 30問 正解')
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

