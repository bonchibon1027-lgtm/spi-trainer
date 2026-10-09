import { Fragment } from 'react'
import { parseRich } from '../lib/text'

/**
 * 問題文・選択肢・解説・ノート・表のセルに共通で使う文字列の表示。
 * - {{分子/分母}} は縦に積んだ分数
 * - 改行（\n）は <br>
 * span / br だけを返すので、ボタンや段落の中にも置ける。
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRich(text).map((t, i) => {
        if (t.type === 'br') return <br key={i} />
        if (t.type === 'frac') {
          return (
            <span key={i} className="frac" role="math" aria-label={`${t.den}分の${t.num}`}>
              <span className="frac-num">{t.num}</span>
              <span className="frac-den">{t.den}</span>
            </span>
          )
        }
        return <Fragment key={i}>{t.text}</Fragment>
      })}
    </>
  )
}
