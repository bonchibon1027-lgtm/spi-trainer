import type { Figure, Note, NoteExample, Question, Table, TreeNode } from '../types'
import { isTopicId } from '../data/topics'

// 問題データの検査。生成問題・作成問題・取り込み問題のすべてに使う。
// 戻り値は問題点の一覧（空なら OK）。

const FRAC_RE = /\{\{([^{}]*)\}\}/g

function checkText(label: string, s: string, errors: string[]) {
  if (typeof s !== 'string' || s.trim() === '') {
    errors.push(`${label} が空`)
    return
  }
  if (/NaN|undefined|Infinity|\[object /.test(s)) errors.push(`${label} に不正な値: ${s}`)
  for (const m of s.matchAll(FRAC_RE)) {
    if (!/^-?\d+\/\d+$/.test(m[1])) errors.push(`${label} の分数表記が不正: {{${m[1]}}}`)
  }
  // 閉じ忘れ
  const opens = (s.match(/\{\{/g) ?? []).length
  const closes = (s.match(/\}\}/g) ?? []).length
  if (opens !== closes) errors.push(`${label} の {{ }} が対応していない`)
}

export function validateQuestion(q: Question): string[] {
  const errors: string[] = []
  if (!q.key) errors.push('key が空')
  if (!isTopicId(q.topic)) errors.push(`topic が不正: ${q.topic}`)
  if (![1, 2, 3].includes(q.difficulty)) errors.push(`difficulty が不正: ${q.difficulty}`)
  if (!(q.targetSec > 0)) errors.push('targetSec が不正')
  checkText('stem', q.stem, errors)
  if (q.passage !== undefined) checkText('passage', q.passage, errors)
  if (q.hint !== undefined) checkText('hint', q.hint, errors)

  if (!Array.isArray(q.explanation) || q.explanation.length === 0) {
    errors.push('explanation が空')
  } else {
    q.explanation.forEach((s, i) => checkText(`explanation[${i}]`, s, errors))
  }

  if (q.table) {
    const w = q.table.headers.length
    if (w === 0) errors.push('table.headers が空')
    q.table.rows.forEach((r, i) => {
      if (r.length !== w) errors.push(`table.rows[${i}] の列数が見出しと違う`)
    })
  }

  if (q.format === 'single' || q.format === 'multi') {
    const c = q.choices
    if (!c || c.length < 2) {
      errors.push('choices が2つ未満')
      return errors
    }
    c.forEach((s, i) => checkText(`choices[${i}]`, s, errors))
    if (new Set(c).size !== c.length) errors.push(`choices が重複: ${c.join(' / ')}`)

    if (q.format === 'single') {
      if (typeof q.answer !== 'number' || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= c.length) {
        errors.push(`answer が choices の範囲外: ${JSON.stringify(q.answer)}`)
      }
    } else {
      const a = q.answer
      if (!Array.isArray(a) || a.length === 0) {
        errors.push('multi の answer は空でない配列')
      } else {
        if (a.some((i) => !Number.isInteger(i) || i < 0 || i >= c.length)) errors.push('answer が choices の範囲外')
        if (new Set(a).size !== a.length) errors.push('answer が重複')
        if (a.some((v, i) => i > 0 && a[i - 1] > v)) errors.push('answer は昇順にする')
      }
    }
  } else if (q.format === 'numeric') {
    if (typeof q.answer !== 'string' || q.answer.trim() === '') errors.push('numeric の answer は空でない文字列')
  } else {
    errors.push(`format が不正: ${q.format}`)
  }

  if (q.source === 'generated') {
    if (!q.generatorId || q.seed === undefined) errors.push('生成問題に generatorId / seed がない')
    else if (q.key !== `${q.generatorId}#${q.seed}`) errors.push(`生成問題の key が "<generatorId>#<seed>" でない: ${q.key}`)
  }

  return errors
}

/** single 形式の正解の文字列（解説の最後に正解が書かれているかの検査などに使う） */
export function correctChoiceText(q: Question): string | undefined {
  if (q.format === 'single' && q.choices && typeof q.answer === 'number') return q.choices[q.answer]
  return undefined
}

// ---- 解き方ノート ----

const TONES = ['base', 'accent', 'ok', 'ng', 'warn', 'muted']

function checkTone(label: string, tone: unknown, errors: string[]) {
  if (tone !== undefined && !TONES.includes(tone as string)) errors.push(`${label} の tone が不正: ${String(tone)}`)
}

function checkTable(label: string, t: Table | undefined, errors: string[]) {
  if (!t || !Array.isArray(t.headers) || !Array.isArray(t.rows)) {
    errors.push(`${label} の table が不正`)
    return
  }
  const w = t.headers.length
  if (w === 0) errors.push(`${label}.headers が空`)
  t.rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length !== w) errors.push(`${label}.rows[${i}] の列数が見出しと違う`)
  })
}

function checkTree(label: string, nodes: TreeNode[] | undefined, depth: number, errors: string[]) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push(`${label} が空`)
    return
  }
  if (depth > 3) errors.push(`${label} は3段まで`)
  nodes.forEach((n, i) => {
    checkText(`${label}[${i}].label`, n.label, errors)
    checkTone(`${label}[${i}]`, n.tone, errors)
    if (n.children !== undefined) checkTree(`${label}[${i}].children`, n.children, depth + 1, errors)
  })
}

export function validateFigure(label: string, f: Figure, errors: string[]): void {
  if (!f || typeof f !== 'object') {
    errors.push(`${label} が不正`)
    return
  }
  if (f.caption !== undefined) checkText(`${label}.caption`, f.caption, errors)
  switch (f.type) {
    case 'tape':
      if (!f.rows?.length) errors.push(`${label}.rows が空`)
      f.rows?.forEach((r, i) => {
        if (r.label !== undefined) checkText(`${label}.rows[${i}].label`, r.label, errors)
        if (r.total !== undefined) checkText(`${label}.rows[${i}].total`, r.total, errors)
        if (!r.segments?.length) errors.push(`${label}.rows[${i}].segments が空`)
        r.segments?.forEach((s, j) => {
          checkText(`${label}.rows[${i}].segments[${j}].text`, s.text, errors)
          if (!(typeof s.size === 'number' && s.size > 0)) errors.push(`${label}.rows[${i}].segments[${j}].size は正の数`)
          checkTone(`${label}.rows[${i}].segments[${j}]`, s.tone, errors)
        })
      })
      break
    case 'venn2':
      if (!Array.isArray(f.labels) || f.labels.length !== 2) errors.push(`${label}.labels は2つ`)
      else f.labels.forEach((s, i) => checkText(`${label}.labels[${i}]`, s, errors))
      checkText(`${label}.onlyA`, f.onlyA, errors)
      checkText(`${label}.both`, f.both, errors)
      checkText(`${label}.onlyB`, f.onlyB, errors)
      if (f.outside !== undefined) checkText(`${label}.outside`, f.outside, errors)
      if (f.total !== undefined) checkText(`${label}.total`, f.total, errors)
      break
    case 'line': {
      if (!Array.isArray(f.points) || f.points.length < 2) {
        errors.push(`${label}.points は2つ以上`)
        break
      }
      f.points.forEach((p, i) => {
        if (typeof p.at !== 'number' || !Number.isFinite(p.at)) errors.push(`${label}.points[${i}].at は数値`)
        checkText(`${label}.points[${i}].label`, p.label, errors)
        if (p.sub !== undefined) checkText(`${label}.points[${i}].sub`, p.sub, errors)
      })
      const ats = f.points.map((p) => p.at)
      const min = Math.min(...ats)
      const max = Math.max(...ats)
      if (min === max) errors.push(`${label}.points の位置がすべて同じ`)
      f.spans?.forEach((s, i) => {
        checkText(`${label}.spans[${i}].text`, s.text, errors)
        if (!(s.from >= min && s.to <= max && s.from < s.to)) errors.push(`${label}.spans[${i}] の範囲が不正`)
        checkTone(`${label}.spans[${i}]`, s.tone, errors)
      })
      break
    }
    case 'flow':
      if (!f.items?.length) errors.push(`${label}.items が空`)
      f.items?.forEach((it, i) => {
        if (typeof it === 'string') {
          if (it.trim() === '' || it.length > 3) errors.push(`${label}.items[${i}] の記号が不正: ${it}`)
          return
        }
        checkText(`${label}.items[${i}].title`, it.title, errors)
        it.lines?.forEach((s, j) => checkText(`${label}.items[${i}].lines[${j}]`, s, errors))
        checkTone(`${label}.items[${i}]`, it.tone, errors)
      })
      break
    case 'tree':
      checkTree(`${label}.nodes`, f.nodes, 1, errors)
      break
    case 'table':
      checkTable(label, f.table, errors)
      f.highlight?.forEach(([r, c], i) => {
        if (!f.table?.rows?.[r] || c < 0 || c >= f.table.headers.length) errors.push(`${label}.highlight[${i}] が表の外`)
      })
      break
    case 'slots':
      if (!f.rows?.length) errors.push(`${label}.rows が空`)
      f.rows?.forEach((r, i) => {
        if (r.label !== undefined) checkText(`${label}.rows[${i}].label`, r.label, errors)
        if (!r.cells?.length) errors.push(`${label}.rows[${i}].cells が空`)
        r.cells?.forEach((c, j) => {
          if (typeof c.text !== 'string') errors.push(`${label}.rows[${i}].cells[${j}].text が不正`)
          if (c.head !== undefined) checkText(`${label}.rows[${i}].cells[${j}].head`, c.head, errors)
          checkTone(`${label}.rows[${i}].cells[${j}]`, c.tone, errors)
        })
      })
      break
    default:
      errors.push(`${label}.type が不正: ${String((f as { type?: unknown }).type)}`)
  }
}

function checkExample(label: string, e: NoteExample, errors: string[]) {
  if (!e || typeof e !== 'object') {
    errors.push(`${label} がない`)
    return
  }
  checkText(`${label}.stem`, e.stem, errors)
  checkText(`${label}.answer`, e.answer, errors)
  if (e.table) checkTable(`${label}.table`, e.table, errors)
  if (e.figure) validateFigure(`${label}.figure`, e.figure, errors)
  if (!Array.isArray(e.steps) || e.steps.length < 2) errors.push(`${label}.steps は2つ以上`)
  e.steps?.forEach((s, i) => {
    if (typeof s !== 'object' || s === null) {
      errors.push(`${label}.steps[${i}] は { text, calc?, figure? } の形`)
      return
    }
    checkText(`${label}.steps[${i}].text`, s.text, errors)
    if (s.calc !== undefined) checkText(`${label}.steps[${i}].calc`, s.calc, errors)
    if (s.figure) validateFigure(`${label}.steps[${i}].figure`, s.figure, errors)
  })
}

export function validateNote(n: Note): string[] {
  const errors: string[] = []
  if (!isTopicId(n.topic)) errors.push(`topic が不正: ${n.topic}`)
  checkText('summary', n.summary, errors)
  if (!Array.isArray(n.keyPoints) || n.keyPoints.length < 1 || n.keyPoints.length > 4) errors.push('keyPoints は1〜4個')
  n.keyPoints?.forEach((s, i) => checkText(`keyPoints[${i}]`, s, errors))
  if (!Array.isArray(n.formulas)) errors.push('formulas がない')
  n.formulas?.forEach((f, i) => {
    checkText(`formulas[${i}].label`, f.label, errors)
    checkText(`formulas[${i}].body`, f.body, errors)
    checkText(`formulas[${i}].example`, f.example, errors)
  })
  if (!Array.isArray(n.patterns) || n.patterns.length < 2) errors.push('patterns は2つ以上')
  n.patterns?.forEach((p, i) => {
    checkText(`patterns[${i}].title`, p.title, errors)
    checkText(`patterns[${i}].lead`, p.lead, errors)
    if (p.point !== undefined) checkText(`patterns[${i}].point`, p.point, errors)
    checkExample(`patterns[${i}].example`, p.example, errors)
  })
  if (!Array.isArray(n.pitfalls) || n.pitfalls.length === 0) errors.push('pitfalls が空')
  n.pitfalls?.forEach((p, i) => {
    if (typeof p !== 'object' || p === null) {
      errors.push(`pitfalls[${i}] は { wrong, right } の形`)
      return
    }
    checkText(`pitfalls[${i}].wrong`, p.wrong, errors)
    checkText(`pitfalls[${i}].right`, p.right, errors)
  })
  return errors
}

function figureTexts(f: Figure | undefined): string[] {
  if (!f) return []
  const cap = f.caption ? [f.caption] : []
  switch (f.type) {
    case 'tape':
      return [...cap, ...f.rows.flatMap((r) => [r.label ?? '', r.total ?? '', ...r.segments.map((s) => s.text)])]
    case 'venn2':
      return [...cap, ...f.labels, f.onlyA, f.both, f.onlyB, f.outside ?? '', f.total ?? '']
    case 'line':
      return [...cap, ...f.points.flatMap((p) => [p.label, p.sub ?? '']), ...(f.spans ?? []).map((s) => s.text)]
    case 'flow':
      return [...cap, ...f.items.flatMap((it) => (typeof it === 'string' ? [] : [it.title, ...(it.lines ?? [])]))]
    case 'tree': {
      const walk = (ns: TreeNode[]): string[] => ns.flatMap((n) => [n.label, ...walk(n.children ?? [])])
      return [...cap, ...walk(f.nodes)]
    }
    case 'table':
      return [...cap, ...f.table.headers, ...f.table.rows.flat()]
    case 'slots':
      return [...cap, ...f.rows.flatMap((r) => [r.label ?? '', ...r.cells.flatMap((c) => [c.head ?? '', c.text])])]
  }
}

/** ノートの例題をすべて返す（推論の総当たり検証などに使う） */
export function noteExamples(n: Note): NoteExample[] {
  return n.patterns.map((p) => p.example)
}

/** ノートの中の文字をすべて返す（途中式の計算チェックなどに使う）。空文字は除く */
export function noteTexts(n: Note): string[] {
  const ex = (e: NoteExample) => [
    e.stem,
    e.answer,
    ...figureTexts(e.figure),
    ...e.steps.flatMap((s) => [s.text, s.calc ?? '', ...figureTexts(s.figure)]),
  ]
  return [
    n.summary,
    ...n.keyPoints,
    ...n.formulas.flatMap((f) => [f.label, f.body, f.example]),
    ...n.patterns.flatMap((p) => [p.title, p.lead, p.point ?? '', ...ex(p.example)]),
    ...n.pitfalls.flatMap((p) => [p.wrong, p.right]),
  ].filter((s) => s !== '')
}
