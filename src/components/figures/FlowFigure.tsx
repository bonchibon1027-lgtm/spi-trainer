import type { FlowBox } from '../../types'
import { RichText } from '../RichText'
import { toneClass } from './layout'

type Unit = { lead: string[]; box?: FlowBox; trail: string[] }

/** 箱と記号を並べる。記号は直前の箱にくっつけて、折り返しても記号だけが行頭に残らないようにする */
function toUnits(items: (FlowBox | string)[]): Unit[] {
  const units: Unit[] = []
  let lead: string[] = []
  for (const it of items) {
    if (typeof it === 'string') {
      const last = units[units.length - 1]
      if (last) last.trail.push(it)
      else lead.push(it)
    } else {
      units.push({ lead, box: it, trail: [] })
      lead = []
    }
  }
  if (lead.length > 0) units.push({ lead, trail: [] })
  return units
}

/** 箱と記号の流れ（食塩水を混ぜる・確率のかけ算など）。スマホ幅で入らなければ折り返す */
export function FlowFigure({ items }: { items: (FlowBox | string)[] }) {
  const units = toUnits(items)
  return (
    <div className="fg-fl">
      {units.map((u, i) => (
        <div className="fg-fl-unit" key={i}>
          {u.lead.map((s, j) => (
            <span className="fg-fl-op" key={`l${j}`}>
              {s}
            </span>
          ))}
          {u.box && (
            <div className={`fg-fl-box ${toneClass(u.box.tone, 'base')}`}>
              <div className="fg-fl-title">
                <RichText text={u.box.title} />
              </div>
              {(u.box.lines ?? []).map((l, j) => (
                <div className="fg-fl-line" key={j}>
                  <RichText text={l} />
                </div>
              ))}
            </div>
          )}
          {u.trail.map((s, j) => (
            <span className="fg-fl-op" key={`t${j}`}>
              {s}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
