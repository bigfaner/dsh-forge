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
// D36 ⑤ 更替（任务 dsh-forge-m3.1-ui-alignment/1.23——断言更替非删除，walk 计数不减）：
//   ViewDropdown 锚钮 Tooltip 随用户裁决退役 → 原 TOOLTIP_FILES 采纳锚位对位迁入
//   TOOLTIP_RETIRED_FILES 零 Tooltip 退役锚（it.each 位 1:1 保留——29 walk 位恒数）。
// D37 更替（任务 dsh-forge-m3.1-ui-alignment/1.24——断言更替非删除，29 walk 位恒数）：
//   用户裁决「展开、派发、状态筛选控件等功能直观按钮不要添加 tooltip，全面排查」——
//   控件自释位（展开族/派发钮/状态筛选 chips 三族/✕ 关闭族/⋯ 行操作族/粘滞条清除·排序）
//   Tooltip 整体退役 → 5 个零 Tooltip 整迁面（status-chips/ProposalStatusChips/PhaseChips/
//   DispatchButton/sticky-bar）对位迁入 TOOLTIP_RETIRED_FILES；保留位与退役位同文件的
//   5 个部分退役面（ov-head/proposal-tab/list-view/drawer/index/transition-dialog）以
//   TOOLTIP_REMAINING_COUNTS 余额冻结 pin 承接（增量保留位对位冻结——新增 Tooltip 须显式扩记）。
//   全量 141 位逐位判定台账 = walkthrough/D37-self-evident-tooltip.md。
// 1.7 更替（任务 md-preview-mermaid/1.7——断言更替非删除）：
//   用户裁决 2026-10-11「悬浮到提案/feature 的文档上时显示摘要，如无摘要则不展示，
//   不要展示文档路径」——①提案文档行 relPath Tooltip 退役（proposal-tab.tsx 部分退役面
//   余额 5→4 对位冻结承接口径不变）；②DocGroupList relPath 回退退役 → summary 非空才
//   挂载（TOOLTIP_FILES 采纳锚位保持——条件挂载仍 import + portal 在场；结构守卫 pin =
//   web-shell.test 1.6 悬浮 pin 位更替）。
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

/** D30 迁移面（真悬浮提示位——官方 Tooltip 逐文件采纳锚；全量 portal 逃逸）。
 * D37 更替后余额：概览 tab 零 Tooltip 整迁面 5 件 + 部分退役面 5 件（余额冻结 pin）。 */
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
  'apps/web/src/views/overview/ov-head.tsx',
  'apps/web/src/views/overview/proposal-tab.tsx',
  'apps/web/src/views/overview/drawer/index.tsx',
  'apps/web/src/views/overview/drawer/timeline.tsx',
  'apps/web/src/views/overview/drawer/transition-dialog.tsx',
  'apps/web/src/views/overview/drawer/type-templates/coding.tsx',
  'apps/web/src/views/overview/drawer/type-templates/parts.tsx',
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
  // 对话框标题（Modal 头部标题文本）×6：ForgeWorkspacePanel×3（项目改名 + D45 会话改名
  // + D45 停止并归档确认）/AddProjectFlow/ModeDialog/VerdictDialog
  Modal: 6,
  // 官方 Rows 行标题文本 prop ×1（ForgeWorkspacePanel 项目行名称）
  DisclosureRow: 1,
  // 抽屉分块折叠头标题 ×2（任务内容/时间线——drawer/index）
  DrawerSection: 2,
}

/** D36 ⑤ + D37 Tooltip 退役锚（采纳锚位 1:1 对位迁移——零 Tooltip 在场；29 walk 位恒数：
 * TOOLTIP_FILES 23 + TOOLTIP_RETIRED_FILES 6） */
const TOOLTIP_RETIRED_FILES = [
  'apps/web/src/views/overview/task-tab/ViewDropdown.tsx', // D36 ⑤：视图切换钮控件自释（1.23）
  'apps/web/src/views/overview/status-chips.tsx', // D37：七态筛选 chips（zh 标签在 chip 面；0 计数淡化自释）
  'apps/web/src/views/overview/proposal-tab/ProposalStatusChips.tsx', // D37：五态筛选 chips（同族）
  'apps/web/src/views/overview/feature-tab/PhaseChips.tsx', // D37：阶段筛选 chips（同族）
  'apps/web/src/views/overview/task-tab/DispatchButton.tsx', // D37：派发钮（「派发」label 自明；置灰深灰实底自释）
  'apps/web/src/views/overview/sticky-bar.tsx', // D37：✕ 清除钮 + ⇅ 排序 pill（通用惯例 + 当前模式标签直出）
] as const

/**
 * D37 部分退役面 Tooltip 余额冻结（保留位与退役位同文件——增量信息承载位对位冻结；
 * EXEMPT_LEDGER 同口径：新增 Tooltip 须显式扩记。判定台账 = walkthrough/
 * D37-self-evident-tooltip.md——保留面：截断兜底/副作用说明/诊断说明/容器 pill 计数注/
 * 1.23 ⑥ 行卡增量悬停/边界位 ⟞ 跳转会话与拖宽柄）。
 */
const TOOLTIP_REMAINING_COUNTS: Readonly<Record<string, number>> = {
  'apps/web/src/views/overview/ov-head.tsx': 2, // projectName + row.value（截断兜底）
  'apps/web/src/views/overview/proposal-tab.tsx': 4, // title + 打开新会话（副作用说明）+ slug + createdAt（1.7 裁决：提案文档行 relPath 悬浮退役——无摘要不出路径）
  'apps/web/src/views/overview/task-tab/list-view.tsx': 3, // key/title/sub（1.23 ⑥ 增量悬停交付面）
  'apps/web/src/views/overview/drawer/index.tsx': 4, // 拖宽柄（边界位）+ taskKey + title + 诊断失败说明
  'apps/web/src/views/overview/drawer/transition-dialog.tsx': 1, // taskKey（截断兜底）
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

  it.each(TOOLTIP_RETIRED_FILES)('Tooltip 退役锚（D36 ⑤ / D37 更替——控件自释零 Tooltip）：%s', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    expect(src, `${rel} Tooltip 残留（退役位零在场——D36 ⑤ / D37）`).not.toContain('Tooltip')
  })

  it('D37 部分退役面 Tooltip 余额冻结（增量保留位对位——新增 Tooltip 须显式扩记）', () => {
    for (const [rel, count] of Object.entries(TOOLTIP_REMAINING_COUNTS)) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      const actual = src.match(/<Tooltip\b/g)?.length ?? 0
      expect(actual, `${rel} Tooltip 余额漂移（D37 点名退役位应零在场——台账 walkthrough/D37-self-evident-tooltip.md）`).toBe(count)
    }
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
