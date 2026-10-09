import type { Note, Question } from '../types'
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

export function validateNote(n: Note): string[] {
  const errors: string[] = []
  if (!isTopicId(n.topic)) errors.push(`topic が不正: ${n.topic}`)
  checkText('summary', n.summary, errors)
  if (!n.patterns?.length) errors.push('patterns が空')
  if (!n.examples?.length) errors.push('examples が空')
  n.formulas?.forEach((f, i) => {
    checkText(`formulas[${i}].label`, f.label, errors)
    checkText(`formulas[${i}].body`, f.body, errors)
  })
  n.patterns?.forEach((p, i) => {
    checkText(`patterns[${i}].title`, p.title, errors)
    p.steps.forEach((s, j) => checkText(`patterns[${i}].steps[${j}]`, s, errors))
  })
  n.examples?.forEach((e, i) => {
    checkText(`examples[${i}].stem`, e.stem, errors)
    checkText(`examples[${i}].answer`, e.answer, errors)
    e.steps.forEach((s, j) => checkText(`examples[${i}].steps[${j}]`, s, errors))
  })
  n.pitfalls?.forEach((s, i) => checkText(`pitfalls[${i}]`, s, errors))
  return errors
}
