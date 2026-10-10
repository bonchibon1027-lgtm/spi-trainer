import type { TreeNode } from '../../types'
import { RichText } from '../RichText'
import { toneClass } from './layout'

/** 末端(いちばん右の枝先)に、上から順に 1, 2, 3… と番号を振る */
export function numberLeaves(nodes: TreeNode[]): Map<TreeNode, number> {
  const nums = new Map<TreeNode, number>()
  let n = 0
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.children && node.children.length > 0) walk(node.children)
      else nums.set(node, ++n)
    }
  }
  walk(nodes)
  return nums
}

function Branch({ node, nums }: { node: TreeNode; nums: Map<TreeNode, number> }) {
  const kids = node.children ?? []
  const no = nums.get(node)
  return (
    <div className="fg-tn">
      <div className={`fg-tn-label ${toneClass(node.tone, 'plain')}`}>
        <RichText text={node.label} />
      </div>
      {no !== undefined && (
        <span className="fg-tn-no" aria-label={`${no}番目`}>
          {no}
        </span>
      )}
      {kids.length > 0 && <Kids nodes={kids} nums={nums} />}
    </div>
  )
}

function Kids({ nodes, nums }: { nodes: TreeNode[]; nums: Map<TreeNode, number> }) {
  return (
    <div className="fg-tn-kids">
      {nodes.map((k, i) => (
        <div className="fg-tn-kid" key={i}>
          <Branch node={k} nums={nums} />
        </div>
      ))}
    </div>
  )
}

/**
 * 樹形図（3段まで）。左から右へ枝が伸びる。枝の線は CSS で描く（文字の長さに合わせて自然に伸びる）。
 * 一番上の段が複数あるときは、左に出発点の丸を置いてつなぐ。末端には番号をつけ、数を下に書く。
 */
export function TreeFigure({ nodes }: { nodes: TreeNode[] }) {
  const nums = numberLeaves(nodes)
  const total = nums.size
  return (
    <div className="fg-tr">
      <div className="fg-tr-scroll">
        {nodes.length === 1 ? (
          <Branch node={nodes[0]} nums={nums} />
        ) : (
          <div className="fg-tn">
            <span className="fg-tn-start" aria-hidden="true" />
            <Kids nodes={nodes} nums={nums} />
          </div>
        )}
      </div>
      {total > 0 && <div className="fg-tr-count">枝先（いちばん右）の数: {total}個</div>}
    </div>
  )
}
