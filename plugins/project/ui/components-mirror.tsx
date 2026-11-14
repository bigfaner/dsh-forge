// project 侧 components-mirror 镜像副本（knowledge-plugin-migration 1.4 子提交 a）：
// 正本随 knowledge 28 件 git mv 迁 plugins/knowledge/ui/（子提交 b）；本副本供 project 域
// 既有消费面（dock-tabs/docs/index.tsx MarkdownDoc 渲染链）——跨 bundle 不可 import，
// 镜像同步 pin = plugins/knowledge/ui/mirrors-pin.test.ts（export 形状/内容 hash 对账）。
// 领域无关小件随迁副本（自 apps/web/src/components 复制——MarkdownDoc.tsx / icons.tsx /
// time-label.ts 三件被用面）：plugins/project/ui/components.tsx 已镜像 ErrorBar /
// SkeletonRows / StateChip / EmptyState 四件（消费面改引 '../components.js'），本件只
// 补四件之外 knowledge 族消费的三面：MarkdownDoc 渲染唯一包装入口 + 自绘火焰图标 +
// 相对时间标签。
import { MarkdownText, type MarkdownLabels, type MarkdownPathImages, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'

// ───────────────── MarkdownDoc.tsx 复制 ─────────────────

/** 包装形态（官方 MarkdownText 原生 variant 面，不扩形态） */
export type MarkdownDocVariant = 'body' | 'compact'

/** 默认 labels（模块级冻结常量——引用稳定；文案随产品中文面） */
export const DEFAULT_MARKDOWN_LABELS: MarkdownLabels = Object.freeze({
  code: Object.freeze({ copyLabel: '复制', copiedLabel: '已复制' }),
  footnotes: '脚注',
}) as MarkdownLabels

/**
 * 文档正文 labels（模块级冻结常量——引用稳定纪律同 DEFAULT_MARKDOWN_LABELS，新身份会废弃
 * 流式渲染缓存）：官方 MarkdownBody 同形（client.js L1557-1581——code.toolbarLabels 递达 =
 * 代码块升级官方 CodeToolbar：语言名 + 块级 wrap + 复制；文案 = 产品中文面，复制/脚注沿
 * DEFAULT_MARKDOWN_LABELS 单源展开）。
 */
export const MD_PREVIEW_MARKDOWN_LABELS: MarkdownLabels = Object.freeze({
  code: Object.freeze({
    ...DEFAULT_MARKDOWN_LABELS.code,
    toolbarLabels: Object.freeze({ codeLabel: '代码', wrapLabel: '换行', unwrapLabel: '不换行' }),
  }),
  footnotes: DEFAULT_MARKDOWN_LABELS.footnotes,
}) as MarkdownLabels

const FRONTMATTER_OPEN = /^---\r?\n/
const FRONTMATTER_CLOSE = /^(?:---|\.\.\.)\r?$/

/**
 * 剥离开头的 YAML frontmatter 块（`---` 开 + `---`/`...` 闭，gray-matter 同型），返回余下正文。
 * 未闭合 fence（无收尾行）视为正文主题分割线，原样返回——不吞正文。
 */
export function stripMarkdownFrontmatter(text: string): string {
  if (!FRONTMATTER_OPEN.test(text)) return text
  const lines = text.split('\n')
  // lines[0] = 开 fence；找收尾 fence（跳过首行，允许空 frontmatter 块）
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (FRONTMATTER_CLOSE.test(line)) {
      return lines.slice(i + 1).join('\n').replace(/^\r?\n/, '')
    }
  }
  return text
}

export interface MarkdownDocProps {
  /** Markdown 源文本（可含开头 frontmatter 块——包装内剥离，正文不含元数据字段） */
  readonly text: string
  /** 渲染形态：body（默认，正文排版）/ compact（紧凑，M4 嵌入预览预留） */
  readonly variant?: MarkdownDocVariant
  /** 布局类名（透传包装节点；间距与排版刻度归消费方/官方令牌） */
  readonly className?: string
  /**
   * 本地图片词表（官方 MarkdownText 原生 pathImages 面——类型 re-export 自
   * dsh-client-ui-primitives）：所有方把未能过远程 URL 白名单的本地目的地映射到可展示
   * URL。缺省 undefined = 现行为零变化（既有用例不动）。
   */
  readonly pathImages?: MarkdownPathImages
  /**
   * 文档 chrome 文案（官方 MarkdownText 原生 labels 面——code.toolbarLabels 在场 =
   * 代码块升级官方 CodeToolbar[语言名 + 块级 wrap + 复制]）。缺省 = DEFAULT_MARKDOWN_LABELS
   * （现行为零变化）。引用稳定要求同官方：逐 locale 修订记忆化，新身份废弃流式渲染缓存——
   * 消费方供模块级冻结常量。
   */
  readonly labels?: MarkdownLabels
  /** 增量渲染旗（官方 MarkdownText 原生 streaming 面——流式臂冻结已结算块，尾段增量重析）。缺省 undefined = 全量结算渲染（现行为）。 */
  readonly streaming?: boolean
}

/** Markdown 渲染唯一包装入口（产品内一切 Markdown 经本件，禁直用 MarkdownText）。 */
export function MarkdownDoc({ text, variant = 'body', className, pathImages, labels, streaming }: MarkdownDocProps): ReactNode {
  const cls = className === undefined ? 'dswf-markdown' : `dswf-markdown ${className}`
  return (
    <div className={cls} data-dswf-markdown={variant}>
      <MarkdownText
        text={stripMarkdownFrontmatter(text)}
        labels={labels ?? DEFAULT_MARKDOWN_LABELS}
        variant={variant}
        {...(pathImages !== undefined ? { pathImages } : {})}
        {...(streaming !== undefined ? { streaming } : {})}
      />
    </div>
  )
}

// ───────────────── icons.tsx 复制（被用件） ─────────────────

/** 官方 IconProps 同形（size/className——currentColor 着色随消费方） */
export interface DswfIconProps {
  readonly size?: number
  readonly className?: string
}

/**
 * IconFlameFillRegular（自绘——官方图标库 flame 缺件核销后补；官方参照件刻度：
 * 16px viewBox / currentColor / 单色填充）。知识卡片热度徽章专用（SC-J J1：
 * 火焰图标 + 数字——零 emoji 占位）。
 */
export function IconFlameFillRegular({ size = 13, className }: DswfIconProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      fillRule="evenodd"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 8.6c-1.42 1.51-2.1 2.6-2.1 3.6 0 .99.83 1.8 1.77 1.8.94 0 1.77-.81 1.77-1.8 0-1-.68-2.09-1.44-3.6Z" />
      <path d="M8 1.33c1.6 2.45 4.25 4.41 4.25 7.11 0 2.63-1.97 4.56-4.25 4.56-2.28 0-4.25-1.93-4.25-4.56C3.75 5.74 6.4 3.78 8 1.33Z" />
    </svg>
  )
}

// ───────────────── time-label.ts 复制 ─────────────────

/**
 * 毫秒时戳 → 官方桶化 zh 标签（纯函数）。桶枚举封闭——未知桶 fail-loud（契约面保证
 * relativeTime 返回封闭联合，default 支即不可达证明）。
 */
export function timeLabelZh(ts: number, now: number): string {
  const bucket = relativeTime(ts, now)
  switch (bucket.unit) {
    case 'now':
      return '刚刚'
    case 'minutes':
      return `${bucket.n} 分钟前`
    case 'hours':
      return `${bucket.n} 小时前`
    case 'days':
      return `${bucket.n} 天前`
    case 'months':
      return `${bucket.n} 个月前`
    case 'years':
      return `${bucket.n} 年前`
    default: {
      const exhaustive: never = bucket.unit
      throw new Error(`dsh-forge web: 未知相对时间桶：${String(exhaustive)}`)
    }
  }
}

/**
 * ISO-8601 串 → 桶化 zh 标签（纯函数）：不可解析原文返回（fail-soft 不炸卡片/行——
 * core 写入面保证 ISO，此为防御面）。
 */
export function isoTimeLabelZh(iso: string, now: number): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  return timeLabelZh(ts, now)
}
