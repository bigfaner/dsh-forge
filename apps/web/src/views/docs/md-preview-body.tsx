// md 预览扩展渲染器 body（定位：业务——官方文档预览器 md 渲染缝的 mermaid 扩展面）。
// 官方 ui-sidebar-documentpreview 内建 Markdown 渲染器零 mermaid 能力；本件经官方扩展注册面
// （documentPreviews.register extension 带 + sidebar.right.tab.document keyed body，注册归
// client-plugin/plugin.ts）叠加第二实现——extension 带恒胜 builtin，官方内建留在
// 下拉可切回（选择态官方自持，产品不自管）。
// 渲染核心复用文档 tab 分段管线：md 段经 MarkdownDoc（官方渲染器唯一径）、mermaid 段经
// MermaidDiagram（懒加载/strict/失败回退全既有——本件零 mermaid 引擎引用，Hard Rule：
// 禁静态 import mermaid，动态 import 唯一径 = mermaid-diagram.tsx）。分页 = 官方 owner 递达
// 的累计前缀（loading: 'text-pages'），props 变化自然重渲；未闭合 fence 归正文（分段器既有
// 已测语义），页补齐后自动成图。不认领 scrollport（共享 body 保持滚动所有者，同内建）。
// 图片解析对齐内建 MarkdownBody 口径（官方 path-images 纯函数结构同型镜像——禁 import 官方
// documentpreview 包）：useResource(tab.contentId) 元数据 absolutePath → 相对目的地并入文档
// 目录 → 认证 /api/file 路由；HTTP(S)/data 保持原 URL、query/fragment 剔除、URL escape 解码
// 一次、目的地畸形 = undefined（inert alt text）；元数据未达不猜（undefined）。
// 分层：路径解析/词表工厂 = 可测纯函数面（Node 池）；组件 = 纯呈现（可选钩子经子件无条件
// 调用——fix-33 ⑤ 形制）；effect 胶水（mermaid 懒加载渲染相位）不属本件不属单测面。
import { useMemo, type ReactNode } from 'react'
import type { MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'
import { MarkdownDoc } from '../../components/index.js'
import { splitDocSegments } from './doc-segments.js'
import { MermaidDiagram } from './mermaid-diagram.js'
import './docs.css'

/** 官方文档内容判别（documentpreview contract 消费切片——本件只渲染 text 相位，他相位 null） */
export type MdPreviewContent =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes' }
  | { readonly kind: 'renderer' }

/** 官方 document body owner 消费切片（sidebar.right.tab.document keyed slot owner——结构同型窄面） */
export interface MdPreviewOwnerProps {
  /** 根文件资源地址（= 标准 useResource 钩子的读取键） */
  readonly resourceAddress: string
  /** 官方共享读的内容载荷（text-pages = 累计前缀含分页前缀；bytes/renderer = 渲染 null） */
  readonly content: MdPreviewContent
  /** 文档工具栏换行偏好（本实现声明消费——wrap=false = 容器 nowrap 族） */
  readonly wrap: boolean
  /** 滚动位申报回调（本件不认领——零调用，同内建 Markdown） */
  readonly scrollportRef: (element: HTMLElement | null) => void
  /** 观察本渲染器读的文件（官方 ResourceGroup 面——图片依赖官方自持，本件零调用） */
  readonly addResource: (address: string) => void
  /** 替换本渲染器依赖集（同上——零调用） */
  readonly setResources: (addresses: readonly string[]) => void
}

/** 官方 tab 记录消费切片（UseSidebarRightTabInfo 窄面——本件只读 contentId） */
export interface MdPreviewTabRecord {
  readonly contentId: string
}

/** useTabInfo 钩子窄面（seat inject `{hooks:{tabInfo}}` 递达物） */
export type UseMdPreviewTabInfo = () => { readonly tab: MdPreviewTabRecord }

/** useResource 元数据切片（WorkspaceFileStat 窄面——图片解析只读 absolutePath） */
export interface MdPreviewFileMeta {
  readonly absolutePath?: string | undefined
}

/** useResource 标准钩子窄面（官方 file provider——缺席 = 图片保持 inert） */
export type UseMdPreviewResource = (address: string) => { readonly value?: MdPreviewFileMeta | undefined }

/** Windows 盘符前缀（官方 isWindowsStylePath 镜像面之一——UNC 双反斜杠另行判定） */
const WINDOWS_DRIVE = /^[a-z]:[/\\]/iu

/** Windows 盘符/UNC 前缀判定（官方 isWindowsStylePath 结构同型镜像） */
function isWindowsStylePath(value: string): boolean {
  return WINDOWS_DRIVE.test(value) || value.startsWith('\\\\')
}

/** 工作区绝对路径（POSIX `/` 或 Windows 盘符/UNC——官方 isAbsoluteWorkspacePath 同型镜像） */
function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith('/') || isWindowsStylePath(path)
}

/** 文档目录段（官方 pathPartsOf().directory 同型镜像——`/` `\` 双分隔，尾分隔符保留） */
function directoryOf(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed === '') return ''
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1
  return trimmed.slice(0, cut)
}

/**
 * 认证文件路由 URL（官方 fileMediaUrl 结构同型镜像）：base 限 HTTP(S) 应用面（含部署
 * 前缀）或 `dsh-app://app/`（Desktop）；path 限工作区绝对路径；路径控制字符/双开头分隔
 * 拒绝——他形 = undefined（inert）。
 */
function fileMediaUrl(base: string, path: string): string | undefined {
  if (
    (!/^https?:/u.test(base) && !base.startsWith('dsh-app://app/')) ||
    !isAbsoluteWorkspacePath(path) ||
    /^[/\\]{2}/u.test(path) ||
    hasControlChar(path)
  ) {
    return undefined
  }
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href
}

/** 路径控制字符（C0 + DEL——官方 fileMediaUrl 控制字符拒绝面的显式扫描形） */
function hasControlChar(path: string): boolean {
  for (const ch of path) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/**
 * Markdown 图片目的地 → 展示 URL（官方 markdownImageUrl 结构同型镜像——逐 prop 口径对齐）：
 * query/fragment 非文件名成分先剔除；URL escape 解码一次（畸形 = undefined）；空目的地
 * = undefined；外部协议目的地（HTTP(S)/data 等——非盘符而带 scheme）保持原 URL 不改写；
 * 相对目的地并入文档目录（absolutePath 未报 = undefined，不猜）；最终经认证文件路由。
 */
export function mdPreviewImageUrl(
  base: string,
  documentPath: string | undefined,
  destination: string,
): string | undefined {
  const suffix = destination.search(/[?#]/u)
  let path: string
  try {
    path = decodeURIComponent(suffix === -1 ? destination : destination.slice(0, suffix))
  } catch {
    return undefined
  }
  if (path.length === 0) return undefined
  if (!WINDOWS_DRIVE.test(path) && /^[a-z][a-z\d+.-]*:/iu.test(path)) return undefined
  if (!isAbsoluteWorkspacePath(path)) {
    if (documentPath === undefined) return undefined
    path = directoryOf(documentPath) + path
  }
  return fileMediaUrl(base, path)
}

/** 本地图片词表工厂（官方 MarkdownBody pathImages memo 同型——resolve 闭包绑定 base + absolutePath） */
export function mdPreviewPathImages(base: string, documentPath: string | undefined): MarkdownPathImages {
  return {
    resolve: (value: string): string | undefined => mdPreviewImageUrl(base, documentPath, value),
  }
}

export interface MdPreviewBodyProps extends MdPreviewOwnerProps {
  /** 官方 tabInfo 钩子（seat inject 恒递达；缺席 = 非壳载体降级——图片保持 inert） */
  readonly useTabInfo?: UseMdPreviewTabInfo
  /** 官方 useResource 标准钩子（缺席 = 同上降级） */
  readonly useResource?: UseMdPreviewResource
}

/** 钩子解出子件（fix-33 ⑤ 形制——可选钩子经子件无条件调用；contentId 元数据 → absolutePath） */
function MdPreviewInfoReader({
  useTabInfo,
  useResource,
  children,
}: {
  readonly useTabInfo: UseMdPreviewTabInfo
  readonly useResource: UseMdPreviewResource
  readonly children: (absolutePath: string | undefined) => ReactNode
}): ReactNode {
  const { tab } = useTabInfo()
  const meta = useResource(tab.contentId)
  return children(meta?.value?.absolutePath)
}

/**
 * 正文视图（纯呈现）：非 text 相位渲染 null；图片词表随 absolutePath 记忆化（官方
 * MarkdownBody 同径——baseURI Node/SSR 缺席 = ''，词表 inert）；wrap=false 追加 nowrap 族。
 */
function MdPreviewBodyView({
  content,
  wrap,
  absolutePath,
}: MdPreviewOwnerProps & { readonly absolutePath: string | undefined }): ReactNode {
  const baseURI = typeof document === 'undefined' ? undefined : document.baseURI
  const pathImages = useMemo(
    () => mdPreviewPathImages(baseURI ?? '', absolutePath),
    [baseURI, absolutePath],
  )
  if (content.kind !== 'text') return null
  const segments = splitDocSegments(content.text)
  return (
    <div
      className={wrap ? 'dswf-doc-body' : 'dswf-doc-body dswf-mdp-nowrap'}
      data-dswf-md-preview-body=""
    >
      {segments.map((segment, i) =>
        segment.kind === 'md' ? (
          <MarkdownDoc key={i} text={segment.text} variant="body" pathImages={pathImages} />
        ) : (
          <MermaidDiagram key={i} source={segment.source} />
        ),
      )}
    </div>
  )
}

/**
 * md 预览 body（`sidebar.right.tab.document` keyed 'dswf-md-mermaid' 占用者——product-views
 * 发布件）：tabInfo/useResource 钩子（生产面 seat/standard 恒递达）解出 absolutePath →
 * 分段渲染。钩子缺席（非壳载体/单测）= 降级渲染照常（图片词表 inert）。
 */
export function MdPreviewBody({ useTabInfo, useResource, ...owner }: MdPreviewBodyProps): ReactNode {
  if (useTabInfo === undefined || useResource === undefined) {
    return <MdPreviewBodyView {...owner} absolutePath={undefined} />
  }
  return (
    <MdPreviewInfoReader useTabInfo={useTabInfo} useResource={useResource}>
      {(absolutePath) => <MdPreviewBodyView {...owner} absolutePath={absolutePath} />}
    </MdPreviewInfoReader>
  )
}
