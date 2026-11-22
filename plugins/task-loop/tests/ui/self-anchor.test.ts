// 概览锚自解析缝门测（fix-10 bug 400b3952 第二层——桥缺席宿主的身份水化门）：
// 官方 sessions 账本快照活跃判读 + workspaces 归属行 path 窄读 + resolve 编排。
import { describe, expect, it } from 'vitest'
import {
  activeSessionIdOf,
  anchorWorkspacePathOf,
  installSelfAnchorFiber,
  resolveSelfAnchor,
  selfAnchorSourceOf,
  type SelfAnchorServices,
} from '../../ui/self-anchor.js'

function storeOf(snapshot: unknown, listeners: (() => void)[] = []): unknown {
  return {
    getSnapshot: () => snapshot,
    subscribe: (l: () => void) => {
      listeners.push(l)
      return () => {
        const i = listeners.indexOf(l)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
  }
}

function servicesOf(sessions: unknown, workspaces: unknown, resolved: string[] = ['proj-1']): SelfAnchorServices & { resolvedPaths: string[] } {
  const resolvedPaths: string[] = []
  return {
    resolvedPaths,
    sessionsList: () => sessions,
    workspacesList: () => workspaces,
    resolveProjectId: async (path) => {
      resolvedPaths.push(path)
      return resolved[resolvedPaths.length - 1]
    },
  }
}

const SESSIONS = {
  byId: {
    's-1': { id: 's-1', retainedBy: { mainView: 1 } },
    's-2': { id: 's-2', retainedBy: { mainView: 0 } },
  },
}

const WORKSPACES = {
  items: [
    { workspaceId: 'ws-1', path: 'Z:\\repo-a', sessionIds: ['s-2'] },
    { workspaceId: 'ws-2', path: 'Z:\\repo-b', sessionIds: ['s-1'] },
  ],
}

describe('概览锚自解析（fix-10）', () => {
  it('activeSessionIdOf：retainedBy.mainView > 0 行判读；无在留行 = undefined', () => {
    expect(activeSessionIdOf(SESSIONS)).toBe('s-1')
    expect(activeSessionIdOf({ byId: { 's-2': { id: 's-2', retainedBy: { mainView: 0 } } } })).toBeUndefined()
    expect(activeSessionIdOf(null)).toBeUndefined()
    expect(activeSessionIdOf(undefined)).toBeUndefined()
  })

  it('anchorWorkspacePathOf：归属行 sessionIds 含活跃会话 → path；漂移 = undefined', () => {
    expect(anchorWorkspacePathOf(WORKSPACES, 's-1')).toBe('Z:\\repo-b')
    expect(anchorWorkspacePathOf(WORKSPACES, 's-9')).toBeUndefined()
    expect(anchorWorkspacePathOf({ items: 'bad' }, 's-1')).toBeUndefined()
    expect(anchorWorkspacePathOf(null, 's-1')).toBeUndefined()
  })

  it('resolveSelfAnchor：活跃会话 → workspace path → 解析缝项目 id', async () => {
    const services = servicesOf(storeOf(SESSIONS), storeOf(WORKSPACES))
    await expect(resolveSelfAnchor(services)).resolves.toBe('proj-1')
    expect(services.resolvedPaths).toEqual(['Z:\\repo-b'])
  })

  it('resolveSelfAnchor：任一环缺席（无活跃会话/无归属行/解析 undefined）= undefined', async () => {
    await expect(resolveSelfAnchor(servicesOf(storeOf({ byId: {} }), storeOf(WORKSPACES)))).resolves.toBeUndefined()
    await expect(resolveSelfAnchor(servicesOf(storeOf(SESSIONS), storeOf({ items: [] })))).resolves.toBeUndefined()
    await expect(resolveSelfAnchor(servicesOf(storeOf(SESSIONS), storeOf(WORKSPACES), [undefined as unknown as string]))).resolves.toBeUndefined()
    await expect(
      resolveSelfAnchor({
        sessionsList: () => storeOf(SESSIONS),
        workspacesList: () => storeOf(WORKSPACES),
        resolveProjectId: async () => {
          throw new Error('resolver down')
        },
      }),
    ).rejects.toThrow('resolver down')
  })
})

describe('sessions/workspaces 服务缝双通道取法（inject 正门 + reflect 回退）', () => {
  it('未装持有位 = reflect 回退值直通（缺席宿主语义不变）', () => {
    installSelfAnchorFiber(undefined)
    expect(selfAnchorSourceOf('sessions', 'fallback-a')).toBe('fallback-a')
    expect(selfAnchorSourceOf('workspaces', undefined)).toBeUndefined()
  })

  it('装载持有位后正门优先；持有位缺席键仍取回退', () => {
    const sessions = { list: { getSnapshot: () => SESSIONS } }
    installSelfAnchorFiber({ sessions })
    expect(selfAnchorSourceOf('sessions', 'fallback-a')).toBe(sessions)
    expect(selfAnchorSourceOf('workspaces', 'fallback-b')).toBe('fallback-b')
  })

  it('持有位属性读取抛错（fiber 撤销后门控拒绝）= 退回退通道不外抛', () => {
    const dead = {
      get sessions(): unknown {
        throw new Error('cannot get property without inject')
      },
    }
    installSelfAnchorFiber(dead)
    expect(selfAnchorSourceOf('sessions', 'fallback-a')).toBe('fallback-a')
    installSelfAnchorFiber(undefined)
  })
})
