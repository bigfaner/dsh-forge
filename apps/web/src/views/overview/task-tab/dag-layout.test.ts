// DAG 布局纯函数单测 —— AC2「布局纯函数（分层独立可测）」+ 实现注记「DFS 回边检测 +
// 最长路径分层——原型 flowSvg 已验证语义」。面：回边检测（灰→灰）/分层（链·菱形·回边
// 不炸·缺端点边跳过）/几何（行主序坐标 + 画布尺寸）/边路径（贝塞尔 + 完成边 done 标）。
import { describe, expect, it } from 'vitest'
import type { TaskCard, TaskStatus, TaskGraphEdge } from '@dsh-forge/contracts'
import {
  DAG_GAP_X,
  DAG_GAP_Y,
  DAG_NODE_H,
  DAG_NODE_W,
  DAG_PAD,
  detectBackEdges,
  layerTaskIds,
  layoutDag,
} from './dag-layout.js'

/** 卡片夹具（最小形状 + 覆盖位） */
export function dagCard(id: string, over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: id,
    slug: 'm2-pipeline',
    localId: id,
    title: `任务 ${id}`,
    taskType: 'coding-feature',
    taskStatus: 'pending' as TaskStatus,
    prerequisites: [],
    sessionCount: 0,
    ...over,
  }
}

/** 边夹具（prerequisite → dependent 前置语义） */
function edge(prerequisiteId: string, taskId: string): TaskGraphEdge {
  return { taskId, prerequisiteId, origin: 'manual' }
}

describe('detectBackEdges（DFS 灰→灰回边检测）', () => {
  it('无环图 = 空集', () => {
    const back = detectBackEdges(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'c')])
    expect(back.size).toBe(0)
  })

  it('两节点环 = 后指前的那条边入集（前指后为树边）', () => {
    const back = detectBackEdges(['a', 'b'], [edge('a', 'b'), edge('b', 'a')])
    expect([...back]).toEqual(['b->a'])
  })

  it('自环 = 回边', () => {
    const back = detectBackEdges(['a'], [edge('a', 'a')])
    expect([...back]).toEqual(['a->a'])
  })

  it('端点不在节点集的边不参与（防御——缺端点边跳过）', () => {
    const back = detectBackEdges(['a'], [edge('a', 'ghost'), edge('ghost', 'a')])
    expect(back.size).toBe(0)
  })
})

describe('layerTaskIds（最长路径分层）', () => {
  it('线性链 a→b→c = 层 0/1/2（前置在上）', () => {
    const layers = layerTaskIds([dagCard('a'), dagCard('b'), dagCard('c')], [edge('a', 'b'), edge('b', 'c')])
    expect(layers).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('菱形 a→b,a→c,b→d,c→d = d 取最长路径层 2', () => {
    const layers = layerTaskIds(
      [dagCard('a'), dagCard('b'), dagCard('c'), dagCard('d')],
      [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
    )
    expect(layers).toEqual({ a: 0, b: 1, c: 1, d: 2 })
  })

  it('环图不炸：回边剔出分层（a→b→a = a 层 0 / b 层 1）', () => {
    const layers = layerTaskIds([dagCard('a'), dagCard('b')], [edge('a', 'b'), edge('b', 'a')])
    expect(layers).toEqual({ a: 0, b: 1 })
  })

  it('孤立节点 = 层 0；缺端点边跳过', () => {
    const layers = layerTaskIds([dagCard('solo')], [edge('ghost', 'solo')])
    expect(layers).toEqual({ solo: 0 })
  })
})

describe('layoutDag（几何 + 边路径）', () => {
  it('行主序坐标：同层按输入序横向排布 + 画布尺寸公式', () => {
    const tasks = [dagCard('b'), dagCard('a'), dagCard('c')] // 同层三节点
    const layout = layoutDag(tasks, [])
    expect(layout.nodes.map((n) => n.taskId)).toEqual(['b', 'a', 'c'])
    for (const [index, node] of layout.nodes.entries()) {
      expect(node.layer).toBe(0)
      expect(node.x).toBe(DAG_PAD + index * (DAG_NODE_W + DAG_GAP_X))
      expect(node.y).toBe(DAG_PAD)
    }
    expect(layout.width).toBe(DAG_PAD * 2 + 3 * (DAG_NODE_W + DAG_GAP_X) - DAG_GAP_X)
    expect(layout.height).toBe(DAG_PAD * 2 + DAG_NODE_H)
  })

  it('两层纵向间距 = H + GY', () => {
    const layout = layoutDag([dagCard('a'), dagCard('b')], [edge('a', 'b')])
    const a = layout.nodes.find((n) => n.taskId === 'a')
    const b = layout.nodes.find((n) => n.taskId === 'b')
    expect(b?.y).toBe((a?.y ?? Number.NaN) + DAG_NODE_H + DAG_GAP_Y)
  })

  it('边路径：前置底中 → 后续顶中贝塞尔；前置 completed = done 绿边标', () => {
    const tasks = [dagCard('a', { taskStatus: 'completed' }), dagCard('b')]
    const layout = layoutDag(tasks, [edge('a', 'b')])
    expect(layout.edges).toHaveLength(1)
    const [first] = layout.edges
    if (first === undefined) throw new Error('边缺席——布局断言不可达分支')
    expect(first.prerequisiteId).toBe('a')
    expect(first.taskId).toBe('b')
    expect(first.done).toBe(true)
    expect(first.d).toContain(`M${DAG_PAD + DAG_NODE_W / 2} ${DAG_PAD + DAG_NODE_H}`)
    expect(first.d).toContain(`C${DAG_PAD + DAG_NODE_W / 2}`)
    expect(first.d.endsWith(`${DAG_PAD + DAG_NODE_W / 2} ${DAG_PAD + DAG_NODE_H + DAG_GAP_Y}`)).toBe(true)
  })

  it('前置非 completed = done false（普通边框色）', () => {
    const layout = layoutDag([dagCard('a', { taskStatus: 'in_progress' }), dagCard('b')], [edge('a', 'b')])
    expect(layout.edges[0]?.done).toBe(false)
  })

  it('缺端点边不入路径集（过滤后图——被滤任务的前置边自动消失）', () => {
    const layout = layoutDag([dagCard('b')], [edge('a', 'b'), edge('b', 'c')])
    expect(layout.edges).toHaveLength(0)
  })

  it('空任务集 = 零尺寸空布局（防御——空态由上层门控）', () => {
    const layout = layoutDag([], [])
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
    expect(layout.width).toBe(DAG_PAD * 2)
    expect(layout.height).toBe(DAG_PAD * 2)
  })
})

describe('S5 边几何：终点切线随源→目标向量（箭头契合线走向）', () => {
  /** 解析 path d 的末段：返回终点与末控制点（切线向量 = 终点 − 末控制点） */
  function endTangent(d: string): { end: number[]; ctrl: number[] } {
    const pts = d
      .slice(d.indexOf('C') + 1)
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).map(Number))
    const end = pts[2]!
    const ctrl = pts[1]!
    return { end, ctrl }
  }

  it('非垂直边（dx≠0）：终点切线 ∥ 源→目标向量（对角进入目标节点）', () => {
    const tasks = [dagCard('a'), dagCard('b'), dagCard('diag')]
    const layout = layoutDag(tasks, [edge('a', 'b'), edge('a', 'diag')])
    const e = layout.edges.find((e) => e.taskId === 'diag')
    if (e === undefined) throw new Error('斜向边缺席——断言不可达')
    const from = layout.nodes.find((n) => n.taskId === 'a')!
    const to = layout.nodes.find((n) => n.taskId === 'diag')!
    const x1 = from.x + DAG_NODE_W / 2
    const y1 = from.y + DAG_NODE_H
    const x2 = to.x + DAG_NODE_W / 2
    const y2 = to.y
    expect(x2 - x1).not.toBe(0) // 夹具确为斜向
    const { end, ctrl } = endTangent(e.d)
    expect(end).toEqual([x2, y2])
    const arm = Math.max(12, (y2 - y1) / 2)
    expect(ctrl).toEqual([x2 - ((x2 - x1) * arm) / (y2 - y1), y2 - arm])
    // 切线 (end−ctrl) 与 (x2−x1, y2−y1) 叉积 = 0（共线）
    const tx = end[0]! - ctrl[0]!
    const ty = end[1]! - ctrl[1]!
    expect(tx * (y2 - y1) - ty * (x2 - x1)).toBeCloseTo(0, 6)
  })

  it('垂直边（dx=0）回归锚：路径与旧形态等价（两控制点均与端点同 x）', () => {
    const layout = layoutDag([dagCard('a'), dagCard('b')], [edge('a', 'b')])
    const [e] = layout.edges
    if (e === undefined) throw new Error('垂直边缺席——断言不可达')
    const x = DAG_PAD + DAG_NODE_W / 2
    const y1 = DAG_PAD + DAG_NODE_H
    const y2 = DAG_PAD + DAG_NODE_H + DAG_GAP_Y
    const arm = Math.max(12, (y2 - y1) / 2)
    expect(e.d).toBe(`M${x} ${y1} C${x} ${y1 + arm}, ${x} ${y2 - arm}, ${x} ${y2}`)
  })
})

describe('D29 原型节点刻度 pin（M3.1——纠正版原型 renderTaskDag W190/H72）', () => {
  it('节点刻度字面 = 190×72（D29——历史 170×64 与原型不符已退役）', () => {
    expect(DAG_NODE_W).toBe(190)
    expect(DAG_NODE_H).toBe(72)
  })

  it('画布尺寸公式随刻度联动（字面值 pin）：单层三节点宽 614 / 单层高 88 / 两层高 200', () => {
    const single = layoutDag([dagCard('a'), dagCard('b'), dagCard('c')], [])
    expect(single.width).toBe(614) // 8*2 + 3*(190+14) − 14
    expect(single.height).toBe(88) // 8*2 + 72
    const two = layoutDag([dagCard('a'), dagCard('b')], [edge('a', 'b')])
    expect(two.height).toBe(200) // 8*2 + 2*(72+40) − 40
  })
})
