import type { Generator } from '../types'
import { defineGenerator, retry } from './common'
import { R, decStr, mixedChoices, posInt, withTarget } from './numeric-util'
import { num, yen } from '../lib/math'

// 料金の割引（回数券・曜日割引・団体割引・料金プランの比較）
//
// 書き方は profit.ts にそろえる:
// 1. 答えから逆算して、割引後の値段などが整数になる数字だけを使う（retry で引き直す）
// 2. よくある間違い方の値を mixedChoices に優先度順に渡す
// 3. 解説は1行に式を1本ずつ。最後のステップは「答え: <正解の選択肢と同じ文字列>」

/** 20 → "2割"、25 → "25%" */
const rateText = (d: number) => (d % 10 === 0 && d < 100 ? `${d / 10}割` : `${decStr(d)}%`)
/** 20 → "2割引き" */
const offText = (d: number) => `${rateText(d)}引き`
/** 割引後に払う割合。20 → "8割" */
const keepText = (d: number) => rateText(100 - d)
/** 割引後に払う割合の小数。20 → "0.8" */
const keepDec = (d: number) => decStr((100 - d) / 100)
/** d% 引きの値段が整数円になるか */
const wholeAfter = (p: number, d: number) => (p * (100 - d)) % 100 === 0
const after = (p: number, d: number) => (p * (100 - d)) / 100

// ---------------------------------------------------------------------------
// 1. 回数券・まとめ買い（難易度1）
//    s 回分の券を (s-1) 回分の料金で買える。n 回使うときの代金を求める
// ---------------------------------------------------------------------------

const COUPON_PLACES = [
  { place: 'ある銭湯', fee: '入浴料', prices: [400, 500, 600] },
  { place: 'あるプール', fee: '利用料金', prices: [500, 600, 800, 1000, 1200] },
  { place: 'あるバス会社', fee: '運賃', prices: [200, 250, 300, 400] },
  { place: 'あるスポーツジム', fee: '利用料金', prices: [800, 1000, 1200, 1500] },
]
const COUPON_ITEMS = [
  { item: 'パン', unit: '個', prices: [100, 120, 150, 200] },
  { item: 'ペットボトルのお茶', unit: '本', prices: [100, 120, 150] },
  { item: 'ノート', unit: '冊', prices: [150, 200, 250, 300] },
  { item: 'コロッケ', unit: '個', prices: [80, 100, 120, 150] },
]

const coupon = defineGenerator(
  { id: 'nv-discount/coupon', topic: 'nv-discount', difficulty: 1, label: '回数券・まとめ買いの割引' },
  (rng) => {
    const ticket = rng.chance(0.55) // true: 回数券、false: 「買うとおまけ」
    const saveAsk = rng.chance(0.3) // true: 安くなる額を聞く、false: 代金の合計を聞く
    const s = rng.pick([5, 6, 8, 10, 11, 12]) // 1つにまとめた数
    const b = rng.int(1, 3) // まとめを買う数
    const r = rng.int(1, s - 2) // あまり
    const n = s * b + r // 必要な数
    const pack = (s - 1) // まとめ1つの代金にあたる数

    let lead: string
    let p: number
    let U: string // 数える単位（回／個…）
    let W: string // まとめの名前
    let WU: string // まとめを数える単位
    if (ticket) {
      const c = rng.pick(COUPON_PLACES)
      p = rng.pick(c.prices)
      U = '回'
      W = '回数券'
      WU = '冊'
      lead = `${c.place}の${c.fee}は1回${yen(p)}である。回数券は、${s}回使える券が${pack}回分の料金で買える。`
    } else {
      const c = rng.pick(COUPON_ITEMS)
      p = rng.pick(c.prices)
      U = c.unit
      W = 'セット'
      WU = 'セット'
      lead = `ある店では、${c.item}を1${U}${yen(p)}で売っている。${pack}${U}買うと1${U}おまけがつき、${s}${U}を${pack}${U}分の代金で買える。`
    }

    const single = n * p // まとめを使わない場合
    const total = (n - b) * p // まとめを使った場合
    const save = b * p
    const sets = pack * p * b
    const rest = p * r

    const question = ticket
      ? `${n}回利用するとき、回数券を買えるだけ買い、残りは1回ずつ料金を払うことにすると、`
      : `おまけも含めてちょうど${n}${U}を手に入れるとき、${s}${U}のセットを買えるだけ買い、残りは1${U}ずつ買うことにすると、`
    const stem = saveAsk
      ? `${lead}${question}${ticket ? '回数券を使わない場合より' : 'おまけを使わず1つずつ買う場合より'}代金はいくら安くなるか。`
      : `${lead}${question}代金の合計はいくらか。`

    const ans = saveAsk ? save : total
    const wrongs = saveAsk
      ? [
          b * s * p, // まとめ1つ分をすべて安くなると考えた
          total, // 支払う代金を答えた
          single, // 使わない場合の代金を答えた
          r * p, // あまりの代金を答えた
          p, // 1回分だけ安くなると考えた
          (b + 1) * p,
          (b - 1) * p,
        ]
      : [
          single, // まとめを使わない場合の代金
          sets, // あまりの代金を足し忘れた
          (b + 1) * pack * p, // まとめを1つ余分に買った
          (n - 1) * p, // 安くなるのを1回分だけと考えた
          (n - b + 1) * p,
          (n - b - 1) * p,
        ]
    const { choices, answer } = mixedChoices(rng, ans, wrongs.map(R), {
      format: yen,
      padStep: p,
      isValid: (x) => posInt(x) && x > 0,
    })

    const explanation = [
      `${W}1つで${s}${U}分。${n}${U}のうち${W}にできる分は ${s} × ${b} = ${s * b}${U}（${b}${WU}）`,
      `残りは ${n} − ${s * b} = ${r}${U}`,
      `${W}1つの代金は${pack}${U}分なので、${num(p)} × ${pack} = ${num(pack * p)}円`,
      `${b}${WU}分の代金 = ${num(pack * p)} × ${b} = ${num(sets)}円`,
      `残り${r}${U}分の代金 = ${num(p)} × ${r} = ${num(rest)}円`,
      `代金の合計 = ${num(sets)} + ${num(rest)} = ${yen(total)}`,
    ]
    if (saveAsk) {
      explanation.push(
        `${W}を使わない場合 = ${num(p)} × ${n} = ${num(single)}円`,
        `安くなる額 = ${num(single)} − ${num(total)} = ${yen(save)}`,
      )
    }
    explanation.push(`答え: ${yen(ans)}`)

    return {
      stem,
      choices,
      answer,
      hint: saveAsk
        ? `${W}は1つにつき1${U}分だけ安くなります。何${WU}買えるかを先に数えましょう。`
        : `まず${W}を何${WU}買えるかを数え、残りの${U}数を1${U}ずつ払います。`,
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------
// 2. 曜日・時間帯の割引（難易度1）
//    大人と子どもの人数が決まっているときの、割引日の合計（または割引でいくら安いか）
// ---------------------------------------------------------------------------

const DAY_CTX = [
  {
    place: 'ある映画館',
    adultPrices: [1200, 1500, 1800, 2000],
    childPrices: [600, 800, 1000, 1200],
    rule: (off: string) => `毎週水曜日はサービスデーで、大人・子どもとも通常料金の${off}になる。`,
    when: '水曜日',
    act: '映画を見る',
    other: '水曜日以外',
  },
  {
    place: 'ある動物園',
    adultPrices: [800, 1000, 1200, 1500],
    childPrices: [300, 400, 500, 600],
    rule: (off: string) => `平日は、大人・子どもとも通常料金の${off}になる。`,
    when: '平日',
    act: '入園する',
    other: '土日',
  },
  {
    place: 'ある温泉施設',
    adultPrices: [1000, 1200, 1500, 2000],
    childPrices: [500, 600, 800, 1000],
    rule: (off: string) => `午後8時以降のナイトタイムは、大人・子どもとも通常料金の${off}になる。`,
    when: 'ナイトタイム',
    act: '利用する',
    other: 'ナイトタイム以外',
  },
] as const

const daytime = defineGenerator(
  { id: 'nv-discount/daytime', topic: 'nv-discount', difficulty: 1, label: '曜日・時間帯の割引（大人と子どもの料金）' },
  (rng) => {
    const c = rng.pick(DAY_CTX)
    const { A, C, d } = retry(
      rng,
      (r) => ({ A: r.pick(c.adultPrices), C: r.pick(c.childPrices), d: r.pick([10, 20, 25, 30, 40]) }),
      ({ A, C, d }) => wholeAfter(A, d) && wholeAfter(C, d) && A > C,
    )
    const a = rng.int(1, 4)
    const k = rng.int(1, 4)
    const saveAsk = rng.chance(0.35)
    const A1 = after(A, d)
    const C1 = after(C, d)
    const normal = A * a + C * k
    const disc = A1 * a + C1 * k
    const save = normal - disc

    const ans = saveAsk ? save : disc
    const wrongs = saveAsk
      ? [
          disc, // 割引後の合計を答えた
          normal, // 通常の合計を答えた
          (A - A1) * a, // 大人の割引額だけ
          (C - C1) * k, // 子どもの割引額だけ
          (A - A1) * (a + k), // 全員を大人として計算した
          (A - A1) + (C - C1), // 大人1人と子ども1人の割引額
        ]
      : [
          normal, // 割引を忘れた
          save, // 割引額を答えた
          A1 * a + C * k, // 大人だけ割引した
          A * a + C1 * k, // 子どもだけ割引した
          A1 * (a + k), // 全員を大人として計算した
        ]
    const { choices, answer } = mixedChoices(rng, ans, wrongs.map(R), {
      format: yen,
      padStep: saveAsk ? Math.max(100, Math.round(save * 0.1)) : 100,
      isValid: posInt,
    })

    const stem =
      `${c.place}の料金は、通常、大人${yen(A)}、子ども${yen(C)}である。${c.rule(offText(d))}` +
      `${c.when}に大人${a}人と子ども${k}人で${c.act}とき、` +
      (saveAsk ? `${c.other}に${c.act}場合より、合計でいくら安くなるか。` : '料金の合計はいくらか。')

    const explanation = [
      `${offText(d)}は、通常の${keepText(d)}（${keepDec(d)}倍）の料金を払うこと。`,
      `大人1人 = ${num(A)} × ${keepDec(d)} = ${num(A1)}円、子ども1人 = ${num(C)} × ${keepDec(d)} = ${num(C1)}円`,
      `大人${a}人分 = ${num(A1)} × ${a} = ${num(A1 * a)}円、子ども${k}人分 = ${num(C1)} × ${k} = ${num(C1 * k)}円`,
      `${c.when}の合計 = ${num(A1 * a)} + ${num(C1 * k)} = ${yen(disc)}`,
    ]
    if (saveAsk) {
      explanation.push(
        `${c.other}の合計（通常料金）= ${num(A)} × ${a} + ${num(C)} × ${k} = ${num(A * a)} + ${num(C * k)} = ${yen(normal)}`,
        `安くなる額 = ${num(normal)} − ${num(disc)} = ${yen(save)}`,
      )
    }
    explanation.push(`答え: ${yen(ans)}`)

    return {
      stem,
      choices,
      answer,
      hint: saveAsk
        ? '割引日の合計と、通常の日の合計を、それぞれ出してから差をとります。'
        : `割引は大人にも子どもにもかかります。1人あたりの料金を先に出してから、人数をかけます。`,
      explanation,
    }
  },
)

// ---------------------------------------------------------------------------
// 3. 団体割引（難易度2）
//    k 人を超えた分だけが割引になる。人数から合計、または合計から人数を求める
// ---------------------------------------------------------------------------

const GROUP_CTX = [
  { place: 'ある遊園地', fee: '入園料', verb: '入園' },
  { place: 'ある水族館', fee: '入館料', verb: '入館' },
  { place: 'ある博物館', fee: '入館料', verb: '入館' },
  { place: 'ある体験教室', fee: '参加費', verb: '参加' },
  { place: 'ある美術館', fee: '観覧料', verb: '入館' },
] as const

const GROUP_PRICES = [500, 600, 800, 1000, 1200, 1500, 2000]
const GROUP_LIMITS = [10, 15, 20, 25, 30, 40]
const GROUP_RATES = [10, 20, 25, 30, 40, 50]

const group = defineGenerator(
  { id: 'nv-discount/group', topic: 'nv-discount', difficulty: 2, label: '団体割引（超えた人数分だけ割引）' },
  (rng) => {
    const c = rng.pick(GROUP_CTX)
    const reverse = rng.chance(0.35)
    const { p, k, d, m } = retry(
      rng,
      (r) => ({ p: r.pick(GROUP_PRICES), k: r.pick(GROUP_LIMITS), d: r.pick(GROUP_RATES), m: r.int(3, 20) }),
      ({ p, d, k, m }) => wholeAfter(p, d) && p * (k + m) <= 80000,
    )
    const q = after(p, d)
    const n = k + m
    const base = p * k
    const over = q * m
    const total = base + over
    const rule = `${c.place}の${c.fee}は1人${yen(p)}であるが、団体の人数が${k}人を超えると、超えた人数分の${c.fee}は${offText(d)}になる。`

    if (!reverse) {
      const { choices, answer } = mixedChoices(
        rng,
        total,
        [
          q * n, // 全員に割引を適用した
          p * n, // 割引を忘れた
          p * (k - 1) + q * (m + 1), // 超えた人数を1人多く数えた
          q * k + p * m, // 割引になる人と、ならない人を逆にした
          base + p * m - over, // 割引額をそのまま足した
        ].map(R),
        { format: yen, padStep: 500, isValid: posInt },
      )
      return {
        stem: `${rule}${n}人の団体が${c.verb}するとき、${c.fee}の合計はいくらか。`,
        choices,
        answer,
        hint: `割引になるのは${k}人を超えた分だけです。${k}人までの分と、超えた分を分けて計算しましょう。`,
        explanation: [
          `${k}人までは通常の料金。${num(p)} × ${k} = ${num(base)}円`,
          `超えた人数 = ${n} − ${k} = ${m}人`,
          `超えた人の1人分 = ${num(p)} × ${keepDec(d)} = ${num(q)}円（${offText(d)}）`,
          `超えた分の合計 = ${num(q)} × ${m} = ${num(over)}円`,
          `${c.fee}の合計 = ${num(base)} + ${num(over)} = ${yen(total)}`,
          `答え: ${yen(total)}`,
        ],
      }
    }

    const { choices, answer } = mixedChoices(
      rng,
      n,
      [
        m, // 超えた人数だけを答えた
        Math.round(total / p), // 割引を考えずに人数を求めた
        Math.round(total / q), // 全員が割引だと考えた
        n + 1,
        n - 1,
        k + Math.round((total - base) / p), // 超えた人も通常料金だと考えた
      ].map(R),
      { format: (x) => `${num(x)}人`, padStep: 1, isValid: (x) => posInt(x) && x > 0 },
    )
    return {
      stem: `${rule}ある団体の${c.fee}の合計は${yen(total)}であった。この団体は何人か。`,
      choices,
      answer,
      hint: `まず${k}人分の料金を引いて、超えた分の料金を出します。それを割引後の1人分で割ります。`,
      explanation: [
        `${k}人までの料金 = ${num(p)} × ${k} = ${num(base)}円`,
        `合計が${k}人分より多いので、${k}人を超えている。超えた分の料金 = ${num(total)} − ${num(base)} = ${num(over)}円`,
        `超えた人の1人分 = ${num(p)} × ${keepDec(d)} = ${num(q)}円（${offText(d)}）`,
        `超えた人数 = ${num(over)} ÷ ${num(q)} = ${m}人`,
        `全体の人数 = ${k} + ${m} = ${n}人`,
        `答え: ${n}人`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 4. 2組に分かれて入る場合とまとめて入る場合の差額（難易度2）
// ---------------------------------------------------------------------------

const split = defineGenerator(
  { id: 'nv-discount/split', topic: 'nv-discount', difficulty: 2, label: '2組に分かれる場合とまとめる場合の差額' },
  (rng) => {
    const c = rng.pick(GROUP_CTX)
    const bigGroup = rng.chance(0.3) // 片方の組が、それだけで限度を超える
    const { p, k, d, a, b } = retry(
      rng,
      (r) => {
        const k = r.pick([10, 15, 20, 25, 30])
        const a = bigGroup ? k + r.int(2, 8) : r.int(Math.ceil(k * 0.5), k)
        const b = r.int(Math.ceil(k * 0.4), k)
        return { p: r.pick(GROUP_PRICES), k, d: r.pick(GROUP_RATES), a, b }
      },
      ({ p, d, k, a, b }) => wholeAfter(p, d) && a + b > k && (bigGroup ? a > k : a <= k) && b <= k && a + b <= k + 20,
    )
    const q = after(p, d)
    const n = a + b
    const fee = (x: number) => p * Math.min(x, k) + q * Math.max(0, x - k)
    const together = fee(n)
    const apart = fee(a) + fee(b)
    const diff = apart - together

    const { choices, answer } = mixedChoices(
      rng,
      diff,
      [
        n * (p - q), // 全員が割引になると考えた
        k * (p - q), // 限度の人数を割引と考えた
        bigGroup ? (n - k) * (p - q) : (a - k) * (p - q), // もう一方の場合の式をそのまま使った
        (n - k) * p, // 割引額ではなく超えた分の料金を答えた
        a * (p - q),
        b * (p - q),
        together, // まとめた場合の合計を答えた
      ].map(R),
      { format: yen, padStep: 200, isValid: posInt },
    )

    const aLine = a <= k
      ? `${a}人の組 = ${num(p)} × ${a} = ${num(p * a)}円（${k}人以下なので割引なし）`
      : `${a}人の組は${k}人を超える。${num(p)} × ${k} + ${num(q)} × ${a - k} = ${num(p * k)} + ${num(q * (a - k))} = ${num(fee(a))}円`
    return {
      stem: `${c.place}の${c.fee}は1人${yen(p)}であるが、${k}人を超えた分は${offText(d)}になる。${n}人のグループが、${a}人と${b}人の2組に分かれて別々に${c.verb}する場合と、${n}人全員でまとめて${c.verb}する場合とでは、${c.fee}の合計はいくら違うか。ただし、人数の数え方は組ごとにおこなう。`,
      choices,
      answer,
      hint: `どちらの場合も合計を出してから、差をとります。割引になるのは、1組が${k}人を超えたときの、超えた分だけです。`,
      explanation: [
        `まとめて${c.verb}する場合。${k}人までは ${num(p)} × ${k} = ${num(p * k)}円`,
        `超えた人数は ${n} − ${k} = ${n - k}人。1人分は ${num(p)} × ${keepDec(d)} = ${num(q)}円なので、${num(q)} × ${n - k} = ${num(q * (n - k))}円`,
        `まとめた場合の合計 = ${num(p * k)} + ${num(q * (n - k))} = ${num(together)}円`,
        `分かれて${c.verb}する場合。${aLine}`,
        `${b}人の組 = ${num(p)} × ${b} = ${num(p * b)}円（${k}人以下なので割引なし）`,
        `分かれた場合の合計 = ${num(fee(a))} + ${num(p * b)} = ${num(apart)}円`,
        `差 = ${num(apart)} − ${num(together)} = ${yen(diff)}`,
        `答え: ${yen(diff)}`,
      ],
    }
  },
)

// ---------------------------------------------------------------------------
// 5. 料金プランの比較（難易度3）
//    会員（月会費 + 安い単価）が、通常利用より安くなる最小の回数
// ---------------------------------------------------------------------------

const PLAN_CTX = [
  { place: 'ある温水プール', normal: '一般利用', member: '会員利用' },
  { place: 'あるスポーツジム', normal: 'ビジター利用', member: '会員利用' },
  { place: 'あるコワーキングスペース', normal: '都度利用', member: '会員利用' },
  { place: 'あるカラオケ店', normal: '通常料金', member: '会員料金' },
] as const

const plan = defineGenerator(
  { id: 'nv-discount/plan', topic: 'nv-discount', difficulty: 3, label: '料金プランの比較（何回以上で得になるか）' },
  (rng) => {
    const c = rng.pick(PLAN_CTX)
    const { p, q, F, n0, diff } = retry(
      rng,
      (r) => {
        const diff = r.pick([200, 400, 500])
        const p = r.pick([600, 800, 1000, 1200, 1500, 2000])
        const n0 = r.int(4, 12)
        const cut = r.pick([0, 0, 100, 200, 300, 400]) // 0 のときは、ちょうど同額になる回数がある
        return { p, q: p - diff, diff, n0, F: diff * n0 - cut }
      },
      ({ p, q, F, diff }) => q >= 200 && F >= 1000 && F <= 6000 && F % 100 === 0 && p - q === diff,
    )
    const t = F / diff // 月会費を取り戻すのに必要な回数
    const tie = Number.isInteger(t)
    const ans = Math.floor(t) + 1
    const cost = (x: number) => ({ normal: p * x, member: F + q * x })

    const { choices, answer } = mixedChoices(
      rng,
      ans,
      [
        Math.floor(t), // ちょうど同額になる回数（切り上げ・ +1 の処理を忘れた）
        ans + 1,
        Math.round(F / p),
        Math.round(F / q),
        Math.floor(t) - 1,
        n0 + 2,
      ].map(R),
      { format: (x) => `${num(x)}回`, padStep: 1, isValid: (x) => posInt(x) && x >= 2 },
    )

    const last = cost(ans)
    const prev = cost(ans - 1)
    return {
      stem: `${c.place}の料金は、${c.normal}が1回${yen(p)}、${c.member}が月会費${yen(F)}に加えて1回${yen(q)}である。1か月に何回以上利用すれば、${c.member}の方が${c.normal}より合計の料金が安くなるか。`,
      choices,
      answer,
      hint: `${c.member}は1回あたり何円安くなるかを考え、月会費を取り戻せる回数を求めます。同額になる回数は「安くなる」に含まれません。`,
      explanation: [
        `${c.member}は1回あたり ${num(p)} − ${num(q)} = ${num(diff)}円 安くなる。ただし月会費${num(F)}円が余分にかかる。`,
        `月会費を取り戻すのに必要な回数 = ${num(F)} ÷ ${num(diff)} = ${decStr(t)}回`,
        tie
          ? `ちょうど${t}回のときは料金が同じで、安くはならない。安くなるのは、その次の ${t} + 1 = ${ans}回以上。`
          : `${decStr(t)}回分では月会費を取り戻しきれないので、${decStr(t)}より大きい整数のうち最小の${ans}回以上。`,
        `確かめ: ${ans}回のとき、${c.normal} = ${num(p)} × ${ans} = ${num(last.normal)}円、${c.member} = ${num(F)} + ${num(q)} × ${ans} = ${num(F)} + ${num(q * ans)} = ${num(last.member)}円で、${c.member}の方が安い。`,
        `${ans - 1}回のとき、${c.normal}は${num(prev.normal)}円、${c.member}は${num(prev.member)}円で、${c.member}の方は安くならない。`,
        `答え: ${num(ans)}回`,
      ],
    }
  },
)

const generators: Generator[] = [
  withTarget(coupon, 60),
  withTarget(daytime, 60),
  withTarget(group, 80),
  withTarget(split, 100),
  withTarget(plan, 100),
]
export default generators
