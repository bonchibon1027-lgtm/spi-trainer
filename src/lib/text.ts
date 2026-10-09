// 問題文の書き方（改行 "\n"、分数 {{分子/分母}}）を読み取る。画面の RichText と、一覧の短い表示で使う。

export type RichToken =
  | { type: 'text'; text: string }
  | { type: 'frac'; num: string; den: string }
  | { type: 'br' }

const FRAC_SPLIT = /\{\{(-?\d+)\/(\d+)\}\}/g

export function parseRich(text: string): RichToken[] {
  const tokens: RichToken[] = []
  // 実際の改行と、文字として書かれた "\n"（JSON を二重にエスケープした場合）のどちらも改行として扱う
  const lines = String(text ?? '').split(/\r?\n|\\n/)
  lines.forEach((line, li) => {
    if (li > 0) tokens.push({ type: 'br' })
    let last = 0
    for (const m of line.matchAll(FRAC_SPLIT)) {
      const idx = m.index ?? 0
      if (idx > last) tokens.push({ type: 'text', text: line.slice(last, idx) })
      tokens.push({ type: 'frac', num: m[1], den: m[2] })
      last = idx + m[0].length
    }
    if (last < line.length) tokens.push({ type: 'text', text: line.slice(last) })
  })
  return tokens
}

/** 分数を "3/5" の形にし、改行を空白にした短い文字列（一覧の見出し用） */
export function plainText(text: string): string {
  return parseRich(text)
    .map((t) => (t.type === 'text' ? t.text : t.type === 'frac' ? `${t.num}/${t.den}` : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 長い文字列を切り詰める */
export function clip(text: string, max: number): string {
  const s = plainText(text)
  return s.length > max ? `${s.slice(0, max)}…` : s
}
