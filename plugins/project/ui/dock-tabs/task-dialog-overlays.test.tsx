// 任务弹窗/转移对话框挂载面（无壳官方宿主自挂载）单测——桥受控三相位：
// 关闭零挂载 / drawerTaskId 在场挂载弹窗壳 / closeTaskDrawer 卸载；transitionFocus → 对话框；
// 本地桥不落页内全局（knowledge/task-loop 读该全局取锚——零冒充）。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { RpcClientFactory } from './rpc-channels.js'
import { detailFixture } from './overview/drawer/detail-model.test.js'
import { TaskDialogOverlays } from './dock-tabs.js'
import { createWorkbenchBridge, initialOverviewContext, type ForgeCenterNav, type WorkbenchBridge } from './bridge-mirror.js'

const noopNav: ForgeCenterNav = { showKnowledge: () => {}, showSession: () => {} }

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(async () => {
  if (root !== undefined) {
    await act(async () => {
      root!.unmount()
    })
  }
  host?.remove()
  root = undefined
  host = undefined
})

/** 详情替身 client（tasks.detail 命中即回——弹窗/对话框装载数据源） */
function detailClient(): RpcClientFactory {
  return () =>
    ({
      tasks: {
        detail: () => Promise.resolve(detailFixture({ allowedTransitions: ['blocked', 'skipped'] })),
      },
    }) as never
}

async function mount(bridge: WorkbenchBridge, overview = initialOverviewContext()): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<TaskDialogOverlays bridge={bridge} overview={overview} makeClient={detailClient()} />)
  })
  return host
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('TaskDialogOverlays（桥 drawerTaskId / transitionFocus 受控挂载）', () => {
  it('关闭态 = 弹窗/对话框零挂载', async () => {
    const bridge = createWorkbenchBridge(noopNav, { publish: false })
    const el = await mount(bridge, { projectId: 'p-1', workspaceId: null })
    expect(el.querySelector('[data-dswf-td-drawer]')).toBeNull()
  })

  it('无锚（projectId null）即便 drawerTaskId 在场 = 弹窗零挂载（不猜项目）', async () => {
    const bridge = createWorkbenchBridge(noopNav, { publish: false })
    const el = await mount(bridge)
    await act(async () => {
      bridge.openTaskDrawer('t-1')
    })
    expect(el.querySelector('[data-dswf-td-drawer]')).toBeNull()
  })

  it('openTaskDrawer → 弹窗壳挂载并装载详情标题；closeTaskDrawer → 卸载', async () => {
    const bridge = createWorkbenchBridge(noopNav, { publish: false })
    const el = await mount(bridge, { projectId: 'p-1', workspaceId: null })
    await act(async () => {
      bridge.openTaskDrawer('t-1')
    })
    expect(el.querySelector('[data-dswf-td-drawer]')).not.toBeNull()
    await settle()
    await settle()
    expect(el.textContent).toContain(detailFixture().title)
    await act(async () => {
      bridge.closeTaskDrawer()
    })
    expect(el.querySelector('[data-dswf-td-drawer]')).toBeNull()
  })

  it('openTaskTransition → 详情拉取后对话框挂载（preset 透传初选）', async () => {
    const bridge = createWorkbenchBridge(noopNav, { publish: false })
    const el = await mount(bridge, { projectId: 'p-1', workspaceId: null })
    await act(async () => {
      bridge.openTaskTransition({ taskId: 't-1', toStatus: 'blocked' })
    })
    await settle()
    await settle()
    expect(el.querySelector('[data-dswf-td-drawer]')).toBeNull()
    expect(el.textContent).toContain('转移')
  })
})

describe('createWorkbenchBridge publish 位', () => {
  it('缺省发布页内全局（壳侧真桥语义不变）', () => {
    ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = undefined
    const bridge = createWorkbenchBridge(noopNav)
    expect((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__).toBe(bridge)
    ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = undefined
  })

  it('publish=false = 本地桥不落页内全局（无壳宿主弹窗桥零冒充锚源）', () => {
    ;(globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__ = undefined
    createWorkbenchBridge(noopNav, { publish: false })
    expect((globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__).toBeUndefined()
  })
})
