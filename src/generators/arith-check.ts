// テスト用の道具（アプリ本体からは使わない）。
// 解説やノートの「A = B = C」の形の式を取り出し、となり合う式の値が等しいかを調べる。
// 3桁区切りのカンマ、百分率（%）、分数 {{a/b}} に対応する。単位や文は読み飛ばす。
//
// 使うテスト: discount.test.ts / installment.test.ts / settlement.test.ts / notes-v1.test.ts

/** 数式として評価する。式として読めなければ null */
export function evaluate(expr: string): number | null {
  const js = expr
    .replace(/\{\{(\d+)\/(\d+)\}\}/g, '($1/$2)')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
  if (!/^[\d\s()+\-*/.]+$/.test(js) || !/\d/.test(js)) return null
  try {
    const v = new Function(`return (${js})`)()
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

const RUN = String.raw`(?:\{\{\d+\/\d+\}\}|[\d()+\-−×÷.]|\s)+`
const LEAD = new RegExp(String.raw`^\s*(${RUN})`)
const TRAIL = new RegExp(String.raw`(${RUN})\s*$`)

/** 文字列の先頭にある式（あとに単位や文が続いてもよい） */
function lead(seg: string): number | null {
  const m = LEAD.exec(seg)
  if (!m || m[1].trim() === '') return null
  return evaluate(m[1].trim())
}

/** 文字列の末尾にある式（前に文が続いてもよい）。直前が英字（"7P3" の 3 など）のときは式として扱わない */
function trail(seg: string): number | null {
  const m = TRAIL.exec(seg)
  if (!m) return null
  const expr = m[1].trim()
  if (expr === '' || /^[+×÷]/.test(expr) || /[+\-−×÷]$/.test(expr)) return null
  const prev = seg[m.index - 1]
  if (prev && /[A-Za-z]/.test(prev)) return null
  return evaluate(expr)
}

/** 式の区切りの前後の値が等しいかを調べる。% がつくときは 100 倍・100 分の 1 の読みかえを許す */
function sameValue(a: number, b: number, pct: boolean): boolean {
  if (Math.abs(a - b) < 1e-9) return true
  if (pct) return Math.abs(a * 100 - b) < 1e-9 || Math.abs(a - b * 100) < 1e-9
  return false
}

/**
 * 解説の1ステップ（複数行でもよい）の式を調べる。「A = B = C」の A と B、B と C がそれぞれ等しいか。
 * 戻り値は問題点の一覧（空なら OK）。調べた等号の数は stat.pairs に足す
 */
export function checkChain(raw: string, stat?: { pairs: number }): string[] {
  const errors: string[] = []
  const text = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(' = ')) continue
    const segs = line.split(' = ')
    // 百分率の記号 % は取り除いて数値だけで調べる（「0.5 × 100 = 50%」「30% = 0.3」はどちらも正しい式）
    const pct = segs.map((s) => /\d\s*%/.test(s))
    const plain = segs.map((s) => s.replace(/(\d)\s*%/g, '$1'))
    for (let i = 0; i + 1 < segs.length; i++) {
      const a = trail(plain[i])
      const b = lead(plain[i + 1])
      if (a === null || b === null) continue
      if (stat) stat.pairs++
      if (!sameValue(a, b, pct[i] || pct[i + 1])) {
        errors.push(`「${segs[i].trim()}」(=${a}) と「${segs[i + 1].trim()}」(=${b}) が等しくない`)
      }
    }
  }
  return errors
}

/**
 * ノートの計算式（calc）用のゆるい検査。単位や見出しを取りのぞいて、数字と記号だけで「A = B = C」を調べる。
 * 取りのぞいたあとに式として読めない部分は調べない。
 */
export function checkCalc(raw: string): string[] {
  const errors: string[] = []
  const line = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  if (!line.includes('=')) return errors
  for (const clause of line.split(/[。、]/)) {
    const segs = clause.split('=')
    if (segs.length < 2) continue
    const pct = segs.map((s) => /\d\s*%/.test(s))
    const vals = segs.map((s) => {
      const expr = s
        .replace(/\{\{(\d+)\/(\d+)\}\}/g, '($1/$2)')
        .replace(/[^\d\s()+\-−×÷./]/g, ' ') // 単位や文字は空白に
        .replace(/\s+/g, ' ')
        .trim()
      return expr === '' ? null : evaluate(expr)
    })
    for (let i = 0; i + 1 < segs.length; i++) {
      const a = vals[i]
      const b = vals[i + 1]
      if (a === null || b === null) continue
      const same = Math.abs(a - b) < 1e-9
      const scaled = (pct[i] || pct[i + 1]) && (Math.abs(a * 100 - b) < 1e-9 || Math.abs(a - b * 100) < 1e-9)
      if (!same && !scaled) errors.push(`「${segs[i].trim()}」(=${a}) と「${segs[i + 1].trim()}」(=${b}) が等しくない`)
    }
  }
  return errors
}

/** 問題文・ヒント・解説の体裁（共通） */
export function checkStyle(q: { stem: string; hint?: string; explanation: string[]; choices?: string[] }): string[] {
  const errors: string[] = []
  if (!/[。）]$/.test(q.stem)) errors.push(`問題文が「。」で終わらない: ${q.stem}`)
  if (!q.hint) errors.push('ヒントがない')
  else {
    if (!/(ます|です|ません|ましょう)。$/.test(q.hint)) errors.push(`ヒントが です・ます調 で終わらない: ${q.hint}`)
    const n = q.hint.split('。').filter((x) => x.trim() !== '').length
    if (n < 1 || n > 2) errors.push(`ヒントは1〜2文: ${q.hint}`)
  }
  if (!q.explanation[q.explanation.length - 1].startsWith('答え: ')) errors.push('解説の最後が「答え: 」でない')
  if (q.explanation.length < 3) errors.push('解説が3ステップ未満')
  if (!q.choices || q.choices.length < 5) errors.push('選択肢が5つ未満')
  return errors
}
