import { RichText } from '../RichText'
import { planLine, toneClass, type LineFigureData } from './layout'

/**
 * 数直線・道のり図。points は at の大小に比例して左右に並べる。
 * - 点の文字（label と sub）は線の下。近すぎて重なるときは、点から左右にずらすか、下の段に引き出し線つきで置く。
 * - spans は線の上に区間バー（かっこ）と文字。重なる区間は上の段に積む。
 */
export function LineFigure({ f }: { f: LineFigureData }) {
  const plan = planLine(f)
  const spans = f.spans ?? []
  const labelTop = plan.trackY + 12
  return (
    <div className="fg-ln" style={{ height: plan.height }}>
      {spans.map((s, i) => {
        const p = plan.spans[i]
        // 線に近い段(lane 0)ほど下。lanes 段のうち上から数えた位置
        const top = (plan.lanes - 1 - p.lane) * plan.laneH
        return (
          <div key={`s${i}`} className={`fg-ln-span ${toneClass(s.tone, 'base')}`} style={{ top, height: plan.laneH }}>
            <span className="fg-ln-span-text" style={{ left: `${p.textPct}%` }}>
              <RichText text={s.text} />
            </span>
            <span className="fg-ln-bracket" style={{ left: `${p.fromPct}%`, width: `${p.toPct - p.fromPct}%` }} />
          </div>
        )
      })}

      <div className="fg-ln-track" style={{ top: plan.trackY }} />

      {f.points.map((pt, i) => {
        const p = plan.points[i]
        return (
          <div key={`d${i}`}>
            {p.level > 0 && (
              <span
                className="fg-ln-leader"
                style={{ left: `${p.pct}%`, top: plan.trackY, height: 12 + p.level * plan.levelH - 2 }}
                aria-hidden="true"
              />
            )}
            <span className="fg-ln-dot" style={{ left: `${p.pct}%`, top: plan.trackY }} aria-hidden="true" />
            <span
              className={`fg-ln-pt is-${p.align}`}
              style={{ left: `${p.pct}%`, top: labelTop + p.level * plan.levelH }}
            >
              <span className="fg-ln-pt-label">
                <RichText text={pt.label} />
              </span>
              {pt.sub && (
                <span className="fg-ln-pt-sub">
                  <RichText text={pt.sub} />
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
