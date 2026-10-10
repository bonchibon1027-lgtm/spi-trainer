import { RichText } from '../RichText'
import { planTape, toneClass, type TapeFigureData } from './layout'

/**
 * テープ図: 行ごとに横帯。区切りの幅は size の比（行どうしも同じ尺度で、いちばん長い行が全幅）。
 * 帯に文字が収まらない狭い区切りは、帯の中に印（①②…）だけ置き、全文を帯の下の注記に出す。
 * total は帯の下に、波かっこ風の線（└──┘）で全体をくくって書く。
 */
export function TapeFigure({ rows }: { rows: TapeFigureData['rows'] }) {
  const plan = planTape(rows)
  return (
    <div className="fg-tp">
      {rows.map((r, ri) => {
        const notes = r.segments
          .map((s, si) => ({ s, p: plan.segs[ri][si] }))
          .filter((x) => !x.p.fits)
        return (
          <div className="fg-tp-row" key={ri}>
            {r.label && (
              <div className="fg-tp-label">
                <RichText text={r.label} />
              </div>
            )}
            <div className="fg-tp-main" style={{ width: `${plan.rowPct[ri]}%` }}>
              <div className="fg-tp-bar">
                {r.segments.map((s, si) => {
                  const p = plan.segs[ri][si]
                  return (
                    <div
                      key={si}
                      className={`fg-tp-seg ${toneClass(s.tone, 'base')}${p.fits ? '' : ' is-note'}`}
                      style={{ flexGrow: s.size }}
                    >
                      {p.fits ? <RichText text={s.text} /> : p.showMark ? p.mark : null}
                    </div>
                  )
                })}
              </div>
              {r.total && (
                <div className="fg-tp-total">
                  <span className="fg-tp-brace" aria-hidden="true" />
                  <span className="fg-tp-total-text">
                    <RichText text={r.total} />
                  </span>
                </div>
              )}
              {notes.length > 0 && (
                <ul className="fg-tp-notes">
                  {notes.map(({ s, p }, ni) => (
                    <li key={ni} className={`fg-tp-note ${toneClass(s.tone, 'base')}`}>
                      <span className="fg-tp-note-mark">{p.mark}</span>
                      <span>
                        <RichText text={s.text} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
