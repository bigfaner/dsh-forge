// bug 852c6ea7 · fix-4 —— KnowledgePanel 桥缺席降级路径 useSyncExternalStore 快照不稳定
// （readDrawer 每次返回新对象字面量）→ React #185（Maximum update depth）挂载即崩。
// 组件级收口（happy-dom 客户端渲染）：桥缺席挂载面板不无限重渲（#185 抛错 = 快照
// 引用不稳定的 React 侧判定信号），且视图锚完整；桥在场路径（镜像面引用稳定）不回退。
// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ForgeKnowledgePanel } from './KnowledgePanel.js'
import type { WorkbenchBridgeMirror } from '../shared/workbench-bridge.js'

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(node)
  })
  return container
}

describe('KnowledgePanel 桥缺席降级快照稳定性（bug 852c6ea7）', () => {
  it('桥缺席挂载不抛 React #185（快照引用不稳定 → 无限重渲的 React 判定信号）且视图锚在场', async () => {
    const container = await mount(<ForgeKnowledgePanel />)
    expect(container.querySelector('[data-dswf-view="knowledge"]')).not.toBeNull()
    expect(container.querySelector('[data-dswf-knowledge-view]')).not.toBeNull()
  })

  it('桥在场路径不回退：镜像桥快照引用稳定，订阅透传可达', async () => {
    const subscribers = new Set<() => void>()
    const snapshot = { drawerEntryId: null as number | null }
    const bridge = {
      subscribe: (onChange: () => void) => {
        subscribers.add(onChange)
        return () => subscribers.delete(onChange)
      },
      getSnapshot: () => snapshot,
      setDrawerEntry: () => {},
    } satisfies Pick<WorkbenchBridgeMirror, 'subscribe' | 'getSnapshot' | 'setDrawerEntry'>
    const container = await mount(<ForgeKnowledgePanel bridge={bridge} />)
    expect(container.querySelector('[data-dswf-knowledge-view]')).not.toBeNull()
    expect(subscribers.size).toBe(1)
  })
})
