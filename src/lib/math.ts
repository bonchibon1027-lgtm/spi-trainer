// 問題生成で使う計算と表記の小道具

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}

/** 約分した [分子, 分母] */
export function reduce(n: number, d: number): [number, number] {
  const g = gcd(n, d)
  return [n / g, d / g]
}

/** 分数の表記 "{{n/d}}"。約分してから返す。分母が1なら整数で返す */
export function frac(n: number, d: number): string {
  const [rn, rd] = reduce(n, d)
  return rd === 1 ? String(rn) : `{{${rn}/${rd}}}`
}

/** 約分しない分数の表記（解説の途中式用） */
export function rawFrac(n: number, d: number): string {
  return `{{${n}/${d}}}`
}

/** 階乗 */
export function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/** 順列 nPr */
export function perm(n: number, r: number): number {
  let x = 1
  for (let i = 0; i < r; i++) x *= n - i
  return x
}

/** 組合せ nCr */
export function comb(n: number, r: number): number {
  if (r < 0 || r > n) return 0
  r = Math.min(r, n - r)
  let x = 1
  for (let i = 0; i < r; i++) x = (x * (n - i)) / (i + 1)
  return Math.round(x)
}

/** 3桁区切り（例: 12000 → "12,000"） */
export function yen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`
}

export function num(n: number): string {
  return n.toLocaleString('ja-JP')
}

/** 浮動小数の誤差を消して丸める（0.1 + 0.2 対策） */
export function round(n: number, digits = 6): number {
  const p = 10 ** digits
  return Math.round(n * p) / p
}

export function isInt(n: number): boolean {
  return Number.isInteger(round(n))
}
