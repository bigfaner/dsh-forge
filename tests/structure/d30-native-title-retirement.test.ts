// M3.1 D30 结构 pin —— 自绘面原生 title= 悬浮提示清零 → 官方 Tooltip 件
// （任务 dsh-forge-m3.1-ui-alignment/1.15 机械面锚——读文件法 = 本目录 scaffold/web-shell
//  先例；apps/web 测试面无 DOM 环境（renderToStaticMarkup 纯静态渲染，气泡/handler
//  不入静态标记），TSX 源面 AST 扫描归此；实机亮/暗双主题气泡走查归证据面 SC-8。）
// 断言面：
//   1. DOM 元素（小写标签）title= 属性全仓清零（动态 title={…} 与静态 title="…" 双形态）；
//   2. 组件标题 prop 排除清单记账（EmptyState/Modal/DisclosureRow/DrawerSection——标题
//      文本 prop 非悬浮提示位；计数冻结，新增组件标题面须显式扩清单）；
//   3. 官方 Tooltip 采纳锚（迁移面逐文件 import + portal 逃逸——滚动裁剪/transform/层叠
//      上下文容器统一 portal，官方 data-portal 气泡 z-index 1100 > Modal 遮罩 1000）；
//   4. 禁用态锚定包裹 CSS（.dswf-tipwrap——禁用按钮吞指针事件，气泡锚 = 包裹 span 矩形）；
//   5. 零死代码：随 1.7 退役的 SessionTaskPills 面不重复包裹（文件已退役，零在场）。
// 锚点迁移台账（断言零弱化——title 属性 pin → Tooltip label 结构 pin 对位）：
//   ModeChip.test「悬停扫描吸收…」/ status-chips「无此状态任务」/ PhaseChips「无此阶段
//   feature」/ ProposalStatusChips「无此状态提案」/ DocGroupList「relPath」/ dag-view
//   「键·全名兜底」/ list-view「全键」/ ForgeWorkspacePanel「wsPath 悬停」/ DirectoryBrowser
//   「crumb 路径·确认态」/ AddProjectFlow「面包屑锚」/ e2e sc3「行锚 title 定位 + 未标记
//   chip title 断言」——各原断言位均已就地迁移（title= 反断言 + 本文件 label 结构锚）。
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const SRC = join(ROOT, 'apps/web/src')

/** 收集 apps/web/src 全部 tsx（排除 *.test.*——测试源是断言消费方非产品面） */
function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let stat
    try {
      stat = readdirSync(p, { withFileTypes: true })
    } catch {
      stat = null
    }
    if (Array.isArray(stat)) out.push(...tsxFiles(p))
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

interface TitleAttr {
  readonly file: string
  readonly line: number
  readonly owner: string
}

/**
 * JSX 开标签属性区扫描（前向——花括号/圆方括号/引号深度感知；TS7 原生 preview 无 JS
 * AST API，读文件法 = 本目录 CSS 规则块抽取同型）。每个 <Tag …> 开标签取其属性区，
 * 命中 title=（词边界——emptyTitle=/data-*-title 不误报）即记 { 文件, 行, 标签 }；
 * 嵌套标签（Menu anchor={<Tooltip>…}）由全局正则独立命中各自区域，归属不失真。
 */
function titleAttrs(file: string): TitleAttr[] {
  const src = readFileSync(file, 'utf8')
  const out: TitleAttr[] = []
  const rel = file.slice(ROOT.length + 1).replaceAll('\\', '/')
  const re = /<([A-Za-z][A-Za-z0-9]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    let i = re.lastIndex
    let depth = 0
    let quote: string | null = null
    const start = i
    while (i < src.length) {
      const ch = src[i] as string
      if (quote !== null) {
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === quote) quote = null
      } else if (ch === '{' || ch === '(' || ch === '[') {
        depth++
      } else if (ch === '}' || ch === ')' || ch === ']') {
        depth--
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
      } else if (ch === '>' && depth === 0) {
        break
      }
      i++
    }
    const region = src.slice(start, i)
    if (/(?<![\w-])title=/.test(region)) {
      const line = (src.slice(0, m.index).match(/\n/g) ?? []).length + 1
      out.push({ file: rel, line, owner: m[1] as string })
    }
  }
  return out
}

const all = tsxFiles(SRC).flatMap((f) => titleAttrs(f))
/** DOM 元素（小写标签）= 原生 tooltip 位；大写标签 = 组件标题 prop（排除清单） */
const isComponent = (owner: string): boolean => owner[0] === owner[0]?.toUpperCase() && owner[0] !== owner[0]?.toLowerCase()
const dom = all.filter((a) => !isComponent(a.owner))
const byComponent = new Map<string, number>()
for (const a of all) {
  if (isComponent(a.owner)) byComponent.set(a.owner, (byComponent.get(a.owner) ?? 0) + 1)
}

/** D30 迁移面（真悬浮提示位——官方 Tooltip 逐文件采纳锚；全量 portal 逃逸） */
const TOOLTIP_FILES = [
  'apps/web/src/components/ModeChip.tsx',
  'apps/web/src/flows/add-project/DirectoryBrowser.tsx',
  'apps/web/src/flows/add-project/RegisterForm.tsx',
  'apps/web/src/views/docs/index.tsx',
  'apps/web/src/views/knowledge/DomainTree.tsx',
  'apps/web/src/views/knowledge/EntryDrawer.tsx',
  'apps/web/src/views/knowledge/KnowledgeToolbar.tsx',
  'apps/web/src/views/overview/feature-tab.tsx',
  'apps/web/src/views/overview/feature-tab/DocGroupList.tsx',
  'apps/web/src/views/overview/feature-tab/PhaseChips.tsx',
  'apps/web/src/views/overview/ov-head.tsx',
  'apps/web/src/views/overview/proposal-tab.tsx',
  'apps/web/src/views/overview/proposal-tab/ProposalStatusChips.tsx',
  'apps/web/src/views/overview/status-chips.tsx',
  'apps/web/src/views/overview/sticky-bar.tsx',
  'apps/web/src/views/overview/drawer/index.tsx',
  'apps/web/src/views/overview/drawer/timeline.tsx',
  'apps/web/src/views/overview/drawer/transition-dialog.tsx',
  'apps/web/src/views/overview/drawer/type-templates/coding.tsx',
  'apps/web/src/views/overview/drawer/type-templates/parts.tsx',
  'apps/web/src/views/overview/task-tab/DispatchButton.tsx',
  'apps/web/src/views/overview/task-tab/ViewDropdown.tsx',
  'apps/web/src/views/overview/task-tab/dag-view.tsx',
  'apps/web/src/views/overview/task-tab/list-view.tsx',
  'apps/web/src/views/overview/task-tab/swimlane-view.tsx',
  'apps/web/src/views/overview/task-tab/task-tab.tsx',
  'apps/web/src/views/session/DispatchPanel.tsx',
  'apps/web/src/views/session/RecallTab.tsx',
  'apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx',
] as const

/** 组件标题 prop 排除清单（标题文本 prop 非悬浮提示位——D30 记账；计数冻结） */
const EXEMPT_LEDGER: Readonly<Record<string, number>> = {
  // 空态标题（文案标题非 tooltip）×15：feature-tab/proposal-tab/task-tab×2/KnowledgeView/
  // RecallTab/docs/drawer/KnowledgeCardGrid×3/dock-tabs×2/EntryDrawer/ForgeWorkspacePanel
  EmptyState: 15,
  // 对话框标题（Modal 头部标题文本）×4：ForgeWorkspacePanel/AddProjectFlow/ModeDialog/VerdictDialog
  Modal: 4,
  // 官方 Rows 行标题文本 prop ×1（ForgeWorkspacePanel 项目行名称）
  DisclosureRow: 1,
  // 抽屉分块折叠头标题 ×2（任务内容/时间线——drawer/index）
  DrawerSection: 2,
}

describe('D30 自绘面原生 title= 清零（官方 Tooltip 件对齐——结构 pin）', () => {
  it('DOM 元素 title 属性全仓零在场（动态 title={…} 与静态 title="…" 双形态）', () => {
    expect(dom, `原生 title 残留位：\n${dom.map((a) => `  ${a.file}:${a.line} <${a.owner}>`).join('\n')}`).toEqual([])
  })

  it('组件标题 prop 排除清单记账（EmptyState/Modal/DisclosureRow/DrawerSection——计数冻结）', () => {
    expect(Object.fromEntries(byComponent)).toEqual(EXEMPT_LEDGER)
  })

  it.each(TOOLTIP_FILES)('官方 Tooltip 采纳锚：%s（import + portal 逃逸在场）', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    expect(src, `${rel} 缺 Tooltip import`).toContain(`from '@deepseek-ai/dsh-client-ui-primitives'`)
    expect(src, `${rel} 缺 Tooltip 采纳`).toContain('Tooltip')
    expect(src, `${rel} 气泡未 portal 逃逸（滚动裁剪/transform/层叠容器统一 portal）`).toContain('portal')
  })

  it('禁用态锚定包裹 CSS 在场（.dswf-tipwrap——禁用按钮吞指针事件，锚 = 包裹 span）', () => {
    const css = readFileSync(join(ROOT, 'apps/web/src/components/components.css'), 'utf8')
    expect(css).toContain('.dswf-tipwrap')
    expect(css).toContain('pointer-events: none')
  })

  it('零死代码：随 1.7 退役的 SessionTaskPills 面零在场（不重复包裹）', () => {
    expect(tsxFiles(SRC).filter((f) => /SessionTaskPills/.test(f))).toEqual([])
  })
})
