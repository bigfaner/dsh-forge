// 文档 tab 单测 —— AC1/AC4/AC5：tab 内容结构（头部 + 路径栏[canonical + 📁 + ↻] +
// 摘要 + md/mermaid 分段渲染）、零 mermaid 块零挂载（懒加载前提）、悬空只读占位面
// （路径栏保留不崩溃）、装载/落点纯函数 + docs.read 通道面 + openExternal 触发即忘。
// 口径沿 overview 先例：effect 胶水不在 Node 测面（renderToStaticMarkup 不跑 effect）；
// 纯异步面与纯函数全量单测；DocsTab 静态首装面断言骨架形态。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { DocContent } from '@dsh-forge/contracts'
import { DOCS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeRpcClient, type ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import {
  applyDocFetch,
  DocBody,
  docTitle,
  DocsFrame,
  DocsTab,
  fetchDocContent,
  initialDocViewState,
  mapDocsError,
  openDocExternal,
  pendingDocView,
} from './index.js'

const READY_DOC: DocContent = {
  title: 'M2 技术设计',
  summary: '每工作区库 + 概览/文档 tab',
  content: ['# Tech Design', '', '前置段落。', '', '```mermaid', 'erDiagram', '    PROPOSALS ||--o{ FEATURES : "proposal_id"', '```', '', '收尾段落。'].join('\n'),
  canonicalPath: 'Z:/ws/demo/docs/features/m2/design/tech-design.md',
  dangling: false,
}

const PLAIN_DOC: DocContent = {
  content: '# 纯文\n\n零 mermaid 块。',
  canonicalPath: 'Z:/ws/demo/docs/plain.md',
  dangling: false,
}

const DANGLING_DOC: DocContent = {
  content: '',
  canonicalPath: 'docs/features/gone/proposal.md',
  dangling: true,
}

function render(node: ReactNode): string {
  return renderToStaticMarkup(node) as unknown as string
}

/** 通道 responder 替身（捕获通道 + 请求负载——docs.read/openExternal 调用断言面） */
function clientResponding(
  respond: (channel: string, payload: unknown) => unknown | Promise<unknown>,
): { readonly client: ForgeRpcClient; readonly calls: readonly { readonly channel: string; readonly payload: unknown }[] } {
  const calls: { channel: string; payload: unknown }[] = []
  const client = createForgeRpcClient(async (channel, payload) => {
    calls.push({ channel, payload })
    const data = await respond(channel, payload)
    return { ok: true, data }
  })
  return { client, calls }
}

const baseFrame = {
  projectId: 'p-1',
  docRel: 'docs/features/m2/design/tech-design.md',
  error: undefined,
  onReread: () => {},
  onOpenExternal: () => {},
}

describe('docTitle / mapDocsError（纯函数）', () => {
  it('标题：doc.title 在场用之；缺席 = docRel 末段文件名', () => {
    expect(docTitle(READY_DOC, 'a/b.md')).toBe('M2 技术设计')
    expect(docTitle(PLAIN_DOC, 'docs/features/m2/design/tech-design.md')).toBe('tech-design.md')
  })

  it('错误归一：RpcClientError → code 三态映射；其余 → 错误条', () => {
    expect(mapDocsError(new RpcClientError({ code: 'ERR_DOC_PATH_INVALID', message: '路径越界' }))).toEqual({
      message: '路径越界',
      uiState: 'error-bar',
    })
    expect(mapDocsError(new Error('传输失败'))).toEqual({ message: '传输失败', uiState: 'error-bar' })
    expect(mapDocsError('字符串错误')).toEqual({ message: '字符串错误', uiState: 'error-bar' })
  })
})

describe('fetchDocContent / openDocExternal（docs.read 唯一消费径 + 触发即忘）', () => {
  it('read：{projectId, docRel} 原样入通道，DocContent 原样返回（悬空 = ok 态数据非错误）', async () => {
    const { client, calls } = clientResponding((channel) => {
      if (channel === DOCS_CHANNELS.read) return READY_DOC
      throw new Error(`unexpected channel ${channel}`)
    })
    await expect(fetchDocContent(client, { projectId: 'p-1', docRel: 'docs/x.md' })).resolves.toEqual({ ok: true, data: READY_DOC })
    expect(calls[0]).toEqual({ channel: DOCS_CHANNELS.read, payload: { projectId: 'p-1', docRel: 'docs/x.md' } })
  })

  it('read 失败 → 归一 error（永不 reject）', async () => {
    const client = createForgeRpcClient(async () => ({
      ok: false,
      error: { code: 'ERR_DOC_PATH_INVALID', message: '路径越界' },
    }))
    await expect(fetchDocContent(client, { projectId: 'p-1', docRel: '../escape.md' })).resolves.toEqual({
      ok: false,
      error: { message: '路径越界', uiState: 'error-bar' },
    })
  })

  it('openExternal：触发即忘——成功静默；通道失败吞错不外溢（悬空/路径失效同路）', async () => {
    const ok = clientResponding(() => undefined)
    await expect(openDocExternal(ok.client, { projectId: 'p-1', docRel: 'docs/x.md' })).resolves.toBeUndefined()
    expect(ok.calls[0]?.channel).toBe(DOCS_CHANNELS.openExternal)
    const failing = createForgeRpcClient(async () => ({
      ok: false,
      error: { code: 'ERR_DOC_PATH_INVALID', message: '路径不在册' },
    }))
    await expect(openDocExternal(failing, { projectId: 'p-1', docRel: 'gone.md' })).resolves.toBeUndefined()
  })
})

describe('装载落点纯函数（pendingDocView / applyDocFetch）', () => {
  it('初始态 = loading + busy 骨架相位', () => {
    expect(initialDocViewState()).toEqual({ phase: 'loading', doc: undefined, busy: true, error: undefined })
  })

  it('在途：切换（清场）= 回骨架；重读 = 旧内容保持 + busy', () => {
    const prev = { ...initialDocViewState(), phase: 'ready' as const, doc: READY_DOC, busy: false }
    expect(pendingDocView(prev, true)).toEqual(initialDocViewState())
    expect(pendingDocView(prev, false)).toEqual({ ...prev, busy: true })
  })

  it('落点：成功 = ready 覆盖；失败有旧内容 = 旧内容 + 错误共现；失败无旧内容 = 错误相位', () => {
    const withOld = { ...initialDocViewState(), phase: 'ready' as const, doc: READY_DOC, busy: true }
    expect(applyDocFetch(withOld, { ok: true, data: PLAIN_DOC })).toEqual({
      phase: 'ready',
      doc: PLAIN_DOC,
      busy: false,
      error: undefined,
    })
    const failed: ReturnType<typeof mapDocsError> = { message: '网络断', uiState: 'error-bar' }
    expect(applyDocFetch(withOld, { ok: false, error: failed })).toEqual({
      phase: 'ready',
      doc: READY_DOC,
      busy: false,
      error: failed,
    })
    expect(applyDocFetch(initialDocViewState(), { ok: false, error: failed })).toEqual({
      ...initialDocViewState(),
      busy: false,
      error: failed,
      phase: 'error',
    })
  })
})

describe('DocsFrame（AC4 tab 内容结构）', () => {
  it('头部 + 路径栏（canonical + 📁/↻ 图标钮）+ 摘要 + md 段 MarkdownDoc + mermaid 段挂载占位', () => {
    const markup = render(<DocsFrame {...baseFrame} phase="ready" doc={READY_DOC} busy={false} />)
    expect(markup).toContain('data-dswf-doc-head')
    expect(markup).toContain('M2 技术设计') // doc.title
    expect(markup).toContain('只读') // 只读徽标
    expect(markup).toContain('data-dswf-doc-pathbar')
    expect(markup).toContain('Z:/ws/demo/docs/features/m2/design/tech-design.md') // canonical 路径
    expect(markup).toContain('aria-label="在编辑器中打开"')
    expect(markup).toContain('aria-label="重新读取"')
    expect(markup).toContain('data-dswf-doc-summary')
    expect(markup).toContain('每工作区库') // 摘要文本
    expect(markup).toContain('data-dswf-markdown') // md 段经 MarkdownDoc
    expect(markup).toContain('前置段落。')
    expect(markup).toContain('data-dswf-doc-mermaid-pending') // mermaid 段挂载（effect 后渲染）
  })

  it('零 mermaid 块 = 零挂载（无 mermaid 锚——懒加载零触发的前提）', () => {
    const markup = render(<DocsFrame {...baseFrame} phase="ready" doc={PLAIN_DOC} busy={false} />)
    expect(markup).toContain('data-dswf-markdown')
    expect(markup).not.toContain('data-dswf-doc-mermaid')
  })

  it('标题缺席 = docRel 末段文件名；摘要缺席 = 无摘要块', () => {
    const markup = render(<DocsFrame {...baseFrame} phase="ready" doc={PLAIN_DOC} busy={false} />)
    expect(markup).toContain('tech-design.md') // baseFrame.docRel 末段（doc.title 缺席回退）
    expect(markup).not.toContain('data-dswf-doc-summary')
  })

  it('首读在途 = 骨架；首读失败 = 错误条 + 重试（↻ 同径）', () => {
    const loading = render(<DocsFrame {...baseFrame} phase="loading" doc={undefined} busy />)
    expect(loading).toContain('data-dswf-doc-skeleton')
    const failed = render(
      <DocsFrame {...baseFrame} phase="error" doc={undefined} busy={false} error={{ message: '项目不存在', uiState: 'error-bar' }} />,
    )
    expect(failed).toContain('data-dswf-doc-error')
    expect(failed).toContain('文档装载失败：项目不存在')
    expect(failed).toContain('data-dswf-doc-retry')
  })

  it('重读失败有旧内容 = 错误条 + 旧正文共现（不掏空）', () => {
    const markup = render(
      <DocsFrame {...baseFrame} phase="ready" doc={READY_DOC} busy={false} error={{ message: '网络断', uiState: 'error-bar' }} />,
    )
    expect(markup).toContain('data-dswf-doc-error')
    expect(markup).toContain('重读失败：网络断')
    expect(markup).toContain('前置段落。') // 旧内容保持
  })
})

describe('DocsFrame（AC5 悬空只读占位面）', () => {
  it('悬空 = 路径栏保留 + 占位面 + 悬空徽标；不渲染正文不崩溃', () => {
    const markup = render(<DocsFrame {...baseFrame} phase="ready" doc={DANGLING_DOC} busy={false} />)
    expect(markup).toContain('data-dswf-doc-dangling')
    expect(markup).toContain('悬空') // 悬空徽标
    expect(markup).toContain('data-dswf-doc-pathbar')
    expect(markup).toContain('docs/features/gone/proposal.md') // canonicalPath = 库内 rel_path 原值
    expect(markup).toContain('aria-label="重新读取"') // ↻ 重读保留
    expect(markup).toContain('不崩溃、不写入、不删行') // 占位面文案
    expect(markup).not.toContain('data-dswf-doc-body')
    expect(markup).not.toContain('data-dswf-markdown')
  })
})

describe('DocBody（分段渲染）', () => {
  it('md 段与 mermaid 段按序交替渲染', () => {
    const markup = render(<DocBody content={READY_DOC.content} />)
    const mdAt = markup.indexOf('前置段落。')
    const mermaidAt = markup.indexOf('data-dswf-doc-mermaid')
    const tailAt = markup.indexOf('收尾段落。')
    expect(mdAt).toBeGreaterThan(-1)
    expect(mermaidAt).toBeGreaterThan(mdAt)
    expect(tailAt).toBeGreaterThan(mermaidAt)
  })
})

describe('DocsTab（状态 + 装载胶水——静态首装面）', () => {
  it('首装 = 骨架（effect 不跑——数据装载归纯函数单测与 e2e）', () => {
    const makeClient = vi.fn()
    const markup = render(<DocsTab projectId="p-1" docRel="docs/x.md" makeClient={makeClient as never} />)
    expect(markup).toContain('data-dswf-doc-panel')
    expect(markup).toContain('data-dswf-doc-skeleton')
    expect(makeClient).not.toHaveBeenCalled() // renderToStaticMarkup 不触发 effect——零 RPC 调用
  })
})
