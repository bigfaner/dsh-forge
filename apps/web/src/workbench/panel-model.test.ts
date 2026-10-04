// panel-model 单测 —— 官方基座降位后的面板纯推导面（fix-25）。
// 相位机/项目锚/右栏联动计划自 WorkbenchPanel 测试族迁入（语义不变）；centerViewOf =
// 新面（官方面板态 → 产品视图镜像）。
import { describe, expect, it } from 'vitest'
import {
  HERO_PANEL_KEY,
  KNOWLEDGE_PANEL_KEY,
  centerViewOf,
  nextLastReadyCount,
  projectAnchorOf,
  rightbarViewPlan,
  sessionZonePhase,
} from './panel-model.js'

describe('sessionZonePhase 相位机（Hard Rule：hero 仅由项目数驱动——单一条件）', () => {
  it('正零 → hero；≥1 → 会话视图', () => {
    expect(sessionZonePhase({ lastReadyCount: 0 })).toBe('hero')
    expect(sessionZonePhase({ lastReadyCount: 1 })).toBe('session')
    expect(sessionZonePhase({ lastReadyCount: 5 })).toBe('session')
  })

  it('未就绪且在途 → 校平位（防会话面/hero 闪现跳变）；未就绪且失败 → fail-soft 会话视图（计数未知 ≠ 0，hero 需正零）', () => {
    expect(sessionZonePhase({ lastReadyCount: null })).toBe('settling')
    expect(sessionZonePhase({ lastReadyCount: null, failed: true })).toBe('session')
  })

  it('就绪后在途/失败保持上一已知相位（注册成功重拉期不闪跳、不残留）', () => {
    expect(sessionZonePhase({ lastReadyCount: 0, failed: true })).toBe('hero')
    expect(sessionZonePhase({ lastReadyCount: 2, failed: true })).toBe('session')
  })
})

describe('nextLastReadyCount 项目数相位计数（注册成功永久让位的机制面）', () => {
  it('ready 取计数（含 archived——P1 无删除计数不回落）；在途/失败保持上一已知（防闪跳/不残留）', () => {
    expect(nextLastReadyCount(null, { phase: 'ready', projects: [{ id: 'p-1' }] })).toBe(1)
    expect(nextLastReadyCount(0, { phase: 'loading' })).toBe(0)
    expect(nextLastReadyCount(2, { phase: 'error' })).toBe(2)
    expect(nextLastReadyCount(null, { phase: 'loading' })).toBeNull()
  })
})

describe('projectAnchorOf 当前项目锚推导（3.8：知识视图/召回面范围锚；fix-25 随迁）', () => {
  const projects = [
    { id: 'p-1', workspaceId: 'ws-1' },
    { id: 'p-2', workspaceId: 'ws-2' },
  ]
  const workspaces = {
    items: [
      { workspaceId: 'ws-1', sessionIds: ['s-1'] },
      { workspaceId: 'ws-2', sessionIds: ['s-2'] },
    ],
  }

  it('会话锚在场：归属 workspace 名下项目命中', () => {
    expect(projectAnchorOf({ sessionId: 's-2', workspaces, projects })).toBe('p-2')
  })

  it('会话未归属任何 workspace / 快照缺席：唯一项目兜底（单人无歧义相位）', () => {
    expect(projectAnchorOf({ sessionId: 's-x', workspaces, projects })).toBeNull()
    expect(projectAnchorOf({ sessionId: 's-1', workspaces: null, projects })).toBeNull()
    expect(projectAnchorOf({ sessionId: null, workspaces, projects: [{ id: 'only' }] })).toBe('only')
  })

  it('多项目无会话锚/未匹配 = null（不猜首个——浏览与召回面按无锚降级）', () => {
    expect(projectAnchorOf({ sessionId: null, workspaces, projects })).toBeNull()
  })

  it('会话归属 workspace 未注册为项目（裸 workspace 非产品对象）= 不命中该 workspace', () => {
    const bare = { items: [{ workspaceId: 'ws-9', sessionIds: ['s-9'] }] }
    expect(projectAnchorOf({ sessionId: 's-9', workspaces: bare, projects })).toBeNull()
  })
})

describe('rightbarViewPlan 知识模式右栏联动计划（fix-23 语义 / fix-25 改面板径）', () => {
  it('进知识面板：已展开 → 收起并记忆；未展开 → 不动', () => {
    expect(rightbarViewPlan(true, null, true)).toEqual({ action: 'hide', remembered: true })
    expect(rightbarViewPlan(true, null, false)).toEqual({ action: 'none', remembered: null })
  })

  it('离知识面板：有记忆且已收起 → 恢复并清记忆；有记忆但已展开（官方他径已展开）→ 仅清记忆', () => {
    expect(rightbarViewPlan(false, true, false)).toEqual({ action: 'restore', remembered: null })
    expect(rightbarViewPlan(false, true, true)).toEqual({ action: 'none', remembered: null })
  })

  it('离知识面板无记忆 → 不动（未占用过联动）', () => {
    expect(rightbarViewPlan(false, null, false)).toEqual({ action: 'none', remembered: null })
  })
})

describe('centerViewOf 官方面板态 → 产品视图镜像（fix-25 新面）', () => {
  it('null = 会话视图（官方 ConversationRoot 缺省）；产品面板 key 各自成视图；官方他面板按会话镜像', () => {
    expect(centerViewOf(null)).toBe('session')
    expect(centerViewOf(KNOWLEDGE_PANEL_KEY)).toBe('knowledge')
    expect(centerViewOf(HERO_PANEL_KEY)).toBe('hero')
    expect(centerViewOf('plugins')).toBe('session')
  })
})
