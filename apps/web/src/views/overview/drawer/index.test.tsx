// 任务详情抽屉单测 —— AC1 两分块结构 / AC2 折叠就地更新（aria + 类位）/ AC6 调宽与关闭锚 /
// 装载壳（fetch 唯一通道 + 关闭不渲染 + 首帧骨架）。渲染面 = renderToStaticMarkup（仓库形制）；
// 拖拽/键盘/Esc 的 DOM 事件链 = 4.1 装配 + 5.2 e2e 面（纯数学面已归 collapse.test）。
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TASK_TYPES, type TaskDetail, type TaskDetailQuery, type TaskRecordEntry } from '@dsh-forge/contracts'
import { RpcClientError } from '../../../rpc/errors.js'
import type { ForgeRpcClient } from '../../../rpc/index.js'
import { detailFixture } from './detail-model.test.js'
import {
  DRAWER_WIDTH_DEFAULT,
  initialDrawerCollapse,
  toggleDrawerSection,
} from './collapse.js'
import { TaskDrawer, TaskDrawerBody, drawerBodySections, fetchTaskDetail } from './index.js'

const NOOP = (): void => {}
const NOW = Date.parse('2026-10-06T12:00:00.000Z')

/** 基准记录链（add → claim → submit——completed 任务全织入面） */
const RECORDS: readonly TaskRecordEntry[] = [
  { verb: 'add', actor: 'plugin-tool', createdAt: '2026-10-01T09:14:00.000Z' },
  { verb: 'claim', actor: 'plugin-tool', createdAt: '2026-10-04T14:02:00.000Z', digest: 'd3f92a71', sessionId: 's1' },
  {
    verb: 'submit',
    actor: 'plugin-tool',
    createdAt: '2026-10-04T16:00:00.000Z',
    summary: 'gate 全过',
    files: ['a.ts'],
    commitHash: 'a1b2c3d4',
    gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.61 },
    sessionId: 's1-1',
  },
]

/** 基准 props（completed coding 任务——两块全展开） */
function bodyProps(overrides: Partial<Parameters<typeof TaskDrawerBody>[0]> = {}) {
  return {
    detail: detailFixture({ records: [...RECORDS] }),
    width: DRAWER_WIDTH_DEFAULT,
    collapsed: initialDrawerCollapse(),
    animate: true,
    onClose: NOOP,
    onToggleSection: NOOP,
    onOpenDoc: NOOP,
    onResetWidth: NOOP,
    onStepWidth: NOOP,
    onDragWidth: NOOP,
    now: NOW,
    ...overrides,
  }
}

describe('TaskDrawerBody · 通用区（AC1）', () => {
  it('结构：✕ 关闭右端 + 任务键 + 中文状态标签 + 标题 + kv 标签行 `{key} : {value}`', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(html).toContain('data-dswf-td-drawer=""')
    expect(html).toContain('data-dswf-td-close') // ✕ 在头部行尾（spacer 之后）
    expect(html).toContain('m2-pipeline/2.4')
    expect(html).toContain('已完成')
    expect(html).toContain('plugin-forge tool 半身对接')
    expect(html).toContain('data-dswf-td-kv=""')
    // chip 内部格式 {key} : {value}（分隔段在场）
    expect(html).toContain('类别')
    expect(html).toContain('coding-feature')
    expect(html).toContain('优先级')
    expect(html).toContain('P0')
    expect(html).toContain('预估耗时')
    expect(html).toContain('4h')
    expect(html).toContain('实际耗时')
    expect(html).toContain('2h31m')
    expect(html).toContain('复杂度')
    expect(html).toContain('高')
  })

  it('关闭钮在头部最右（✕ 之前有 spacer 推至右缘——DOM 序断言）', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    const spacerAt = html.indexOf('dswf-td-spacer')
    const closeAt = html.indexOf('data-dswf-td-close')
    expect(spacerAt).toBeGreaterThan(0)
    expect(closeAt).toBeGreaterThan(spacerAt)
  })

  it('影响 chip（breaking）：⚠ breaking 红档；非 breaking 不显', () => {
    const breaking = renderToStaticMarkup(TaskDrawerBody(bodyProps({ detail: detailFixture({ breaking: true }) })))
    expect(breaking).toContain('影响')
    expect(breaking).toContain('⚠ breaking')
    expect(breaking).toContain('dswf-td-kv-breaking')
    const calm = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(calm).not.toContain('影响')
  })

  it('类别 chip 着类别色（族类 class 在场——CSS 令牌映射位）', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(html).toContain('dswf-td-cat-coding')
  })
})

describe('TaskDrawerBody · 两分块与折叠（AC1/AC2）', () => {
  it('两分块在场：块一 任务内容（目标/结果 + 模板 + 覆盖率 + 备注）、块二 时间线（现状条 + 事件流）', () => {
    const html = renderToStaticMarkup(
      TaskDrawerBody(bodyProps({ detail: detailFixture({ records: [...RECORDS], vars: { note: 'fix-1 记账' } }) })),
    )
    expect(html).toContain('data-dswf-td-sect="content"')
    expect(html).toContain('data-dswf-td-sect="timeline"')
    expect(html).toContain('任务内容')
    expect(html).toContain('时间线')
    expect(html).toContain('data-dswf-td-goal=""')
    expect(html).toContain('data-dswf-td-result=""')
    expect(html).toContain('data-dswf-td-cov=""')
    expect(html).toContain('data-dswf-td-note=""')
    expect(html).toContain('data-dswf-td-now=""')
    expect(html).toContain('data-dswf-td-ev-verb="submit"')
    // 时间线块头计数 hint
    expect(html).toContain('3 条')
  })

  it('块标题视觉区分与层次阶梯类位：底色条块头 + 主色加粗 + 子标题/键标签加粗类', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(html).toContain('dswf-td-sect-title') // 块头标题（13/600 主色——CSS 承载）
    expect(html).toContain('dswf-td-tck') // 子标题（目标/结果/参考文档…）
    expect(html).toContain('dswf-td-kv-k') // 键标签（症状/命令…）
  })

  it('折叠就地更新类位：aria-expanded 同步 + grid 0fr/1fr 类切换 + caret 旋转（AC2）', () => {
    const open = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(open).toContain('aria-expanded="true"')
    expect(open).not.toContain('is-collapsed')
    const collapsed = renderToStaticMarkup(
      TaskDrawerBody(bodyProps({ collapsed: toggleDrawerSection(initialDrawerCollapse(), 'timeline') })),
    )
    // 块体常驻 DOM（折叠仅类切换——不卸载内容）
    expect(collapsed).toContain('data-dswf-td-sect-body="timeline"')
    expect(collapsed).toContain('dswf-td-sect-body is-collapsed') // grid 0fr
    expect(collapsed).toContain('dswf-td-caret is-closed')
    // 两块 aria 独立
    const contentOpen = collapsed.indexOf('data-dswf-td-sect="content"')
    const timelineClosed = collapsed.indexOf('data-dswf-td-sect="timeline"')
    expect(collapsed.slice(contentOpen, contentOpen + 80)).toContain('aria-expanded="true"')
    expect(collapsed.slice(timelineClosed, timelineClosed + 80)).toContain('aria-expanded="false"')
  })

  it('块头 = button（Enter/Space 原生可用）；滑入动画仅切换任务播放（同任务 no-anim，AC2/流程4）', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(html).toContain('<button type="button" class="dswf-td-sect"')
    const same = renderToStaticMarkup(TaskDrawerBody(bodyProps({ animate: false })))
    expect(same).toContain('no-anim')
    expect(html).not.toContain('no-anim')
  })

  it('drawerBodySections：两块 id 与标题序（块一 → 块二）', () => {
    expect(drawerBodySections()).toEqual([
      { id: 'content', title: '任务内容' },
      { id: 'timeline', title: '时间线' },
    ])
  })
})

describe('TaskDrawerBody · 目标/结果与备注（AC4 块首对行）', () => {
  it('目标/结果上下展示：标签在上、内容在下（DOM 序——标签先于内容节点）', () => {
    const html = renderToStaticMarkup(
      TaskDrawerBody(
        bodyProps({ detail: detailFixture({ records: [...RECORDS], vars: { goal: '每工作区 forge.db 七域表落地' } }) }),
      ),
    )
    const goalLabel = html.indexOf('data-dswf-td-goal=""')
    const goalText = html.indexOf('每工作区 forge.db 七域表落地')
    const resultLabel = html.indexOf('data-dswf-td-result=""')
    const resultText = html.indexOf('gate 全过')
    expect(goalLabel).toBeGreaterThan(-1)
    expect(goalText).toBeGreaterThan(goalLabel)
    expect(resultLabel).toBeGreaterThan(goalText)
    expect(resultText).toBeGreaterThan(resultLabel)
  })
})

describe('TaskDrawerBody · 调宽与关闭（AC6）', () => {
  it('宽度经 style 注入（px）；左缘手柄 = separator（键盘可聚焦 + 双击复位/步进锚）', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps({ width: 560 })))
    expect(html).toContain('width:560px')
    expect(html).toContain('data-dswf-td-resize=""')
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).toContain('tabindex="0"')
  })

  it('底部「转移状态…」入口：props 回调在场可点；缺席禁用（3.8 对话框接线位）', () => {
    const html = renderToStaticMarkup(TaskDrawerBody(bodyProps({ onTransition: NOOP })))
    expect(html).toContain('data-dswf-td-trans=""')
    expect(html).toContain('转移状态…')
    const absent = renderToStaticMarkup(TaskDrawerBody(bodyProps()))
    expect(absent).toContain('disabled')
  })

  it('参考文档 chip 点击锚上抛 onOpenDoc（resolved 链接态——AC3；抽屉保持由调用方保证）', () => {
    const html = renderToStaticMarkup(
      TaskDrawerBody(
        bodyProps({
          detail: detailFixture({
            vars: {},
            refs: [{ docRel: 'docs/proposals/p/proposal.md', resolved: true, title: 'P' }],
          }),
        }),
      ),
    )
    expect(html).toContain('data-dswf-td-ref="docs/proposals/p/proposal.md"')
  })
})

describe('fetchTaskDetail（数据面——rpc tasks.detail 唯一通道）', () => {
  function recordingClient(
    impl: (q: TaskDetailQuery) => Promise<TaskDetail>,
  ): { client: ForgeRpcClient; calls: string[] } {
    const calls: string[] = []
    const mark =
      (name: string, fn: (arg?: unknown) => Promise<unknown>) =>
      async (arg?: unknown): Promise<unknown> => {
        calls.push(name)
        return fn(arg)
      }
    return {
      calls,
      client: {
        projects: {
          register: mark('projects.register', () => Promise.resolve({})),
          list: mark('projects.list', () => Promise.resolve([])),
          get: mark('projects.get', () => Promise.resolve(null)),
          update: mark('projects.update', () => Promise.resolve({})),
          reconcile: mark('projects.reconcile', () => Promise.resolve({})),
          deriveTaskStoreDir: mark('projects.deriveTaskStoreDir', () => Promise.resolve({})),
        },
        fs: { listDir: mark('fs.listDir', () => Promise.resolve({})) },
        knowledge: {
          browse: mark('knowledge.browse', () => Promise.resolve([])),
          listEntries: mark('knowledge.listEntries', () => Promise.resolve([])),
          entryDetail: mark('knowledge.entryDetail', () => Promise.resolve({})),
          heat: mark('knowledge.heat', () => Promise.resolve(new Map())),
          sessionRecall: mark('knowledge.sessionRecall', () => Promise.resolve([])),
        },
        tasks: {
          transition: mark('tasks.transition', () => Promise.resolve({})),
          query: mark('tasks.query', () => Promise.resolve({})),
          validateFeatureTasks: mark('tasks.validateFeatureTasks', () => Promise.resolve({})),
          list: mark('tasks.list', () => Promise.resolve([])),
          stats: mark('tasks.stats', () => Promise.resolve({})),
          graph: mark('tasks.graph', () => Promise.resolve({})),
          detail: mark('tasks.detail', (q) => impl(q as TaskDetailQuery)),
          sessionLinks: mark('tasks.sessionLinks', () => Promise.resolve([])),
        },
        features: {
          register: mark('features.register', () => Promise.resolve({})),
          transition: mark('features.transition', () => Promise.resolve({})),
          upsertDoc: mark('features.upsertDoc', () => Promise.resolve({})),
          list: mark('features.list', () => Promise.resolve([])),
          listDocs: mark('features.listDocs', () => Promise.resolve([])),
        },
        proposals: { list: mark('proposals.list', () => Promise.resolve([])) },
        docs: {
          read: mark('docs.read', () => Promise.resolve({})),
          openExternal: mark('docs.openExternal', () => Promise.resolve(undefined)),
        },
      } as ForgeRpcClient,
    }
  }

  it('唯一通道 = tasks.detail({projectId, taskId})；其余通道零调用', async () => {
    const detail = detailFixture()
    const { client, calls } = recordingClient(() => Promise.resolve(detail))
    const out = await fetchTaskDetail(client, 'p-1', 't-1')
    expect(out).toEqual({ ok: true, detail })
    expect(calls).toEqual(['tasks.detail'])
  })

  it('typed error 归一：RpcClientError → message 原样 + rpcUiState 映射（ERR_TASK_NOT_FOUND → 空态）', async () => {
    const { client } = recordingClient(() =>
      Promise.reject(new RpcClientError({ code: 'ERR_TASK_NOT_FOUND', message: '任务未命中' })),
    )
    const out = await fetchTaskDetail(client, 'p-1', 'ghost')
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error.message).toBe('任务未命中')
      expect(out.error.uiState).toBe('empty-state')
    }
  })
})

describe('TaskDrawer（装载壳——静态首帧）', () => {
  function shellClient(): ForgeRpcClient {
    const fail = (): Promise<never> => Promise.reject(new Error('不应在静态渲染期调用'))
    const stub = (): Promise<never> => fail()
    return {
      projects: { register: stub, list: stub, get: stub, update: stub, reconcile: stub, deriveTaskStoreDir: stub },
      fs: { listDir: stub },
      knowledge: { browse: stub, listEntries: stub, entryDetail: stub, heat: stub, sessionRecall: stub },
      tasks: {
        transition: stub,
        query: stub,
        validateFeatureTasks: stub,
        list: stub,
        stats: stub,
        graph: stub,
        detail: stub,
        sessionLinks: stub,
      },
      features: { register: stub, transition: stub, upsertDoc: stub, list: stub, listDocs: stub },
      proposals: { list: stub },
      docs: { read: stub, openExternal: stub },
    } as unknown as ForgeRpcClient
  }

  it('taskId = null（关闭）→ 不渲染任何抽屉节点', () => {
    expect(
      renderToStaticMarkup(createElement(TaskDrawer, { projectId: 'p-1', taskId: null, onClose: NOOP, makeClient: shellClient })),
    ).toBe('')
  })

  it('打开首帧（effect 未跑）= 抽屉壳 + 装载骨架（详情拉取不阻塞滑入呈现）', () => {
    const html = renderToStaticMarkup(
      createElement(TaskDrawer, { projectId: 'p-1', taskId: 't-1', onClose: NOOP, makeClient: shellClient }),
    )
    expect(html).toContain('data-dswf-td-drawer=""')
    expect(html).toContain('data-dswf-td-skeleton')
    expect(html).not.toContain('data-dswf-td-sect="content"')
  })

  it('全 20 类型 × 两块装配不炸（模板路由穷尽冒烟——渲染面稳健性）', () => {
    for (const type of TASK_TYPES) {
      const html = renderToStaticMarkup(
        TaskDrawerBody(bodyProps({ detail: detailFixture({ taskType: type }) })),
      )
      expect(html).toContain('data-dswf-td-sect="content"')
      expect(html).toContain('data-dswf-td-sect="timeline"')
    }
  })
})
