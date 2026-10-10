import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Figure, Note } from '../../types'
import { validateFigure, validateNote } from '../../lib/validate'
import { NoteView, NoteNotReady, splitSentences } from '../NoteView'
import { FigureView } from './FigureView'
import { numberLeaves } from './TreeFigure'
import { LINE_W, packLanes, planLine, planTape, textEm, type LineFigureData } from './layout'
import { SAMPLE_NOTE } from './sampleNote'

/** サーバー描画が文字の間に入れる <!-- --> を取り除く */
function clean(html: string): string {
  return html.replace(/<!-- -->/g, '')
}

function render(figure: Figure): string {
  return clean(renderToString(h(FigureView, { figure })))
}

const FIGURES: { name: string; figure: Figure; words: string[]; cls: string }[] = [
  {
    name: 'tape',
    figure: {
      type: 'tape',
      rows: [
        {
          label: '定価',
          segments: [
            { text: '原価 2,000円', size: 10, tone: 'base' },
            { text: '利益 400円', size: 2, tone: 'ok' },
          ],
          total: '2,400円',
        },
      ],
      caption: '2割の利益を見込む',
    },
    words: ['定価', '原価 2,000円', '利益 400円', '2,400円', '2割の利益を見込む'],
    cls: 'fg-tape',
  },
  {
    name: 'venn2',
    figure: { type: 'venn2', labels: ['朝食', '自炊'], onlyA: '18人', both: '4人', onlyB: '14人', outside: '4人', total: '全体 40人' },
    words: ['朝食', '自炊', '18人', '4人', '14人', '全体 40人', '<circle'],
    cls: 'fg-venn2',
  },
  {
    name: 'line',
    figure: {
      type: 'line',
      points: [
        { at: 0, label: 'P', sub: '9:10' },
        { at: 1250, label: 'Q', sub: '9:35' },
      ],
      spans: [{ from: 0, to: 1250, text: '1,250m（分速50m → 25分）', tone: 'base' }],
    },
    words: ['P', '9:10', 'Q', '9:35', '1,250m（分速50m → 25分）'],
    cls: 'fg-line',
  },
  {
    name: 'flow',
    figure: {
      type: 'flow',
      items: [
        { title: '7%', lines: ['300g', '食塩 21g'] },
        '+',
        { title: '6%', lines: ['200g', '食塩 12g'] },
        '=',
        { title: '?%', lines: ['500g', '食塩 33g'], tone: 'ok' },
      ],
    },
    words: ['7%', '食塩 21g', '+', '6%', '=', '食塩 33g'],
    cls: 'fg-flow',
  },
  {
    name: 'tree',
    figure: {
      type: 'tree',
      nodes: [
        { label: 'A', children: [{ label: 'B' }, { label: 'C' }] },
        { label: 'B', children: [{ label: 'A' }, { label: 'C' }] },
      ],
    },
    words: ['A', 'B', 'C', 'fg-tn-kids', '枝先（いちばん右）の数: 4個'],
    cls: 'fg-tree',
  },
  {
    name: 'table',
    figure: {
      type: 'table',
      table: { headers: ['年', '売上'], rows: [['昨年', '400万円'], ['今年', '{{3/5}}']] },
      highlight: [[1, 1]],
    },
    words: ['昨年', '400万円', 'class="is-hl"', 'class="frac"'],
    cls: 'fg-table',
  },
  {
    name: 'slots',
    figure: {
      type: 'slots',
      rows: [
        {
          label: '①',
          cells: [
            { head: '1位', text: 'P', tone: 'ok' },
            { head: '2位', text: 'S' },
            { head: '3位', text: 'Q' },
            { head: '4位', text: 'R' },
          ],
        },
      ],
    },
    words: ['①', '1位', 'P', '4位', 'R', 'fg-t-ok'],
    cls: 'fg-slots',
  },
]

describe('図の描画（FigureView）', () => {
  for (const c of FIGURES) {
    it(`${c.name}: 検査を通り、例外なく描けて主な文字が出る`, () => {
      const errors: string[] = []
      validateFigure(c.name, c.figure, errors)
      expect(errors).toEqual([])
      const html = render(c.figure)
      expect(html).toContain(c.cls)
      for (const w of c.words) expect(html, w).toContain(w)
      expect(html).not.toMatch(/NaN|undefined|\[object/)
    })
  }

  it('不正な図でも例外にならない', () => {
    expect(() => renderToString(h(FigureView, { figure: null as unknown as Figure }))).not.toThrow()
  })
})

describe('テープ図の配置', () => {
  const rows = [
    {
      label: '定価',
      segments: [
        { text: '原価 2,000円', size: 10 },
        { text: '利益 400円', size: 2 },
      ],
      total: '2,400円',
    },
  ]

  it('狭い区切りは帯の下の注記に回り、全文が読める', () => {
    const plan = planTape(rows)
    expect(plan.segs[0][0].fits).toBe(true)
    expect(plan.segs[0][1].fits).toBe(false)
    expect(plan.segs[0][1].mark).toBe('①')
    const html = render({ type: 'tape', rows })
    // 帯の中には印だけ、注記に全文
    expect(html).toContain('fg-tp-note')
    expect(html).toContain('利益 400円')
  })

  it('広い区切りは帯の中に収まる', () => {
    const plan = planTape([{ segments: [{ text: 'A（4）', size: 4 }, { text: 'B（5）', size: 5 }] }])
    expect(plan.segs[0].every((s) => s.fits)).toBe(true)
    expect(render({ type: 'tape', rows: [{ segments: [{ text: 'A（4）', size: 4 }] }] })).not.toContain('fg-tp-note')
  })

  it('行どうしは同じ尺度で、いちばん長い行が全幅', () => {
    const plan = planTape([
      { segments: [{ text: '長', size: 10 }] },
      { segments: [{ text: '短', size: 5 }] },
    ])
    expect(plan.rowPct[0]).toBe(100)
    expect(plan.rowPct[1]).toBe(50)
  })
})

describe('数直線・道のり図の配置', () => {
  const base: LineFigureData = {
    type: 'line',
    points: [
      { at: 0, label: 'P' },
      { at: 600, label: 'Q', sub: '600m' },
      { at: 1500, label: 'R' },
    ],
  }

  it('離れた点は、すべて線のすぐ下(0段)に真下中央で置く', () => {
    const plan = planLine(base)
    expect(plan.points.map((p) => p.level)).toEqual([0, 0, 0])
    expect(plan.points[1].align).toBe('c')
    expect(plan.points[0].pct).toBeLessThan(plan.points[1].pct)
    expect(plan.points[1].pct).toBeLessThan(plan.points[2].pct)
  })

  it('両端の点は、はみ出さないよう中に向けてずらす', () => {
    const plan = planLine({
      type: 'line',
      points: [
        { at: 0, label: 'スタート地点', sub: '9:00' },
        { at: 100, label: 'ゴール地点', sub: '9:30' },
      ],
    })
    expect(plan.points[0].align).not.toBe('l')
    expect(plan.points[1].align).not.toBe('r')
  })

  it('近すぎる点は、重ならないようにずらす・段を変える', () => {
    const f: LineFigureData = {
      type: 'line',
      points: [
        { at: 0, label: '出発', sub: '9:00' },
        { at: 3, label: '信号', sub: '9:03' },
        { at: 6, label: '駅', sub: '9:06' },
        { at: 9, label: '店', sub: '9:09' },
        { at: 100, label: '到着', sub: '10:40' },
      ],
    }
    const plan = planLine(f)
    // 文字の区間（真下中央・左右への伸ばし）を、段ごとに重なりがないか確かめる
    const boxes = plan.points.map((p, i) => {
      const x = (p.pct / 100) * LINE_W
      const w = Math.max(textEm(f.points[i].label) * 15.5, textEm(f.points[i].sub ?? '') * 12.5) + 8
      const start = p.align === 'c' ? x - w / 2 : p.align === 'r' ? x - 6 : x + 6 - w
      return { level: p.level, start, end: start + w }
    })
    for (let i = 0; i < boxes.length; i++) {
      expect(boxes[i].start).toBeGreaterThanOrEqual(0)
      expect(boxes[i].end).toBeLessThanOrEqual(LINE_W)
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].level !== boxes[j].level) continue
        const overlap = boxes[i].start < boxes[j].end && boxes[j].start < boxes[i].end
        expect(overlap, `${i} と ${j} が重なる`).toBe(false)
      }
    }
    // 4つ近い点があるので、1段だけでは足りず、2段以上使う
    expect(plan.levels).toBeGreaterThan(1)
    expect(plan.height).toBeGreaterThan(planLine(base).height)
    const html = render(f)
    for (const w of ['出発', '信号', '駅', '店', '到着', 'fg-ln-leader']) expect(html, w).toContain(w)
  })

  it('区間は、重なるものを上の段に積み、大きな区間ほど上になる', () => {
    const plan = planLine({
      ...base,
      spans: [
        { from: 0, to: 1500, text: '全体 1,500m' },
        { from: 0, to: 600, text: 'PQ 600m' },
        { from: 600, to: 1500, text: 'QR 900m' },
      ],
    })
    expect(plan.lanes).toBe(2)
    expect(plan.spans[1].lane).toBe(0)
    expect(plan.spans[2].lane).toBe(0)
    expect(plan.spans[0].lane).toBe(1)
  })

  it('packLanes: 重ならない区間は同じ段、重なる区間は別の段', () => {
    expect(
      packLanes([
        { start: 0, end: 10 },
        { start: 5, end: 15 },
        { start: 10, end: 20 },
      ]),
    ).toEqual([0, 1, 0])
  })
})

describe('樹形図', () => {
  it('末端に上から順に番号を振る', () => {
    const a = { label: 'B' }
    const b = { label: 'C' }
    const c = { label: 'D' }
    const root = { label: 'A', children: [a, { label: 'X', children: [b] }, c] }
    const nums = numberLeaves([root])
    expect([nums.get(a), nums.get(b), nums.get(c)]).toEqual([1, 2, 3])
    expect(nums.has(root)).toBe(false)
  })

  it('最上段が1つだけのときは出発点の丸を置かない', () => {
    const one = render({ type: 'tree', nodes: [{ label: 'A', children: [{ label: 'B' }] }] })
    expect(one).not.toContain('fg-tn-start')
    const two = render({ type: 'tree', nodes: [{ label: 'A' }, { label: 'B' }] })
    expect(two).toContain('fg-tn-start')
  })
})

describe('ノートの画面（NoteView）', () => {
  it('見本ノートは検査を通り、すべての図の種類を使っている', () => {
    expect(validateNote(SAMPLE_NOTE)).toEqual([])
    const types = new Set<string>()
    for (const p of SAMPLE_NOTE.patterns) {
      if (p.example.figure) types.add(p.example.figure.type)
      if (p.example.table) types.add('table')
      for (const s of p.example.steps) if (s.figure) types.add(s.figure.type)
    }
    expect([...types].sort()).toEqual(['flow', 'line', 'slots', 'table', 'tape', 'tree', 'venn2'])
  })

  it('見本ノートが描け、各セクションの見出し・目次・答え・コツ・間違いが出る', () => {
    const html = clean(renderToString(h(NoteView, { note: SAMPLE_NOTE })))
    for (const w of [
      'この分野で聞かれること',
      'まず覚えること',
      '公式',
      '型ごとの解き方',
      'よくある間違い',
      '聞かれること',
      '型1',
      '型7',
      '例題',
      '解き方',
      '答え',
      '2,400円',
      '6.6%',
      'コツ',
      '間違い',
      '正しくは',
      'すべて開く',
      // 折りたたまれた型の中身も描かれている
      '会長A',
      '1,500m',
    ]) {
      expect(html, w).toContain(w)
    }
    expect(html).not.toMatch(/NaN|undefined|\[object/)
    // 最初の型だけ開いている
    expect((html.match(/<details[^>]*\sopen=""/g) ?? []).length).toBe(1)
  })

  it('古い形・壊れた形のノートや、ノートなしは「準備中」で、例外にならない', () => {
    const old = { topic: 'nv-ratio', summary: 'a', formulas: [{ label: 'x', body: 'y' }], patterns: [{ title: 't', steps: ['s'] }], pitfalls: ['p'] }
    const broken = { topic: 'nv-ratio', patterns: null } as unknown
    for (const note of [old, broken, undefined, null, 'x', 5]) {
      const html = clean(renderToString(h(NoteView, { note: note as unknown as Note })))
      expect(html).toContain('このノートは準備中です')
      expect(html).not.toContain('この分野で聞かれること')
    }
    expect(clean(renderToString(h(NoteNotReady)))).toContain('このノートは準備中です')
  })

  it('splitSentences: 「。」で区切り、閉じかっこの前では区切らない', () => {
    expect(splitSentences('A です。B です。C')).toEqual(['A です。', 'B です。', 'C'])
    expect(splitSentences('「やる。」と言う。次')).toEqual(['「やる。」と言う。', '次'])
  })
})
