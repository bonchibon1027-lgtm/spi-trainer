// 日付まわり。学習記録の日付は「端末の現地日付」の "YYYY-MM-DD" で扱う。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date → 現地日付の "YYYY-MM-DD" */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayStr(now: Date = new Date()): string {
  return toDateStr(now)
}

/** "YYYY-MM-DD" として正しい日付か（2月30日などは不可） */
export function isDateStr(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = DATE_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

function parseDateStr(s: string): Date {
  const m = DATE_RE.exec(s)
  if (!m) throw new Error(`invalid date: ${s}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 日付に日数を足す（夏時間の影響を受けないよう、現地日付のまま計算する） */
export function addDays(dateStr: string, days: number): string {
  const d = parseDateStr(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

/** to - from の日数（to が後なら正） */
export function daysBetween(from: string, to: string): number {
  const a = parseDateStr(from)
  const b = parseDateStr(to)
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcB - utcA) / 86400000)
}

/** ISO 日時 → 現地日付。読み取れなければ null */
export function isoToDateStr(iso: string): string | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : toDateStr(d)
}

/** "10月12日（月）" のような表示 */
export function formatDateJa(dateStr: string): string {
  const d = parseDateStr(dateStr)
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日（${w}）`
}

/** 秒 → "1分15秒" / "45秒" */
export function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r}秒`
  if (r === 0) return `${m}分`
  return `${m}分${r}秒`
}

/** ミリ秒 → "1分15秒" */
export function formatMs(ms: number): string {
  return formatSec(ms / 1000)
}

/** ミリ秒 → "1:15" （ゲージ用の経過時間） */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
