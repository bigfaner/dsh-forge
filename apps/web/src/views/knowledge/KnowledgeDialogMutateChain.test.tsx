// knowledge-review-ui fix-2 · dialog 标题栏动作 → entryAction 落盘 → 浏览重拉链单测
// （happy-dom 客户端渲染）：dialog 保存/通过/驳回确认成功后必须通知浏览列表重拉
// （浏览网格呈现新值/新状态/零残留的唯一链）；失败回执零通知。EntryDrawer 级
// onMutated 接线 + KnowledgeView 装配级 refetch 全链两组锚。
// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { EntryDetail, KnowledgeCard } from '@dsh-forge/contracts'
import { KNOWLEDGE_CHANNELS, PROJECTS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeRpcClient, type ForgeRpcClient } from '../../rpc/index.js'
import { EntryDrawer } from './EntryDrawer.js'
import { KnowledgeView } from './KnowledgeView.js'

const CARD: KnowledgeCard = {
  entryId: 7,
  title: '单卡 待审',
  summary: '待审核条目',
  keywords: ['前端'],
  status: 'unconfirmed',
  domainPath: '前端',
  updated: '2026-11-06T00:00:00.000Z',
  heat: 0,
}

const DETAIL: EntryDetail = {
  entryId: 7,
  title: '单卡 待审',
  summary: '待审核条目',
  keywords: ['前端'],
  status: 'unconfirmed',
  domainPath: '前端',
  authors: '',
  updated: '2026-11-06T00:00:00.000Z',
  body: '正文。',
}

const PROJECT = {
  id: 'p-1',
  workspaceId: 'w-1',
  wsPath: 'Z:/ws/demo',
  name: 'demo',
  forgeDir: 'Z:/ws/demo/.forge',
  forgeDirExternal: false,
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

const NODES = [{ domainPath: '前端', label: '前端', depth: 1, entryCount: 1, unconfirmedCount: 1 }]

interface Stub {
  readonly client: ForgeRpcClient
  listEntriesCalls(): number
  readonly entryActions: unknown[]
  setEntryActionReceipt(receipt: unknown): void
}

function stubClient(): Stub {
  let listEntriesCount = 0
  let receipt: unknown = { results: [{ entryId: 7, outcome: 'success' }] }
  const entryActions: unknown[] = []
  const client = createForgeRpcClient(async (channel, payload) => {
    const data = await (async (): Promise<unknown> => {
      if (channel === KNOWLEDGE_CHANNELS.listEntries) {
        listEntriesCount++
        return [CARD]
      }
      if (channel === KNOWLEDGE_CHANNELS.browse) return NODES
      if (channel === PROJECTS_CHANNELS.get) return PROJECT
      if (channel === KNOWLEDGE_CHANNELS.entryDetail) return DETAIL
      if (channel === KNOWLEDGE_CHANNELS.entryAction) {
        entryActions.push(payload)
        return receipt
      }
      throw new Error(`unexpected channel: ${String(channel)}`)
    })()
    return { ok: true as const, data }
  })
  return {
    client,
    listEntriesCalls: () => listEntriesCount,
    entryActions,
    setEntryActionReceipt: (r) => {
      receipt = r
    },
  }
}

function click(container: HTMLElement, selector: string): void {
  const el = container.querySelector(selector)
  expect(el, `元素在场：${selector}`).not.toBeNull()
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function modalConfirmButton(scope: ParentNode): HTMLElement {
  const buttons = [...scope.querySelectorAll<HTMLElement>('.dswf-kn-reject-modal button')]
  const hit = buttons.find((b) => (b.textContent ?? '').trim() === '确认驳回')
  expect(hit, '确认驳回钮在场').toBeDefined()
  return hit!
}

describe('EntryDrawer（dialog 动作 → onMutated 通知接线）', () => {
  async function mount(overrides: Partial<{ receipt: unknown }> = {}): Promise<{
    container: HTMLElement
    root: ReturnType<typeof createRoot>
    stub: Stub
    mutated: number
    closed: number
  }> {
    const stub = stubClient()
    if (overrides.receipt !== undefined) stub.setEntryActionReceipt(overrides.receipt)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let mutated = 0
    let closed = 0
    await act(async () => {
      root.render(
        <EntryDrawer
          projectId="p-1"
          entryId={7}
          makeClient={() => stub.client}
          onMutated={() => {
            mutated++
          }}
          onClose={() => {
            closed++
          }}
        />,
      )
    })
    await flush() // 详情装载
    return { container, root, stub, get mutated() { return mutated }, get closed() { return closed } }
  }

  it('标题栏通过成功 → onMutated 恰一次（浏览重拉通知）+ onClose 关闭', async () => {
    const ctx = await mount()
    expect(ctx.stub.listEntriesCalls(), '前置：零浏览调用（本测面无浏览）').toBe(0)
    await act(async () => {
      click(ctx.container, '[data-dswf-kn-dialog-confirm]')
    })
    await flush()
    expect(ctx.stub.entryActions).toEqual([{ projectId: 'p-1', action: 'confirm', entryIds: [7] }])
    expect(ctx.mutated).toBe(1)
    expect(ctx.closed).toBe(1)
    await act(async () => {
      ctx.root.unmount()
    })
  })

  it('驳回确认成功 → onMutated 恰一次（Modal 二段收口后）', async () => {
    const ctx = await mount()
    await act(async () => {
      click(ctx.container, '[data-dswf-kn-dialog-reject]')
    })
    await act(async () => {
      modalConfirmButton(document.body).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()
    expect(ctx.stub.entryActions).toEqual([{ projectId: 'p-1', action: 'reject', entryIds: [7] }])
    expect(ctx.mutated).toBe(1)
    expect(ctx.closed).toBe(1)
    await act(async () => {
      ctx.root.unmount()
    })
  })

  it('编辑保存成功 → onMutated 恰一次（editMeta 落盘后）', async () => {
    const ctx = await mount()
    await act(async () => {
      click(ctx.container, '[data-dswf-kn-dialog-edit]')
    })
    await act(async () => {
      click(ctx.container, '[data-dswf-kn-dialog-save]')
    })
    await flush()
    expect(ctx.stub.entryActions).toHaveLength(1)
    expect((ctx.stub.entryActions[0] as { action: string }).action).toBe('editMeta')
    expect(ctx.mutated).toBe(1)
    expect(ctx.closed).toBe(0) // 保存不关 dialog
    await act(async () => {
      ctx.root.unmount()
    })
  })

  it('动作失败（逐条 failure 回执）→ onMutated 零调用（失败不触发浏览重拉）', async () => {
    const ctx = await mount({ receipt: { results: [{ entryId: 7, outcome: 'failure', code: 'cas-failed', message: '状态漂移' }] } })
    await act(async () => {
      click(ctx.container, '[data-dswf-kn-dialog-confirm]')
    })
    await flush()
    expect(ctx.mutated).toBe(0)
    expect(ctx.closed).toBe(0)
    await act(async () => {
      ctx.root.unmount()
    })
  })
})

describe('KnowledgeView（装配级：dialog 动作成功 → 浏览列表重拉）', () => {
  async function mountView(): Promise<{
    container: HTMLElement
    root: ReturnType<typeof createRoot>
    stub: Stub
    rerender(): Promise<void>
  }> {
    const stub = stubClient()
    const makeClient = (): ForgeRpcClient => stub.client // 恒等工厂（引用稳定——防重渲染触发浏览 effect 重拉假阳性）
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let openId: number | null = null
    const rerender = async (): Promise<void> => {
      await act(async () => {
        root.render(
          <KnowledgeView
            projectId="p-1"
            openEntryId={openId}
            onOpenEntryChange={(id) => {
              openId = id
            }}
            makeClient={makeClient}
          />,
        )
      })
    }
    await rerender()
    await flush() // 浏览首拉
    return { container, root, stub, rerender }
  }

  it('标题栏通过成功 → 浏览列表重拉（listEntries 再调用——chip 呈现新状态的唯一链）', async () => {
    const ctx = await mountView()
    const before = ctx.stub.listEntriesCalls()
    expect(before).toBeGreaterThan(0)
    // 开 dialog
    await act(async () => {
      click(ctx.container, '[data-dswf-entry]')
    })
    await ctx.rerender()
    await flush()
    // 标题栏通过
    await act(async () => {
      click(ctx.container, '[data-dswf-kn-dialog-confirm]')
    })
    await flush()
    expect(ctx.stub.entryActions).toEqual([{ projectId: 'p-1', action: 'confirm', entryIds: [7] }])
    expect(ctx.stub.listEntriesCalls()).toBeGreaterThan(before)
    await act(async () => {
      ctx.root.unmount()
    })
  })
})
