// 文档 tab 体（定位：业务——UF-2：dock 文档 tab body）。分层同 overview 先例：
// DocsFrame = 纯呈现帧（结构静态可测）；DocsTab = 状态 + 装载胶水（docs.read 单发 +
// ↻ 重读 nonce + 竞态守卫）。tab 注册（multiple + docRel 去重）归 4.1——本组件接收
// docRel props；多文档并存 = 每文档一个 tab 实例，互不共享态。
// 内容结构（ui-design UF-2 / 原型 doc-tab）：头部（文件名 + 只读徽标 + 悬空徽标）→
// 路径栏（canonical 全路径 + 📁 在编辑器中打开 + ↻ 重读）→ 摘要块 → 正文分段渲染
// （md 段经 MarkdownDoc、mermaid 段经 MermaidDiagram 懒加载——零 mermaid 段零挂载）。
// 悬空（dangling=true，Interface 4 悬空容忍）= 只读占位面：路径栏保留、不崩溃、
// 不写入、不删行；↻ 重读照常（切回含文件分支后恢复）。
// 边界：禁 import ../session/ ../knowledge/ ../overview/（依赖铁律③ 同级业务互禁）；
// Markdown 渲染唯一经 MarkdownDoc；openExternal 触发即忘（失败吞——不炸 tab）。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { DocContent } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import { EmptyState, ErrorBar, MarkdownDoc, SkeletonRows, StateChip } from '../../components/index.js'
import { splitDocSegments } from './doc-segments.js'
import { MermaidDiagram } from './mermaid-diagram.js'
import './docs.css'

/** 错误附载（message = 信封 message 原样；uiState = rpcUiState(code) 三态映射） */
export interface DocsErrorInfo {
  readonly message: string
  readonly uiState: RpcUiStateKind
}

/** 读取结果（ok/error 归一——永不 reject） */
export type DocsFetch = { readonly ok: true; readonly data: DocContent } | { readonly ok: false; readonly error: DocsErrorInfo }

/** 错误归一（纯函数）：RpcClientError → code 三态映射；其余（传输/构造期）→ 错误条 */
export function mapDocsError(error: unknown): DocsErrorInfo {
  if (error instanceof RpcClientError) {
    return { message: error.message, uiState: rpcUiState(error.code) }
  }
  return { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' }
}

/** 文档读取（纯异步面——docs.read 唯一消费径；悬空 = ok 态数据非错误） */
export async function fetchDocContent(
  client: ForgeRpcClient,
  q: { readonly projectId: string; readonly docRel: string },
): Promise<DocsFetch> {
  try {
    return { ok: true, data: await client.docs.read(q) }
  } catch (error) {
    return { ok: false, error: mapDocsError(error) }
  }
}

/** 头部标题（doc.title 缺席 = docRel 末段文件名） */
export function docTitle(doc: DocContent, docRel: string): string {
  return doc.title !== undefined && doc.title !== '' ? doc.title : (docRel.split('/').pop() ?? docRel)
}

/** 📁 在编辑器中打开（纯动作——触发即忘：失败吞不炸 tab，悬空/路径失效同路静默） */
export async function openDocExternal(client: ForgeRpcClient, q: { readonly projectId: string; readonly docRel: string }): Promise<void> {
  try {
    await client.docs.openExternal(q)
  } catch {
    // 触发即忘（rpc 面口径）——不外溢
  }
}

/** tab 装载态（hook 输出——DocsTab 消费形状） */
export interface DocViewState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly doc: DocContent | undefined
  /** 重读在途（旧内容保持可见的不阻塞标注） */
  readonly busy: boolean
  readonly error: DocsErrorInfo | undefined
}

/** 初始态（首读前：骨架相位） */
export function initialDocViewState(): DocViewState {
  return { phase: 'loading', doc: undefined, busy: true, error: undefined }
}

/** 读取在途落点（纯函数）：切换（projectId/docRel 变）= 清场骨架；重读 = 旧内容 + busy */
export function pendingDocView(prev: DocViewState, mustClear: boolean): DocViewState {
  return mustClear ? initialDocViewState() : { ...prev, busy: true }
}

/** 读取落点（纯函数）：成功 = ready 覆盖；失败保留旧内容（有旧内容 = 错误条同现，无 = 错误相位） */
export function applyDocFetch(prev: DocViewState, out: DocsFetch): DocViewState {
  if (!out.ok) {
    return { ...prev, busy: false, error: out.error, phase: prev.doc === undefined ? 'error' : prev.phase }
  }
  return { phase: 'ready', doc: out.data, busy: false, error: undefined }
}

export interface DocsFrameProps {
  readonly projectId: string
  readonly docRel: string
  readonly phase: 'loading' | 'ready' | 'error'
  readonly doc: DocContent | undefined
  readonly busy: boolean
  readonly error: DocsErrorInfo | undefined
  /** ↻ 重读（读取失败重试同钮） */
  readonly onReread: () => void
  /** 📁 在编辑器中打开（openExternal 触发即忘） */
  readonly onOpenExternal: () => void
}

/** 正文分段渲染（md 段 MarkdownDoc / mermaid 段 MermaidDiagram——零 mermaid 段零挂载） */
export function DocBody({ content }: { readonly content: string }): ReactNode {
  const segments = splitDocSegments(content)
  return (
    <div className="dswf-doc-body" data-dswf-doc-body="">
      {segments.map((segment, i) =>
        segment.kind === 'md' ? (
          <MarkdownDoc key={i} text={segment.text} variant="body" />
        ) : (
          <MermaidDiagram key={i} source={segment.source} />
        ),
      )}
    </div>
  )
}

/** 文档 tab 纯呈现帧（结构静态可测——头部/路径栏/摘要/正文/悬空面/骨架/错误条分派） */
export function DocsFrame({ projectId, docRel, phase, doc, busy, error, onReread, onOpenExternal }: DocsFrameProps): ReactNode {
  const title = doc !== undefined ? docTitle(doc, docRel) : (docRel.split('/').pop() ?? docRel)

  if (doc === undefined) {
    // 首读在途 = 骨架；首读失败 = 错误条 + 重试（↻ 同径）
    return (
      <div className="dswf-doc-panel" data-dswf-doc-panel="" data-dswf-doc-key={`${projectId}#${docRel}`}>
        {phase === 'error' ? (
          <ErrorBar
            className="dswf-doc-error"
            message={`文档装载失败：${error?.message ?? ''}`}
            retryClassName="dswf-doc-retry"
            onRetry={onReread}
            anchor="data-dswf-doc-error"
            retryAnchor="data-dswf-doc-retry"
          />
        ) : (
          <SkeletonRows className="dswf-doc-skeleton" rowClassName="dswf-doc-skeleton-row" rows={6} anchor="data-dswf-doc-skeleton" />
        )}
      </div>
    )
  }

  const head = (
    <div className="dswf-doc-head" data-dswf-doc-head="">
      <span className="dswf-doc-title" title={title}>
        {title}
      </span>
      <StateChip status="只读" className="dswf-doc-chip" />
      {doc.dangling ? <StateChip status="悬空" className="dswf-doc-chip dswf-doc-chip-dangling" /> : null}
    </div>
  )
  const pathbar = (
    <div className="dswf-doc-pathbar" data-dswf-doc-pathbar="">
      <span className="dswf-doc-path" title={doc.canonicalPath}>
        {doc.canonicalPath}
      </span>
      <button
        type="button"
        className="dswf-doc-iconbtn"
        aria-label="在编辑器中打开"
        title="在编辑器中打开（系统关联 · 应用零写入）"
        onClick={onOpenExternal}
      >
        📁
      </button>
      <button type="button" className="dswf-doc-iconbtn" aria-label="重新读取" title="重新读取（只读）" onClick={onReread}>
        ↻
      </button>
    </div>
  )

  if (doc.dangling) {
    // 悬空 = 只读占位面（路径栏保留；不崩溃、不写入、不删行——SC-branch 容错）
    return (
      <div className="dswf-doc-panel" data-dswf-doc-panel="" data-dswf-doc-key={`${projectId}#${docRel}`} data-dswf-doc-dangling="">
        {error !== undefined ? (
          <ErrorBar className="dswf-doc-error" message={`重读失败：${error.message}`} retryClassName="dswf-doc-retry" onRetry={onReread} anchor="data-dswf-doc-error" retryAnchor="data-dswf-doc-retry" />
        ) : null}
        {head}
        {pathbar}
        <EmptyState
          className="dswf-doc-dangling"
          title="文档引用悬空"
          description="文件不在当前分支或已被移动——只读缺省渲染，不崩溃、不写入、不删行；切回含此文件的分支后 ↻ 重读即可。"
        />
      </div>
    )
  }

  return (
    <div className="dswf-doc-panel" data-dswf-doc-panel="" data-dswf-doc-key={`${projectId}#${docRel}`} aria-busy={busy}>
      {error !== undefined ? (
        <ErrorBar className="dswf-doc-error" message={`重读失败：${error.message}`} retryClassName="dswf-doc-retry" onRetry={onReread} anchor="data-dswf-doc-error" retryAnchor="data-dswf-doc-retry" />
      ) : null}
      {head}
      {pathbar}
      {doc.summary !== undefined && doc.summary !== '' ? (
        <p className="dswf-doc-summary" data-dswf-doc-summary="">
          {doc.summary}
        </p>
      ) : null}
      <DocBody content={doc.content} />
    </div>
  )
}

export interface DocsTabProps {
  /** 当前项目（4.1 ShellHost 锚定注入——knowledge-anchor 裁决同源） */
  readonly projectId: string
  /** 文档相对键（feature_documents ∪ proposals 的 rel_path；tab 去重键——4.1 dock 注册面） */
  readonly docRel: string
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/** 文档 tab body（状态 + 装载胶水——docs.read 单发 + ↻ 重读 nonce + seq 竞态守卫） */
export function DocsTab({ projectId, docRel, makeClient = preloadRpcClientFactory }: DocsTabProps): ReactNode {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<DocViewState>(initialDocViewState)
  const seqRef = useRef(0)
  const lastKeyRef = useRef('')

  useEffect(() => {
    const key = `${projectId}#${docRel}`
    const mustClear = lastKeyRef.current !== key
    lastKeyRef.current = key
    const seq = ++seqRef.current
    setState((prev) => pendingDocView(prev, mustClear))
    const client = makeClient()
    void fetchDocContent(client, { projectId, docRel }).then((out) => {
      if (seq !== seqRef.current) return
      setState((prev) => applyDocFetch(prev, out))
    })
  }, [projectId, docRel, nonce, makeClient])

  const handleReread = useCallback((): void => {
    setNonce((n) => n + 1)
  }, [])
  const handleOpenExternal = useCallback((): void => {
    void openDocExternal(makeClient(), { projectId, docRel })
  }, [projectId, docRel, makeClient])

  return (
    <DocsFrame
      projectId={projectId}
      docRel={docRel}
      phase={state.phase}
      doc={state.doc}
      busy={state.busy}
      error={state.error}
      onReread={handleReread}
      onOpenExternal={handleOpenExternal}
    />
  )
}
