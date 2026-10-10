import { RichText } from '../RichText'
import { textEm } from './layout'
import type { Figure } from '../../types'

type VennData = Extract<Figure, { type: 'venn2' }>

// 描画の座標（SVG の viewBox と同じ単位）。文字は同じ位置に HTML で重ねる（分数・改行を使うため）。
const W = 340
const H = 262
const R = 95
const CY = 132
const CXA = 111
const CXB = 229

const pctX = (x: number) => `${(x / W) * 100}%`
const pctY = (y: number) => `${(y / H) * 100}%`

/** 文字にすでに説明が入っているときは、補う小さな説明を付けない */
function needsTag(text: string, words: RegExp): boolean {
  return !words.test(text)
}

function Region({ x, y, text, tag, cls }: { x: number; y: number; text: string; tag?: string; cls: string }) {
  return (
    <div className={`fg-vn-reg ${cls}`} style={{ left: pctX(x), top: pctY(y) }}>
      {tag && <span className="fg-vn-tag">{tag}</span>}
      <span className="fg-vn-val">
        <RichText text={text} />
      </span>
    </div>
  )
}

/** 2つの集合のベン図: 重なる2つの円（SVG）と、各部分の文字（onlyA / both / onlyB / outside）、全体の枠と total */
export function Venn2Figure({ f }: { f: VennData }) {
  const [la, lb] = f.labels
  const tagA = textEm(la) <= 5 && needsTag(f.onlyA, /だけ|のみ|両方|どちら/) ? `${la}だけ` : undefined
  const tagB = textEm(lb) <= 5 && needsTag(f.onlyB, /だけ|のみ|両方|どちら/) ? `${lb}だけ` : undefined
  const tagBoth = needsTag(f.both, /両方|かつ|どちらも|共通/) ? '両方' : undefined
  const tagOut = f.outside !== undefined && needsTag(f.outside, /どちら|いずれも|外/) ? 'どちらでもない' : undefined
  const total = f.total !== undefined ? (needsTag(f.total, /全体|合計|全員|計/) ? `全体 ${f.total}` : f.total) : undefined
  return (
    <div className="fg-vn">
      {total !== undefined && (
        <div className="fg-vn-total">
          <RichText text={total} />
        </div>
      )}
      <div className="fg-vn-stage">
        <svg className="fg-vn-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <rect className="fg-vn-frame" x="1.5" y="1.5" width={W - 3} height={H - 3} rx="14" />
          <circle className="fg-vn-c is-a" cx={CXA} cy={CY} r={R} />
          <circle className="fg-vn-c is-b" cx={CXB} cy={CY} r={R} />
        </svg>
        <div className="fg-vn-lab is-a" style={{ left: pctX(80), top: pctY(19) }}>
          <RichText text={la} />
        </div>
        <div className="fg-vn-lab is-b" style={{ left: pctX(260), top: pctY(19) }}>
          <RichText text={lb} />
        </div>
        <Region x={(CXA - R + (CXB - R)) / 2} y={CY} text={f.onlyA} tag={tagA} cls="is-a" />
        <Region x={(CXA + CXB) / 2} y={CY} text={f.both} tag={tagBoth} cls="is-both" />
        <Region x={(CXA + R + (CXB + R)) / 2} y={CY} text={f.onlyB} tag={tagB} cls="is-b" />
        {f.outside !== undefined && (
          <div className="fg-vn-out">
            {tagOut && <span className="fg-vn-tag">{tagOut}</span>}
            <span className="fg-vn-val">
              <RichText text={f.outside} />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
