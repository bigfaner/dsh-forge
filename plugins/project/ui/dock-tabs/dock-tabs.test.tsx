// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// dock-tabs 单测 —— 4.1 右栏 dock tab 装配体：legacy 地址编解码（自宿主壳兼容面）+
// 官方渠道文档开出（2.8——openResource + sessionFileAddress）+ 概览装配体全相位 SSR
//（无锚空态/三视图接线/弹窗退役记账[m3.1 D21/D23——本体迁 ShellHost]）。
// effect 面（事件订阅/详情拉取/桥订阅驱动）归 e2e（5.2）——renderToStaticMarkup 零 effect
// 同全仓口径。
// 2.8 退役测试随迁留痕（不静默删）：原 docs/index.test.tsx（DocsTab 自绘预览/格式分流
// docFormatOf/fetchDocContent/DocsTab 装载胶水用例）与 dock-tabs.test 原 ForgeDocsTab
// describe 随 forge:docs/read 文档 tab 读取用途退役——去向 = 官方
// @deepseek-ai/dsh-client-ui-sidebar-documentpreview 内置渲染（按后缀自动选，不点名 kind）；本文件
// 「结构钉」describe 承接退役后的结构面（DSWF_DOC_TAB_KIND 零注册/打开路径）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { RpcClientFactory } from './rpc-channels.js'
import { FORGE_REMOTE_FACE_ANCHOR_KEY, forgeRemoteFaceOf, installForgeRemoteFace } from '../rpc.js'
import type { DirFactsClientFactory } from './overview/dir-rows.js'
import { detailFixture } from './overview/drawer/detail-model.test.js'
import { TransitionDialog } from './overview/drawer/transition-dialog.js'
import {
  DSWF_DOC_ADDRESS_PREFIX,
  DSWF_OVERVIEW_TAB_KIND,
  ForgeOverviewSectionHost,
  ForgeOverviewTab,
  OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY,
  OVERVIEW_SECTIONS_CHILDREN,
  OverviewDockAssembly,
  dockDocOpener,
  forgeDocAddress,
  forgeDocFileAddress,
  joinForgeDocPath,
  nextTaskFocusApply,
  parseForgeDocAddress,
  type DockSidebarRightMirror,
  type OverviewSectionSlots,
  type TransitionTarget,
} from './dock-tabs.js'
import { DSWF_OVERVIEW_TAB_KEY } from '@dsh-forge/lib-ui'
import { KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT } from '../keyed-section.js'
import {
  createWorkbenchBridge,
  initialOverviewContext,
  type ForgeCenterNav,
  type WorkbenchBridge,
} from './bridge-mirror.js'

/** 假 RPC client 构造器（装载在途——SSR 无 effect，恒骨架相位） */
const pendingClient = vi.fn() as unknown as RpcClientFactory

const NOOP = (): void => {}

const noopNav: ForgeCenterNav = { showKnowledge: () => {}, showSession: () => {} }

/** 建真桥（快照可写回——setOverviewContext 消费面直测） */
function freshBridge(): WorkbenchBridge {
  return createWorkbenchBridge(noopNav)
}

describe('文档 tab legacy 地址编解码（自宿主壳兼容面——官方宿主零打开径）', () => {
  it('前缀 = dsh-resource://dswf-doc/（资源面 scheme——legacy 壳侧同源 pin 保持）', () => {
    expect(DSWF_DOC_ADDRESS_PREFIX).toBe('dsh-resource://dswf-doc/')
    expect(forgeDocAddress('p1', 'docs/features/x/proposal.md')).toBe(
      'dsh-resource://dswf-doc/p1/docs/features/x/proposal.md',
    )
  })

  it('roundtrip：encode → parse 还原 projectId + docRel（docRel 含子目录/空格/CJK 原样保持）', () => {
    expect(parseForgeDocAddress(forgeDocAddress('abc-123', 'docs/a.md'))).toEqual({ projectId: 'abc-123', docRel: 'docs/a.md' })
    expect(parseForgeDocAddress(forgeDocAddress('p', 'root.md'))).toEqual({ projectId: 'p', docRel: 'root.md' })
    expect(parseForgeDocAddress(forgeDocAddress('p', 'docs/鲸游 书海/设计.md'))).toEqual({
      projectId: 'p',
      docRel: 'docs/鲸游 书海/设计.md',
    })
  })

  it('parse 拒绝：异前缀地址 / 缺 projectId / 缺 docRel（持久化布局陈旧地址 → 占位面不炸）', () => {
    expect(parseForgeDocAddress('sidebar://guide')).toBeNull()
    expect(parseForgeDocAddress('dsh-resource://dswf-doc/')).toBeNull()
    expect(parseForgeDocAddress('dsh-resource://dswf-doc/p1/')).toBeNull()
    expect(parseForgeDocAddress('dsh-resource://dswf-doc/docs/a.md')).toEqual({ projectId: 'docs', docRel: 'a.md' }) // 首段 = projectId（uuid 无斜杠契约）
  })

  it('同 address 同键（contentId = 地址本身——官方资源面 reveal 去重）；异 docRel 异地址', () => {
    expect(forgeDocAddress('p1', 'a.md')).toBe(forgeDocAddress('p1', 'a.md'))
    expect(forgeDocAddress('p1', 'a.md')).not.toBe(forgeDocAddress('p1', 'b.md'))
    expect(forgeDocAddress('p1', 'a.md')).not.toBe(forgeDocAddress('p2', 'a.md'))
  })
})

describe('官方渠道文档开出（2.8 openResource + 2.13 数据路 forgeDirs.facts——官方 sessionFileAddress）', () => {
  const forgeDirFixture = 'Z:/proj/.forge'
  /** forgeDirs facts 消费切片替身（DirFactsClientFactory 同型——数据路注入 = 测试面） */
  const makeDirFactsOf = (forgeDir: string | null): DirFactsClientFactory =>
    (() => ({
      facts: async () =>
        forgeDir === null ? [] : [{ dirKey: 'forgeDir', dir: forgeDir, description: '' }],
    })) as unknown as DirFactsClientFactory
  const makeSidebarRight = (): { readonly mirror: DockSidebarRightMirror; readonly openResource: ReturnType<typeof vi.fn> } => {
    const openResource = vi.fn()
    return {
      openResource,
      mirror: { openResource, mounted: { getSnapshot: () => 'sess-1' } },
    }
  }

  it('文档行点击 → openResource(官方 dsh-resource://file/session 地址，不点名 kind——注册表按后缀选渲染器)——地址 = 官方 sessionFileAddress 真实产物（禁手拼）', async () => {
    const { mirror, openResource } = makeSidebarRight()
    const open = dockDocOpener(mirror, 'p1', undefined, makeDirFactsOf(forgeDirFixture))
    expect(typeof open).toBe('function')
    open!('docs/x/proposal.md')
    await Promise.resolve()
    await Promise.resolve()
    expect(openResource).toHaveBeenCalledTimes(1)
    // 期望地址 = 官方构造器真实产物形状（sessionId 内嵌 + forgeDir/docRel join 绝对路径）；
    // 实参仅地址一个（强制 kind:'text' = 绕过注册表排序落纯文本兜底——图片/PDF 被按文本开）
    expect(openResource.mock.calls[0]?.length).toBe(1)
    expect(openResource).toHaveBeenCalledWith(
      sessionFileAddress('sess-1', joinForgeDocPath(forgeDirFixture, 'docs/x/proposal.md')),
    )
    expect(openResource.mock.calls[0]?.[0]).toMatch(/^dsh-resource:\/\/file\/session\//)
    expect(openResource.mock.calls[0]?.[0]).toBe(
      'dsh-resource://file/session/sess-1/Z:/proj/.forge/docs/x/proposal.md',
    )
  })

  it('生产默认值路径（2.13 零替身）：官方 gateway 面形状 forgeDirs.facts 为唯一数据源装配 → openResource 官方地址', async () => {
    // 官方 gateway 真机装配形态（rpc.forge-face.test 同构）：namespaces Map + forgeDirs.service.facts
    const namespaces = new Map([
      [
        'forgeDirs',
        {
          service: {
            facts: () =>
              Promise.resolve({ ok: true, value: [{ dirKey: 'forgeDir', dir: forgeDirFixture, description: '' }] }),
          },
        },
      ],
    ])
    installForgeRemoteFace(() => ({ namespaces }) as unknown as ReturnType<typeof forgeRemoteFaceOf>)
    try {
      const { mirror, openResource } = makeSidebarRight()
      // 第三/第四参零注入——走缺省 forgeDirs Typert 真身（修前 = preloadRpcClientFactory，
      // 无 window.dshForge 环境 invoke 缺席抛 → 被吞 → 本用例必红）
      const open = dockDocOpener(mirror, 'p1')
      expect(typeof open).toBe('function')
      open!('docs/x/proposal.md')
      // Typert 通路多一跳 invokeRemote await 链——宏任务兜底等稳
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(openResource).toHaveBeenCalledTimes(1)
      expect(openResource.mock.calls[0]?.length).toBe(1)
      expect(openResource).toHaveBeenCalledWith(
        sessionFileAddress('sess-1', joinForgeDocPath(forgeDirFixture, 'docs/x/proposal.md')),
      )
    } finally {
      delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY]
    }
  })

  it('数据路失败 → 可见错误不吞（2.13）：onError 文案含「文档开出失败」+ 失败原因；openResource 零调用', async () => {
    const { mirror, openResource } = makeSidebarRight()
    const onError = vi.fn()
    const open = dockDocOpener(
      mirror,
      'p1',
      onError,
      (() => ({ facts: async () => { throw new Error('forgeDirs 通道不可达') } })) as unknown as DirFactsClientFactory,
    )
    open!('a.md')
    await Promise.resolve()
    await Promise.resolve()
    expect(openResource).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toContain('文档开出失败')
    expect(onError.mock.calls[0]?.[0]).toContain('forgeDirs 通道不可达')
  })

  it('forgeDocFileAddress/joinForgeDocPath 纯面：win 反斜杠归一 + 尾分隔符收口 + 空格/CJK 逐段编码', () => {
    expect(joinForgeDocPath('Z:/proj/.forge/', 'docs\\a b\\设计.md')).toBe('Z:/proj/.forge/docs/a b/设计.md')
    const address = forgeDocFileAddress('sess 1', 'Z:\\proj\\.forge', 'docs/a.md')
    expect(address).toBe(sessionFileAddress('sess 1', 'Z:/proj/.forge/docs/a.md'))
    expect(address).toMatch(/^dsh-resource:\/\/file\/session\/sess%201\/Z:\/proj\/\.forge\/docs\/a\.md$/)
    expect(joinForgeDocPath('Z:/w', '')).toBe('Z:/w')
  })

  it('任一缺席 → undefined（服务/项目锚）；sessionId 缺席或 forgeDir 行缺席 → 不开出 + onError 可见', async () => {
    expect(dockDocOpener(undefined, 'p1', undefined, makeDirFactsOf(forgeDirFixture))).toBeUndefined()
    expect(dockDocOpener(makeSidebarRight().mirror, null, undefined, makeDirFactsOf(forgeDirFixture))).toBeUndefined()
    const noSession = makeSidebarRight()
    ;(noSession.mirror.mounted as { getSnapshot: () => string | undefined }).getSnapshot = () => undefined
    dockDocOpener(noSession.mirror, 'p1', undefined, makeDirFactsOf(forgeDirFixture))!('a.md')
    await Promise.resolve()
    await Promise.resolve()
    expect(noSession.openResource).not.toHaveBeenCalled()
    const noForgeDir = makeSidebarRight()
    const noForgeDirError = vi.fn()
    dockDocOpener(noForgeDir.mirror, 'p1', noForgeDirError, makeDirFactsOf(null))!('a.md')
    await Promise.resolve()
    await Promise.resolve()
    expect(noForgeDir.openResource).not.toHaveBeenCalled()
    expect(noForgeDirError.mock.calls[0]?.[0]).toContain('forgeDir 行缺席')
  })

  it('官方 openResource 抛错（无在场面）= 不外溢 + onError 可见（fail-soft 不吞调用期异常）', async () => {
    const throwing: DockSidebarRightMirror = {
      openResource: () => {
        throw new Error('no session surface is mounted')
      },
      mounted: { getSnapshot: () => 'sess-1' },
    }
    const onError = vi.fn()
    expect(() => dockDocOpener(throwing, 'p1', onError, makeDirFactsOf(forgeDirFixture))!('a.md')).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(onError.mock.calls[0]?.[0]).toContain('no session surface is mounted')
  })
})

describe('结构钉（2.8 AC②）：project ui 源码零 DSWF_DOC_TAB_KIND 注册/打开路径', () => {
  const src = readFileSync(fileURLToPath(new URL('./dock-tabs.tsx', import.meta.url)), 'utf8')
  it('零自绘 kind 打开径（openResource(forgeDocAddress)/kind: DSWF_DOC_TAB_KIND）+ 零 DocsTab 依赖 + 零文档 tab body', () => {
    expect(src).not.toMatch(/openResource\(forgeDocAddress/)
    expect(src).not.toMatch(/kind:\s*DSWF_DOC_TAB_KIND/)
    expect(src, '零 DocsTab import/渲染（自绘预览退役——注释指称豁免）').not.toMatch(/import \{ DocsTab|<DocsTab/)
    expect(src, '零 docs/index 依赖').not.toMatch(/from '\.\/docs\/index\.js'/)
    expect(src, '零 ForgeDocsTab 导出（文档 tab body 退役）').not.toMatch(/export (function|interface) ForgeDocsTab/)
    // 官方渠道缝在场（sessionFileAddress 官方构造器单源）；零强制 kind（点名 'text' = 落纯文本兜底，
    // 官方文件树口径 = openResource(address) 不传 kind）
    expect(src).toContain('sessionFileAddress')
    expect(src, '文档开出不得强制 kind').not.toMatch(/openResource\([^)]*\{\s*kind:/)
  })
  it('2.13 调用期异常可见面在场：OverviewDockBody ErrorBar 装配（数据路失败 → 错误条呈现——不静默吞）', () => {
    expect(src).toContain('data-dswf-ov-doc-error')
    expect(src).toContain('onError')
    expect(src, '零 preload 工厂依赖（2.13——数据路缺省走 forgeDirs Typert facts）').not.toContain('preloadRpcClientFactory')
  })
})

describe('ForgeOverviewSectionHost 项目台插槽节宿主（fix-7 knowledge-dir：keyed 子槽消费）', () => {
  const renderSlotFixture = (
    render: (key: string) => ReactNode,
  ): { readonly renderSlot: OverviewSectionSlots; readonly calls: unknown[] } => {
    const calls: unknown[] = []
    const renderSlot: OverviewSectionSlots = (key, owner, opts) => {
      calls.push([key, owner, opts])
      return render(key)
    }
    return { renderSlot, calls }
  }

  it('键改引单源（裁决 5）：概览 tab kind = lib-ui DSWF_OVERVIEW_TAB_KEY 同源镜像（包内字面量退役）', () => {
    expect(DSWF_OVERVIEW_TAB_KIND).toBe(DSWF_OVERVIEW_TAB_KEY)
    expect(DSWF_OVERVIEW_TAB_KEY).toBe('dswf-overview')
  })

  it('子槽声明表在座（宿主单点声明缝——knowledge-dir 单槽）', () => {
    expect(OVERVIEW_SECTIONS_CHILDREN[KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT]).toEqual({ kind: 'keyed', scope: 'root' })
    expect(OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY).toBe('dswf-knowledge-dir')
  })

  it('renderSlot 在场：knowledge-dir 槽名 + keyed 占用键逐字分发（entryKey = dswf-knowledge-dir），节渲染于概览主体之后', () => {
    const { renderSlot, calls } = renderSlotFixture((key) =>
      key === KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT ? <div data-kd-section="y" /> : null,
    )
    const markup = renderToStaticMarkup(<ForgeOverviewSectionHost makeClient={pendingClient} renderSlot={renderSlot} />)
    expect(calls).toContainEqual(['project.section.knowledge-dir', {}, { entryKey: OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY }])
    expect(OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY).toBe('dswf-knowledge-dir')
    expect(markup).toContain('data-kd-section="y"')
    expect(markup).toContain('data-dswf-ov-unanchored')
    expect(markup.indexOf('data-dswf-ov-unanchored')).toBeLessThan(markup.indexOf('data-kd-section'))
  })

  it('AC 进度子槽退役：renderSlot 仅分发 knowledge-dir 单槽，概览主体零 AC 段', () => {
    const { renderSlot, calls } = renderSlotFixture(() => null)
    const markup = renderToStaticMarkup(<ForgeOverviewSectionHost makeClient={pendingClient} renderSlot={renderSlot} />)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(['project.section.knowledge-dir', {}, { entryKey: OVERVIEW_KNOWLEDGE_DIR_ENTRY_KEY }])
    expect(markup).toContain('data-dswf-ov-unanchored')
    expect(markup).not.toContain('data-ac-progress-section')
  })

  it('renderSlot 缺席（宿主形状漂移/SSR 面）= 概览主体照常呈现、双子槽零节渲染不炸', () => {
    const markup = renderToStaticMarkup(<ForgeOverviewSectionHost makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-ov-unanchored')
    expect(markup).not.toContain('data-kd-section')
    expect(markup).not.toContain('data-ac-progress-section')
  })

  it('槽 roster 空（renderSlot 返回 null）= 零节呈现不悬空', () => {
    const { renderSlot } = renderSlotFixture(() => null)
    const markup = renderToStaticMarkup(<ForgeOverviewSectionHost makeClient={pendingClient} renderSlot={renderSlot} />)
    expect(markup).toContain('data-dswf-ov-unanchored')
    expect(markup).not.toContain('data-kd-section')
    expect(markup).not.toContain('data-ac-progress-section')
  })
})

describe('OverviewDockAssembly 概览装配体全相位（D23 后：弹窗/对话框退役于本装配体——迁 ShellHost）', () => {
  const base = {
    onOpenTask: vi.fn(),
    onOpenTransition: vi.fn(),
    makeClient: pendingClient,
  }

  it('无锚（projectId null）= 诚实空态（不猜首个——多项目无会话同文案）；不渲染概览主体', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly {...base} projectId={null} drawerTaskId={null} />,
    )
    expect(markup).toContain('data-dswf-ov-unanchored')
    expect(markup).toContain('未锚定项目')
    expect(markup).not.toContain('data-dswf-ov-panel')
  })

  it('有锚 = 概览主体（ov-panel + 三子 tab 帧在位）呈现——骨架相位（SSR 零 effect；renderTasksTab 槽随任务子 tab 激活装载）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly {...base} projectId="p1" sessionCount={3} drawerTaskId={null} />,
    )
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).toContain('data-dswf-ov-subtab="tasks"') // 任务子 tab 在位（三视图装载入口）
    expect(markup).not.toContain('data-dswf-ov-unanchored')
  })

  it('弹窗开（drawerTaskId 在场）= 行高亮源注入 + 弹窗壳零挂载（m3.1 D23：本体迁 ShellHost——装配体仅递达 activeTaskId）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly {...base} projectId="p1" drawerTaskId="t-1" />,
    )
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).not.toContain('data-dswf-td-drawer') // 弹窗退役于 dock 装配体（挂载独立断言归 ShellHost.test/e2e）
    expect(markup).not.toContain('data-dswf-td-close')
  })
})

describe('ForgeOverviewTab 概览 tab body（keyed 占用者）', () => {
  it('桥订阅读锚定上下文：ShellHost 写回 → 概览主体可见（真桥直驱）', () => {
    const bridge = freshBridge()
    bridge.setOverviewContext({ projectId: 'p-anchored', workspaceId: 'w-1', sessionCount: 2 })
    const markup = renderToStaticMarkup(<ForgeOverviewTab bridge={bridge} makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).not.toContain('data-dswf-ov-unanchored')
  })

  it('桥缺席 / 无锚 = 空态降级（fail-soft——不炸 tab body）', () => {
    const markup = renderToStaticMarkup(<ForgeOverviewTab makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-ov-unanchored')
  })

  it('useTabInfo 缺席（2.8 已退役）与 sidebarRight 缺席（inject 缝缺席）= 概览主体照常呈现（文档行非交互降级）', () => {
    expect(renderToStaticMarkup(<ForgeOverviewTab makeClient={pendingClient} />)).toContain(
      'data-dswf-ov-unanchored',
    )
  })

  it('sidebarRight 注入缝在场不炸渲染（文档开出走具名服务缝——SSR 静态面）', () => {
    const sidebarRight: DockSidebarRightMirror = {
      openResource: () => {},
      mounted: { getSnapshot: () => 'sess-1' },
    }
    expect(() =>
      renderToStaticMarkup(<ForgeOverviewTab sidebarRight={sidebarRight} makeClient={pendingClient} />),
    ).not.toThrow()
  })
})

describe('桥概览上下文缝（与 workbench-bridge.test 互补——装配消费面）', () => {
  it('initialOverviewContext = 无锚缺省（桥刚创建——概览 tab 首读不猜）', () => {
    const bridge = freshBridge()
    expect(bridge.getSnapshot().overview).toEqual(initialOverviewContext())
  })
})

describe('任务聚焦消费（4.2 UF-3 流程 7 右栏半段——pill 点击 → 概览 + 抽屉全链路）', () => {
  it('nextTaskFocusApply 纯面：未应用 nonce → 应用；已应用/无聚焦 → null（重复点击 nonce 恒新恒应用）', () => {
    const focus = { taskId: 't-1', featureSlug: 'feat-a', nonce: 3 }
    expect(nextTaskFocusApply(-1, focus)).toBe(focus)
    expect(nextTaskFocusApply(3, focus)).toBeNull() // 已应用同 nonce
    expect(nextTaskFocusApply(3, { ...focus, nonce: 4 })).toEqual({ ...focus, nonce: 4 }) // 重复点击恒新
    expect(nextTaskFocusApply(-1, null)).toBeNull()
  })

  it('装配体聚焦注入（静态面）：挂载即带聚焦 = 任务子 tab 激活（OverviewTab 初始态直取 tasks）；弹窗开面归桥 drawerTaskId（ShellHost 消费）', () => {
    // SSR 零 effect → 容器选项源在途（tasks.list 未归）——聚焦静态可观测面 =
    // 初始子 tab = tasks（renderTasksTab 装载 = 骨架在场面：容器装载中不谎报真空空态）；
    // 弹窗壳挂载断言迁 ShellHost.test
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly
        {...{
          onOpenTask: vi.fn(),
          onOpenTransition: vi.fn(),
          makeClient: pendingClient,
        }}
        projectId="p1"
        drawerTaskId="t-42"
        taskFocus={{ taskId: 't-42', featureSlug: 'feat-focused', nonce: 1 }}
      />,
    )
    expect(markup).toContain('aria-selected="true" class="dswf-ov-subtab is-active" data-dswf-ov-subtab="tasks"') // 聚焦 → 任务子 tab
    expect(markup).toContain('data-dswf-tt-skeleton') // renderTasksTab 装载在场面（容器选项源装载骨架——SSR 零 effect）
    expect(markup).not.toContain('暂无任务容器')
  })

  it('聚焦缺席 = 任务子 tab 缺省（门关后子 tab 仅 tasks/bugs 且缺省激活 tasks——114d71ba 用户裁定 2026-11-14；初始态不受扰动）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly
        {...{
          onOpenTask: vi.fn(),
          onOpenTransition: vi.fn(),
          makeClient: pendingClient,
        }}
        projectId="p1"
        drawerTaskId={null}
      />,
    )
    expect(markup).toContain('aria-selected="true" class="dswf-ov-subtab is-active" data-dswf-ov-subtab="tasks"')
    expect(markup).toContain('data-dswf-ov-subtab="spec"') // spec | 任务 | Bug 有序三枚（spec 锚在调）
  })

  it('桥聚焦/弹窗/转移三缝直驱（ForgeOverviewTab 面桥缝）：写回 → 快照递达面在场（effect 应用归 e2e——renderToStaticMarkup 零 effect 同全仓口径）', () => {
    const bridge = freshBridge()
    bridge.setOverviewContext({ projectId: 'p-anchored', workspaceId: 'w-1' })
    bridge.openTaskFocus({ taskId: 't-9', featureSlug: 'feat-9' })
    bridge.openTaskDrawer('t-9')
    bridge.openTaskTransition({ taskId: 't-9' })
    expect(bridge.getSnapshot().taskFocus).toEqual({ taskId: 't-9', featureSlug: 'feat-9', nonce: 1 })
    expect(bridge.getSnapshot().drawerTaskId).toBe('t-9') // 弹窗受控态（ShellHost 消费面）
    expect(bridge.getSnapshot().transitionFocus).toEqual({ taskId: 't-9', featureSlug: '', nonce: 1 }) // ⋯ 转移跨树通道
    expect(bridge.getSnapshot().overview).toEqual({ projectId: 'p-anchored', workspaceId: 'w-1' }) // 三缝独立互不扰动
    // 概览 body 挂载不炸（taskFocus 经桥订阅递达——消费 effect 归 5.2 e2e）
    expect(() =>
      renderToStaticMarkup(<ForgeOverviewTab bridge={bridge} makeClient={pendingClient} />),
    ).not.toThrow()
  })

  it('转移预设透传（fix-transition-dialog-preset）：桥缝带 toStatus → 快照递达；TransitionTarget.presetToStatus 直喂对话框 → select 初值 = 预设（非首项）', () => {
    // 桥缝：⋯ 菜单预设态透传（toStatus 在场 = 递达；缺席 = 形状不变——抽屉径回归口径）
    const bridge = freshBridge()
    bridge.openTaskTransition({ taskId: 't-9', toStatus: 'completed' })
    expect(bridge.getSnapshot().transitionFocus).toEqual({
      taskId: 't-9', featureSlug: '', nonce: 1, toStatus: 'completed',
    })
    // TransitionTarget（ShellHost 构造形）带 presetToStatus 直喂 TransitionDialog → 静态渲染初选 = 预设
    const target: TransitionTarget = {
      task: detailFixture({ taskStatus: 'pending', allowedTransitions: ['in_progress', 'completed'] }),
      allowedTransitions: ['in_progress', 'completed'],
      presetToStatus: 'completed',
    }
    const html = renderToStaticMarkup(
      createElement(TransitionDialog, {
        projectId: 'p-1',
        task: target.task,
        allowedTransitions: target.allowedTransitions,
        presetToStatus: target.presetToStatus,
        onCancel: NOOP,
        onDone: NOOP,
        makeClient: pendingClient,
      }),
    )
    expect(html).toContain('data-dswf-td-tr-to')
    const preset = html.match(/<option[^>]*value="completed"[^>]*>/)?.[0] ?? ''
    expect(preset).toContain('selected') // 初值 = 预设（非允许集首项 in_progress）
    const first = html.match(/<option[^>]*value="in_progress"[^>]*>/)?.[0] ?? ''
    expect(first).not.toContain('selected')
  })
})
