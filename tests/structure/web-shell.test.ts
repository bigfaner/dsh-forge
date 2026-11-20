// 任务 1.5 结构 pin —— 壳接入装配纪律（源面同步 + vite 产物形状 + 令牌面就位）。
// 权威：tech-design Integration「boot manifest 掌舵 → dsh-client-web 壳内核」+ S2 清单。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// 产品源扫描根（1.45 迁移后产品 UI 双落位：壳 apps/web/src + 插件包 plugins/*/ui——
// 扫描类 pin 双根遍历，锚路径对位迁移见各断言面）
const PRODUCT_SRC_ROOTS = ['apps/web/src', 'plugins/project/ui', 'plugins/knowledge/ui'] as const

function* walkAll(roots: readonly string[]): Generator<string> {
  for (const root of roots) yield* walk(join(ROOT, root))
}

// MarkdownDoc 包装入口豁免集（壳 components/MarkdownDoc + 两插件 bundle 各自的
// components-mirror 镜像——包装本体合法直用官方 MarkdownText）
const MARKDOWN_WRAPPER_FILES = [
  'apps/web/src/components/MarkdownDoc.tsx',
  'plugins/project/ui/components-mirror.tsx',
  'plugins/knowledge/ui/components-mirror.tsx',
] as const

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

describe('壳接入装配 pin（1.5）', () => {
  it('main.ts 掌舵 id 字面量 = client-plugin FORGE_CLIENT_PLUGIN_ID（不经 import 共享——防公共 chunk 拆分）', () => {
    expect(read('apps/web/src/main.ts')).toContain("'@dsh-forge/web-client'")
    expect(read('apps/web/src/client-plugin/plugin.ts')).toContain("export const FORGE_CLIENT_PLUGIN_ID = '@dsh-forge/web-client'")
  })

  it('vite 双入口同型母本（index.html + client-plugin）且 standalone serve 被拒', () => {
    const vite = read('apps/web/vite.config.ts')
    expect(vite).toContain("index: src('./index.html')")
    expect(vite).toContain("'client-plugin': src('./src/client-plugin/index.ts')")
    expect(vite).toContain('rejectStandaloneServe')
  })

  it('bug: 双入口零运行时共享——壳树（client-plugin 外）与 client 树互禁 runtime import（type-only 豁免），防 rollup 公共 chunk 拆分破坏 forge-client classic script 形状', () => {
    // 2026-10-11 web boot 报障根因：views/session/ForgeProgressNode.tsx（壳入口树）runtime
    // import client-plugin/progress-node.js → rollup 拆共享 chunk → forge-client.js 以
    // import{…}from"./assets/…" 开头 = classic script SyntaxError → 模块系统
    // 「loaded without registering "@dsh-forge/web-client"」→ boot 审计 1 entry did not
    // activate。纪律：跨入口值需求 = 字面量/纯函数镜像（main.ts id 同款先例），禁 import 共享。
    const SRC = join(ROOT, 'apps/web/src')
    const offenders: string[] = []
    const statementsOf = (src: string): string[] =>
      [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s+[^;\n]+?from\s+['"]([^'"]+)['"]/g)].map((m) => m[0].trim())
    const dynamicRefs = (src: string): string[] =>
      [...src.matchAll(/(?:import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[0])
    /** 语句类型擦除判据：`import type`/`export type` 前缀，或花括号内全 `type X` 具名 */
    const isTypeErased = (stmt: string): boolean =>
      /^\s*(?:import|export)\s+type\b/.test(stmt) ||
      (/^\s*(?:import|export)\s*\{/.test(stmt)
        && stmt
          .slice(stmt.indexOf('{') + 1, stmt.indexOf('}'))
          .split(',')
          .every((spec) => /^\s*type\s+\w+/.test(spec))
      )
    for (const p of walk(SRC)) {
      if (!/\.(ts|tsx)$/.test(p) || /\.test\.(ts|tsx)$/.test(p)) continue
      const rel = p.replaceAll('\\', '/')
      const inClientTree = /src\/client-plugin\//.test(rel)
      const src = readFileSync(p, 'utf8')
      for (const stmt of [...statementsOf(src), ...dynamicRefs(src)]) {
        const spec = (stmt.match(/['"]([^'"]+)['"]/) ?? [])[1] ?? ''
        if (!spec.startsWith('.')) continue // 包名/裸引入不跨入口（两树各自打包依赖）
        const crosses = inClientTree
          ? spec.startsWith('..') // client 树引出（../shell/… 等）
          : /(?:^|\/)client-plugin\//.test(spec) // 壳树引入 client 树
        if (crosses && !isTypeErased(stmt)) offenders.push(`${rel}: ${stmt.replaceAll(/\s+/g, ' ')}`)
      }
    }
    expect(offenders, `跨入口 runtime import（rollup 将拆公共 chunk——forge-client classic script 形状破坏）:\n${offenders.join('\n')}`).toEqual([])
  })

  it('index.html 引 main.ts（母本同名入口）且 #root 挂载点在场', () => {
    const html = read('apps/web/index.html')
    expect(html).toContain('/src/main.ts')
    expect(html).toContain('id="root"')
  })

  it('shell/ 零业务漂移：不 import views/flows（铁律① 由 oxlint 机械执行，此处 pin 模块面存在）', () => {
    for (const f of [
      'apps/web/src/shell/boot.ts',
      'apps/web/src/shell/carrier.ts',
      'apps/web/src/shell/bridge.ts',
      'apps/web/src/shell/index.ts',
      'apps/web/src/shell/dsh-globals.d.ts',
      'apps/web/src/styles/global.css',
      'apps/web/src/client-plugin/index.ts',
      'apps/web/src/client-plugin/plugin.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
  })

  it('host 壳服务面就位（scheme + 转发 + ws 改写 + 入口 URL）', () => {
    const webDocument = read('apps/host/src/window/web-document.ts')
    expect(webDocument).toContain("export const SHELL_SCHEME = 'dsh-forge'")
    expect(webDocument).toContain('authenticateWebHost')
    expect(webDocument).toContain('forwardToHost')
    expect(webDocument).toContain('installShellStreamRewrite')
    const main = read('apps/host/src/main.ts')
    expect(main).toContain('registerShellScheme(protocol)')
    expect(main).toContain('SHELL_ENTRY_URL')
    expect(main).not.toContain('manifest.url })') // 主窗口不再直载官方前端 URL
  })
})

describe('fix-25 官方基座降位 pin（main.conversation 影子退役——官方 ConversationRoot 渲染中区）', () => {
  it('模块面就位：装配族（壳宿主/hero/知识面板/面板模型/桥）+ 页签族 + 字形件；退役面缺席（zones/视图态机/会话面板/自研嵌入配方）', () => {
    for (const f of [
      'apps/web/src/workbench/ShellHost.tsx',
      // 1.45 迁移：hero 面板本体随 @dsh-forge/project（ui/hero/）、知识面板本体随 @dsh-forge/knowledge（ui/）
      'plugins/project/ui/hero/HeroPanel.tsx',
      'plugins/knowledge/ui/KnowledgePanel.tsx',
      'apps/web/src/workbench/panel-model.ts',
      'apps/web/src/workbench/workbench-bridge.ts',
      'apps/web/src/views/session/ConversationViews.tsx',
      'apps/web/src/client-plugin/plugin.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    expect(read('apps/web/src/workbench/index.ts')).toContain("export * from './ShellHost.js'")
    expect(read('apps/web/src/shell/index.ts')).not.toContain("export * from './use-shell-view")
    for (const retired of [
      'apps/web/src/zones',
      'apps/web/src/shell/view-state.ts',
      'apps/web/src/shell/use-shell-view.ts',
      'apps/web/src/workbench/WorkbenchPanel.tsx',
      'apps/web/src/workbench/ChatSurface.tsx',
      'apps/web/src/views/session/SessionPanel.tsx',
      'apps/web/src/views/session/SessionToolbar.tsx',
      // 知识面板行字形迁 @dsh-forge/knowledge ui/KnowledgeGlyph.tsx——壳侧死面零残留
      'apps/web/src/views/sidebar/KnowledgeGlyph.tsx',
    ]) {
      expect(existsSync(join(ROOT, retired)), `${retired} 应已退役（fix-25）`).toBe(false)
    }
  })

  it('main.conversation 影子登记缺席（官方头部链白拿的机制面）+ 官方缝登记在场（main roster/panellist/页签 roster/shell.overlay；hero/knowledge 面板注册随 1.45 迁插件 face——双 bundle 正门锚）', () => {
    const plugin = read('apps/web/src/client-plugin/plugin.ts')
    expect(plugin).not.toContain("name: MAIN_CONVERSATION_SLOT")
    expect(plugin).not.toContain("'main.conversation'")
    // 壳侧常驻登记 = shell.overlay（fix-13 注记 1.42/1.44：panellist/conversation.view
    // 两 slot 登记面随召回/页签族迁 @dsh-forge/knowledge faces 正门）
    expect(plugin).toContain('name: SHELL_OVERLAY_SLOT')
    expect(knowledgeFaces()).toContain('slot: SIDEBAR_PANELLIST_SLOT')
    expect(knowledgeFaces()).toContain('slot: CONVERSATION_VIEW_SLOT')
    // 面板 key 字面量同源（plugin 侧 ↔ 壳侧 panel-model——bundle 自含不经 import）
    expect(plugin).toContain("export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'")
    expect(plugin).toContain("export const HERO_PANEL_KEY = 'dswf-hero'")
    const model = read('apps/web/src/workbench/panel-model.ts')
    expect(model).toContain("export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'")
    expect(model).toContain("export const HERO_PANEL_KEY = 'dswf-hero'")
    // 面板注册面随迁移落插件 face 正门（hero → @dsh-forge/project；knowledge → @dsh-forge/knowledge）
    const heroFace = read('plugins/project/ui/hero-panel-face.ts')
    expect(heroFace).toContain('key: HERO_PANEL_KEY')
    expect(heroFace).toContain('component: ForgeHeroPanel')
    expect(knowledgeFaces()).toContain('key: KNOWLEDGE_PANEL_KEY')
    expect(knowledgeFaces()).toContain('component: ForgeKnowledgePanel')
  })

  /** knowledge faces 正门（faces.ts——双 slot 登记面 + 面板注册锚单读面） */
  function knowledgeFaces(): string {
    return read('plugins/knowledge/ui/faces.ts')
  }

  it('知识模式右栏联动 = 装配层官方 sidebarRight 窄面（panel-model.rightbarViewPlan——fix-25 随迁 ShellHost）', () => {
    expect(read('apps/web/src/workbench/panel-model.ts')).toContain('rightbarViewPlan')
    expect(read('apps/web/src/workbench/ShellHost.tsx')).toContain('rightbarViewPlan')
  })
})

describe('components 基础组件 pin（2.6）', () => {
  it('模块面就位：四组件 + 样式 + barrel', () => {
    for (const f of [
      'apps/web/src/components/MarkdownDoc.tsx',
      'apps/web/src/components/StateChip.tsx',
      'apps/web/src/components/HeatBadge.tsx',
      'apps/web/src/components/EmptyState.tsx',
      'apps/web/src/components/components.css',
      'apps/web/src/components/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/components/index.ts')
    for (const name of ['EmptyState', 'HeatBadge', 'MarkdownDoc', 'StateChip']) {
      expect(barrel).toContain(`export * from './${name}.js'`)
    }
  })

  it('Hard Rule 渲染纪律：MarkdownText 裸渲染器仅 MarkdownDoc 包装入口 import（产品内其余禁直用）', () => {
    const offenders: string[] = []
    for (const p of walkAll(PRODUCT_SRC_ROOTS)) {
      if (!/\.(ts|tsx)$/.test(p) || p.endsWith('.test.tsx') || p.endsWith('.test.ts')) continue
      const src = readFileSync(p, 'utf8')
      if (/from '@deepseek-ai\/dsh-client-ui-primitives'/.test(src) && /MarkdownText/.test(src)) {
        const rel = p.replaceAll('\\', '/')
        if (!MARKDOWN_WRAPPER_FILES.some((w) => rel.endsWith(w))) offenders.push(rel)
      }
    }
    expect(offenders, `裸渲染器直用（须改经 MarkdownDoc 包装）: ${offenders.join(', ')}`).toEqual([])
    expect(read('apps/web/src/components/MarkdownDoc.tsx')).toContain(
      "import { MarkdownText, type MarkdownLabels, type MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'",
    )
  })

  it('零业务语义：components 模块禁 RPC 面 / contracts DTO 引入（AC-3 机械面——props 保持原始形状）', () => {
    const offenders: string[] = []
    for (const p of walk(join(ROOT, 'apps/web/src/components'))) {
      if (!/\.(ts|tsx)$/.test(p)) continue
      const src = readFileSync(p, 'utf8')
      if (/\.\.\/rpc\//.test(src) || /@dsh-forge\/contracts/.test(src)) {
        offenders.push(p.replaceAll('\\', '/'))
      }
    }
    expect(offenders, `业务语义渗入基础组件（RPC/contracts）: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('views/session 会话页签族 pin（2.11 → fix-25 官方 roster 形态 → fix-29 轨迹官方直用 → m3.1 D5/D6 pill 退役）', () => {
  it('模块面就位：视图占用者族 + 召回数据面 + 派发悬浮面板 + 样式 + barrel；fix-29/m3.1 退役面缺席', () => {
    for (const f of [
      'apps/web/src/views/session/ConversationViews.tsx',
      // loop-event-delivery 1.8：悬浮进度流面板（派发任务悬浮面板 UI 继任）
      // 1.13 迁移退役：DispatchEventsPanel.tsx/.css 本体迁 @dsh-forge/task-loop（ui/dispatch-events-panel/）——壳侧存在性 pin 改指迁地面
      'plugins/task-loop/ui/dispatch-events-panel/DispatchEventsPanel.tsx',
      'plugins/task-loop/ui/dispatch-events-panel/dispatch-events-panel.css',
      // fix-13 注记（1.45）：DispatchPanel 出口随 dock tab 族迁 @dsh-forge/project
      // （plugins/project/ui/dock-tabs/worker-session.ts——概览任务 tab 消费面）
      'plugins/project/ui/dock-tabs/worker-session.ts',
      'apps/web/src/views/session/session.css',
      'apps/web/src/views/session/index.ts',
      // 1.13 迁移退役：DispatchEventsPanel.tsx 本体迁 @dsh-forge/task-loop（ui/dispatch-events-panel/）——壳侧存在性 pin 改指迁地面
      'plugins/task-loop/ui/dispatch-events-panel/DispatchEventsPanel.tsx',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/views/session/index.ts')
    for (const name of ['ConversationViews']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
    // loop-event-delivery 1.8 替代 pin：旧任务面板样式/角标 UI 死代码缺席（替代不并存——
    // DispatchPanel.tsx 仅存 worker 解析辅助面，dswf-dp-* 悬浮面板样式族整体退役）
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/dispatch-panel.css'))).toBe(false)
    // fix-29 退役 pin：产品轨迹台账/转录投影死代码缺席（轨迹 = 官方 ui-trajectory 直用）
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/TrajectoryLedger.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/transcript.ts'))).toBe(false)
    // m3.1 D5 退役 pin：会话头挂接 pill 死代码缺席（槽位卸载——监视面 = DispatchPanel）
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/ForgeSessionTaskPills.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/SessionTaskPills.tsx'))).toBe(false)
  })

  it('官方 roster 占用 pin：召回视图登记 id + pane 锚（本体归 @dsh-forge/knowledge 插件——壳侧死面退役）；fix-29 轨迹零登记（对话/轨迹 = 官方 chat/trajectory 直用）', () => {
    const views = read('plugins/knowledge/ui/RecallTab.tsx')
    expect(views).toContain('data-dswf-pane="recall"')
    const shellViews = read('apps/web/src/views/session/ConversationViews.tsx')
    expect(shellViews).not.toContain('data-dswf-pane') // 壳侧零召回 pane（本体随注册面迁插件域）
    expect(shellViews).not.toContain('data-dswf-pane="trajectory"')
    const plugin = read('apps/web/src/client-plugin/plugin.ts')
    expect(plugin).not.toContain('TRAJECTORY_VIEW_ID') // fix-29：产品轨迹登记 id 常量退役
    expect(plugin).not.toContain("label: '轨迹'") // 官方 ui-trajectory 行保持——产品零复刻
    expect(plugin).toContain("export const RECALL_VIEW_ID = 'dswf-recall'")
  })

  it('Hard Rule 官方件复用：头部单元/页签行 = 官方 ConversationRoot 原生（SessionPanel/SessionToolbar 复刻退役——源缺席即 pin）+ 视图 pane hidden 守卫样式', () => {
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/SessionPanel.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/SessionToolbar.tsx'))).toBe(false)
    const css = read('apps/web/src/views/session/session.css')
    expect(css).toContain('.dswf-session-pane[hidden]')
  })

  it('fix-23 官方右栏收展面 pin（fix-25 随迁）：联动 = ShellHost 官方 sidebarRight 窄面（面板钮锚随官方 corner 退役）', () => {
    const host = read('apps/web/src/workbench/ShellHost.tsx')
    expect(host).toContain('rightbar.toggleExpanded') // 官方收展动作面（原 dispatch('toggle-right-dock') 退役）
    expect(host).toContain('rightbarViewPlan')
    const plugin = read('apps/web/src/client-plugin/plugin.ts')
    expect(plugin).toContain("'sidebarRight'") // 服务窄面注入（知识模式联动驱动面）
    expect(plugin).not.toContain('dswf-workbench-docktoggle') // 自管面板钮退役（官方 corner ExpandButton 接管）
  })

  it('AC4 形态对齐任务/Bug 弹窗 dialog：详情 = 自持可拖移 dialog（用户裁决可移动+可拉伸——拖动机械复用 drawer，视觉一律官方护仗）', () => {
    const css = read('plugins/knowledge/ui/knowledge.css')
    expect(css).toContain('.dswf-kn-dialog {')
    expect(css).toContain('z-index: var(--dsh-dockkit-float-layer, 60)') // 层级 = dockkit 浮层同一级
    expect(css).toContain('box-shadow: var(--dsw-elevation-prominent)') // 抬升面 = 任务/Bug 弹窗同配方
    expect(css).toContain('max-height: 92vh') // 纵向滚动上限（内容多不溢出——92% 原型刻度）
    expect(css).toContain('.dswf-kn-dialog-head {') // 拖移头行
    expect(css).toContain('.dswf-kn-dialog-resize {') // 缘侧拖宽手柄
    const drawer = read('plugins/knowledge/ui/EntryDrawer.tsx')
    expect(drawer).toContain('taskDrawerHeadDragProps') // 拖移机械复用 drawer（bug-dialog 同先例——零平行机械）
    expect(drawer).toContain('drawerWidthFromEdgeDrag')
    expect(drawer).toContain('{ capture: true }') // Esc 捕获监听（弹窗先于工具栏清空——capture 同现役序）
  })
})

describe('views/knowledge 知识浏览 pin（3.6）', () => {
  it('模块面就位：纯模型 + 装载 hook + 三件（工具栏/域树/网格）+ 装配 + 样式 + barrel', () => {
    for (const f of [
      // 1.45 迁移：知识 UI 本体落 plugins/knowledge/ui/（装配缝归插件域）
      'plugins/knowledge/ui/browse-model.ts',
      'plugins/knowledge/ui/use-knowledge-browse.ts',
      'plugins/knowledge/ui/KnowledgeToolbar.tsx',
      'plugins/knowledge/ui/DomainTree.tsx',
      'plugins/knowledge/ui/KnowledgeCardGrid.tsx',
      'plugins/knowledge/ui/KnowledgeBrowse.tsx',
      'plugins/knowledge/ui/knowledge.css',
      'plugins/knowledge/ui/KnowledgeView.tsx',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    // 装配 barrel = ui/index.ts（faces 正门）——组合插件对象经 faces.ts 注册三面
    const barrel = read('plugins/knowledge/ui/index.ts')
    expect(barrel).toContain("export * from './faces.js'")
    const faces = read('plugins/knowledge/ui/faces.ts')
    expect(faces).toContain("from './KnowledgePanel.js'")
    expect(faces).toContain("from './RecallTab.js'")
  })

  it('Hard Rule 域过滤前缀语义：domainPrefix 唯一透传点（entriesQueryOf）——网格/树零客户端过滤逻辑', () => {
    const model = read('plugins/knowledge/ui/browse-model.ts')
    expect(model).toContain('query.domainPrefix = filter.domain')
    const grid = read('plugins/knowledge/ui/KnowledgeCardGrid.tsx')
    expect(grid, '网格不得自建过滤语义（cards 服务端结果原样渲染）').not.toMatch(/domainPrefix|\.filter\(/)
    const tree = read('plugins/knowledge/ui/DomainTree.tsx')
    expect(tree, '域树只投影聚合节点（计数语义归 core aggregateDomainTree）').not.toContain('domainPrefix')
  })

  it('Hard Rule 官方件复用 + 自绘限域：工具栏 = 官方 Input/Pill；卡片热度 = card.heat 原样（官方缺件自绘火焰——J1 裁决）', () => {
    const toolbar = read('plugins/knowledge/ui/KnowledgeToolbar.tsx')
    expect(toolbar).toContain("from '@deepseek-ai/dsh-client-ui-primitives'")
    expect(toolbar).toContain('Input')
    expect(toolbar).toContain('Pill')
    const grid = read('plugins/knowledge/ui/KnowledgeCardGrid.tsx')
    expect(grid).toContain('data-dswf-kn-card-heat')
    expect(grid).toContain('{String(card.heat)}')
    expect(grid).toContain('StateDot')
    // 自绘面仅限领域组件类（域树行/卡片），吃令牌（knowledge.css 零裸值由 token-lint 机械执行）
    expect(read('plugins/knowledge/ui/knowledge.css')).toContain('.dswf-kn-dom-row')
    expect(read('plugins/knowledge/ui/knowledge.css')).toContain('.dswf-kn-card')
  })
})

describe('views/docs 文档 tab pin（3.9——1.8 渲染链退役：MarkdownDoc 全量渲染唯一径）', () => {
  it('模块面就位：tab 体 + 样式（1.8 退役清单——分段链五文件零残留）', () => {
    const DOCS = 'plugins/project/ui/dock-tabs/docs'
    for (const f of [`${DOCS}/index.tsx`, `${DOCS}/docs.css`]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    for (const f of [
      `${DOCS}/doc-segments.ts`,
      `${DOCS}/doc-segments.test.ts`,
      `${DOCS}/mermaid-diagram.tsx`,
      `${DOCS}/mermaid-diagram.test.tsx`,
      `${DOCS}/mermaid-diagram.retry.test.tsx`,
      `${DOCS}/md-segments-body.tsx`,
      `${DOCS}/md-segments-body.test.tsx`,
      `${DOCS}/md-preview-body.tsx`,
      `${DOCS}/md-preview-body.test.tsx`,
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 退役残留（1.8 渲染链退役清单）`).toBe(false)
    }
  })

  it('1.8 依赖切换：apps/web 依赖 @dsh-forge/md-mermaid（workspace:*）+ mermaid 直接依赖退役（零 mermaid 行）', () => {
    const pkg = read('apps/web/package.json')
    expect(pkg).toContain('"@dsh-forge/md-mermaid": "workspace:*"')
    expect(pkg, 'mermaid 直接依赖退役（全仓唯一引用方 = plugins/md-mermaid）').not.toMatch(/"mermaid"/)
  })

  it('Hard Rule 能力单源：产品源零 mermaid 引用（静态/动态 import 均零——引擎径归 @dsh-forge/md-mermaid）', () => {
    const offenders: string[] = []
    for (const p of walkAll(PRODUCT_SRC_ROOTS)) {
      if (!/\.(ts|tsx)$/.test(p) || p.endsWith('.test.ts') || p.endsWith('.test.tsx')) continue
      const src = readFileSync(p, 'utf8')
      if (/from\s+'mermaid'|import\('mermaid'\)/.test(src)) offenders.push(p.replaceAll('\\', '/'))
    }
    expect(offenders, `mermaid 引用（禁——唯一引用方 = md-mermaid 包）: ${offenders.join(', ')}`).toEqual([])
  })

  it('docs.css mermaid 样式保留迁移（.dswf-doc-mermaid 族供 DOM 增强器复用——超宽横滚 overflow-x:auto 先例）', () => {
    const css = read('plugins/project/ui/dock-tabs/docs/docs.css')
    expect(css, 'svg 自适应：max-width 100% + 居中（Codex 式图即内容）').toMatch(
      /\.dswf-doc-mermaid-canvas svg \{[^}]*max-width: 100%;[^}]*margin: 0 auto/,
    )
    expect(css, '超宽横向滚动机制保持（canvas overflow-x auto 既有）').toMatch(
      /\.dswf-doc-mermaid-canvas \{[^}]*overflow-x: auto/,
    )
    expect(css, '图卡外框 chrome 退役（内联零卡形制）').not.toMatch(/\.dswf-doc-mermaid \{[^}]*border/)
    expect(css, '回退占位卡形制保留（失败语义不降级——border 收编 fallback 专属规则）').toMatch(
      /\.dswf-doc-mermaid-fallback \{[^}]*border/,
    )
  })

  it('渲染纪律 + 数据面：DocBody 正文渲染唯一经 MarkdownDoc 全量渲染（官方渲染唯一包装入口——分段链退役）；数据唯一通道 = docs.read（悬空容忍）+ openExternal 恒经触发即忘包装', () => {
    const tab = read('plugins/project/ui/dock-tabs/docs/index.tsx')
    expect(tab, '正文全量渲染唯一经 MarkdownDoc').toContain('<MarkdownDoc')
    expect(tab, '裸渲染器禁直用（须经 MarkdownDoc 包装）').not.toContain('MarkdownText')
    expect(tab, '分段链退役（零共享件委托）').not.toContain('MdSegmentsBody')
    expect(tab).toContain('client.docs.read')
    // openExternal 触发即忘：组件回调恒经 openDocExternal 包装（失败吞不炸 tab）
    expect(tab).toContain('export async function openDocExternal')
    expect(tab).toContain('void openDocExternal(makeClient()')
  })

  it('1.4 dock tab 滚动收口 + 官方同形（1.8 双入口化）：容器 CSS 刻度组 + dock tab 自持滚动 + CodeToolbar labels 递达', () => {
    const css = read('plugins/project/ui/dock-tabs/docs/docs.css')
    const group = css.match(/\.dswf-doc-body,\s*\.dswf-kn-md-body \{[^}]*\}/)?.[0] ?? ''
    expect(group, '双入口官方同形容器单源（css$7 同刻度组——dock tab/知识抽屉零各自为政）').not.toBe('')
    expect(group, '官方同形 white-space:normal（pre/pre-wrap 渗透收口）').toContain('white-space: normal')
    expect(group).toContain('font-family: var(--dsw-font, inherit)')
    expect(group, '官方 css$7 inset 同刻度').toContain('padding: 10px 12px')
    const bodyRule = css.match(/\.dswf-doc-body \{[^}]*\}/)?.[0] ?? ''
    expect(bodyRule, '滚动所有权自持（dock 宿主不滚——同宿主 overview 先例同构）').toContain('overflow-y: auto')
    expect(bodyRule).toContain('flex: 1')
    expect(bodyRule).toContain('min-height: 0')
    expect(bodyRule, '产品自创 margin 22/20 + flex gap 刻度退役').not.toMatch(/\b(margin|gap):/)
    expect(css, 'mermaid 图卡节奏 = 官方块级 16px（双入口同组单源）').toMatch(
      /\.dswf-doc-body \.dswf-doc-mermaid,\s*\.dswf-kn-md-body \.dswf-doc-mermaid \{[^}]*margin: 16px 0/,
    )
    const doc = read('plugins/project/ui/dock-tabs/docs/index.tsx')
    expect(doc, 'CodeToolbar labels 递达（冻结常量 MD_PREVIEW_MARKDOWN_LABELS 单源）').toContain(
      'labels={MD_PREVIEW_MARKDOWN_LABELS}',
    )
  })

  it('1.8 渲染链退役：官方预览径 md mermaid 扩展注册链零残留（sidebar md 预览回归官方 builtin）', () => {
    expect(read('apps/web/src/product-views.ts'), '发布面零 ForgeMdPreviewBody').not.toContain('ForgeMdPreviewBody')
    const plugin = read('apps/web/src/client-plugin/plugin.ts')
    expect(plugin, '零预览实现 id').not.toContain("dswf-md-mermaid'")
    expect(plugin, '零 documentPreviews 注册面').not.toContain('documentPreviews')
    expect(plugin, '零预览槽注入').not.toContain("'sidebar.right.tab.document'")
  })

  it('1.6 单行头收敛 pin（对齐官方预览头）：标题行/只读 chip/摘要卡退役 + 官方 PathLabel/图标件 + docs.css 新旧规则对位 + 概览文档行 summary 悬浮数据面', () => {
    const tab = read('plugins/project/ui/dock-tabs/docs/index.tsx')
    expect(tab, '官方 PathLabel 复用（目录段弱化/渐隐裁剪/悬浮全值官方自带——禁自绘仿制）').toContain('PathLabel')
    expect(tab, '重读钮 = 官方导出图标件（documentpreview reload 同源 face）').toContain('IconRefreshOutlineRegular')
    expect(tab, '编辑器打开钮 = 官方导出图标件').toContain('IconFolderOpenOutlineRegular')
    expect(tab, '标题行退役（标题归 tab 页签）').not.toContain('dswf-doc-head')
    expect(tab, '摘要卡退役（摘要供给改经概览文档行悬浮）').not.toContain('dswf-doc-summary')
    expect(tab, '头部标题纯函数随退役（零消费死代码缺席）').not.toContain('docTitle')
    expect(tab, 'emoji 图标零残留（📁）').not.toContain('📁')
    expect(tab, 'emoji 图标零残留（↻）').not.toContain('↻')
    const css = read('plugins/project/ui/dock-tabs/docs/docs.css')
    expect(css, '退役规则清理：head 行').not.toMatch(/\.dswf-doc-head \{/)
    expect(css, '退役规则清理：title 行').not.toMatch(/\.dswf-doc-title \{/)
    expect(css, '退役规则清理：path 行（官方 PathLabel 自带——`.dswf-doc-pathbar` 前缀不误伤）').not.toMatch(/\.dswf-doc-path \{/)
    expect(css, '退役规则清理：summary 行').not.toMatch(/\.dswf-doc-summary \{/)
    expect(css, '单行头新规则在场（路径左 + 控件簇右 + 底缘发丝线——官方预览头同形）').toMatch(/\.dswf-doc-pathbar \{[^}]*border-bottom/)
    expect(css, '官方图标钮刻度组（28×28 命中区 + svg 15×15 官方同刻度 dsw-raw 镜像）').toContain('.dswf-doc-iconbtn svg')
    expect(css, '悬空 warn chip 规则保留（单行内可见性）').toContain('.dswf-doc-chip-dangling')
    const dgl = read('plugins/project/ui/dock-tabs/overview/feature-tab/DocGroupList.tsx')
    expect(dgl, '概览文档行悬浮 summary（1.7 裁决——summary 非空才挂 Tooltip 官方 label；缺省/空串零浮层）').toContain(
      "doc.summary !== undefined && doc.summary !== ''",
    )
    expect(dgl, 'docRowTipLabel 退役（relPath 回退违背 2026-10-11 裁决——不出路径）').not.toContain('docRowTipLabel')
    expect(dgl, 'relPath 不作悬浮 label（裁决：不要展示文档路径）').not.toContain('label={doc.relPath}')
    expect(dgl, 'DocGroupDoc 携 summary 透传（FeatureDocumentRow DTO 已有——零契约改动）').toContain('summary?: string')
  })
})

describe('views/knowledge 详情抽屉 pin（3.7）', () => {
  it('模块面就位：EntryDrawer（hook + 纯渲染体 + 元数据投影）+ barrel 出口', () => {
    const drawerPath = 'plugins/knowledge/ui/EntryDrawer.tsx'
    expect(existsSync(join(ROOT, drawerPath)), `${drawerPath} 缺席`).toBe(true)
    // 消费锚 = KnowledgeView 装配壳（faces 正门注册面——KnowledgePanel → KnowledgeView → EntryDrawer）
    const view = read('plugins/knowledge/ui/KnowledgeView.tsx')
    expect(view, "EntryDrawer 未进装配（'./EntryDrawer.js' 导入）").toContain("from './EntryDrawer.js'")
  })

  it('Hard Rule 渲染纪律 + 按需读取：正文唯一经 MarkdownDoc 全量渲染（1.8 渲染链退役——官方渲染唯一包装入口）；数据唯一通道 = entryDetail（不预载全库）', () => {
    const drawer = read('plugins/knowledge/ui/EntryDrawer.tsx')
    expect(drawer, '抽屉正文渲染唯一经 MarkdownDoc（全量渲染——mermaid 交 DOM 增强器）').toContain('<MarkdownDoc')
    expect(drawer, '裸渲染器禁直用（须经 MarkdownDoc 包装）').not.toContain('MarkdownText')
    expect(drawer, '分段链退役（零共享件委托）').not.toContain('MdSegmentsBody')
    expect(drawer).toContain('client.knowledge.entryDetail')
    expect(drawer, '抽屉不预载全库（browse/listEntries/heat 均非详情通道）').not.toMatch(
      /\.knowledge\.(browse|listEntries|heat|sessionRecall)/,
    )
  })

  it('AC3 关闭路径：✕ 锚（头行行尾 aria-label）+ Esc 捕获接线（capture 阶段——弹窗先于工具栏清空）', () => {
    const drawer = read('plugins/knowledge/ui/EntryDrawer.tsx')
    expect(drawer).toContain('data-dswf-kn-dialog-close')
    expect(drawer).toContain('aria-label="关闭弹窗"')
    expect(drawer, "Esc 链 capture 监听（'Escape' 判别）").toContain("'Escape'")
    expect(drawer).toContain('{ capture: true }')
    const escape = read('plugins/project/ui/dock-tabs/overview/drawer/index.tsx')
    expect(escape, 'capture 阶段接线（stopPropagation 防串关——机械单源在 drawer）').toContain('stopPropagation')
  })

  it('AC4 形态对齐任务/Bug 弹窗 dialog：详情 = 自持可拖移 dialog（用户裁决可移动+可拉伸——拖动机械复用 drawer，视觉一律官方护仗）', () => {
    const css = read('plugins/knowledge/ui/knowledge.css')
    expect(css).toContain('.dswf-kn-dialog {')
    expect(css).toContain('z-index: var(--dsh-dockkit-float-layer, 60)') // 层级 = dockkit 浮层同一级
    expect(css).toContain('box-shadow: var(--dsw-elevation-prominent)') // 抬升面 = 任务/Bug 弹窗同配方
    expect(css).toContain('max-height: 92vh') // 纵向滚动上限（内容多不溢出——92% 原型刻度）
    expect(css).toContain('.dswf-kn-dialog-head {') // 拖移头行
    expect(css).toContain('.dswf-kn-dialog-resize {') // 缘侧拖宽手柄
    const drawer = read('plugins/knowledge/ui/EntryDrawer.tsx')
    expect(drawer).toContain('taskDrawerHeadDragProps') // 拖移机械复用 drawer（bug-dialog 同先例——零平行机械）
    expect(drawer).toContain('drawerWidthFromEdgeDrag')
  })
})

describe('md 文档 body 渲染统一 pin（1.8 渲染链退役——MarkdownDoc 全量渲染唯一径）', () => {
  it('官方渲染唯一径：文档 tab DocBody 与知识抽屉正文区唯一经 MarkdownDoc（labels 冻结常量单源）+ 零分段链残留引用', () => {
    const tab = read('plugins/project/ui/dock-tabs/docs/index.tsx')
    expect(tab).toContain('variant="body"')
    expect(tab).toContain('labels={MD_PREVIEW_MARKDOWN_LABELS}')
    const drawer = read('plugins/knowledge/ui/EntryDrawer.tsx')
    expect(drawer).toContain('variant="body"')
    expect(drawer).toContain('labels={MD_PREVIEW_MARKDOWN_LABELS}')
    // 分段链退役：产品源零残留引用（doc-segments / MdSegmentsBody / MdPreviewBody / MermaidDiagram）
    const offenders: string[] = []
    for (const p of walkAll(PRODUCT_SRC_ROOTS)) {
      if (!/\.(ts|tsx)$/.test(p) || p.endsWith('.test.ts') || p.endsWith('.test.tsx')) continue
      const src = readFileSync(p, 'utf8')
      if (/doc-segments|MdSegmentsBody|MdPreviewBody|MermaidDiagram/.test(src)) offenders.push(p.replaceAll('\\', '/'))
    }
    expect(offenders, `分段链残留引用: ${offenders.join(', ')}`).toEqual([])
  })

  it('labels 常量单源：MD_PREVIEW_MARKDOWN_LABELS 定义唯一定居点 = components/MarkdownDoc（冻结常量——引用稳定纪律同 DEFAULT_MARKDOWN_LABELS）', () => {
    const md = read('apps/web/src/components/MarkdownDoc.tsx')
    expect(md).toContain('export const MD_PREVIEW_MARKDOWN_LABELS')
    expect(md).toContain('toolbarLabels')
    expect(md).toContain('Object.freeze')
  })
})

describe('workbench 工作台装配 pin（2.12 + 3.8 → fix-25 官方基座降位形态）', () => {
  it('模块面就位：壳宿主 + 面板模型 + 桥 + 样式 + barrel；hero/知识面板/dock tab 本体落插件包（1.45 迁移——装配缝归插件域）', () => {
    for (const f of [
      'apps/web/src/workbench/ShellHost.tsx',
      // 1.45 迁移：dock tab 族随 @dsh-forge/project（ui/dock-tabs/）
      'plugins/project/ui/dock-tabs/dock-tabs.tsx',
      // hero 两件随 @dsh-forge/project（ui/hero/）；知识面板随 @dsh-forge/knowledge（ui/）
      'plugins/project/ui/hero/HeroPanel.tsx',
      'plugins/project/ui/hero/HeroEmpty.tsx',
      'plugins/knowledge/ui/KnowledgePanel.tsx',
      'apps/web/src/workbench/panel-model.ts',
      'apps/web/src/workbench/workbench-bridge.ts',
      'apps/web/src/workbench/workbench.css',
      'apps/web/src/workbench/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/workbench/index.ts')
    for (const name of ['ShellHost', 'anchored-projects', 'panel-model', 'workbench-bridge']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
    // 3.8：知识视图装配壳 + 召回 tab 数据面（跨视图互禁——跳转经桥）
    expect(existsSync(join(ROOT, 'plugins/knowledge/ui/KnowledgeView.tsx')), 'KnowledgeView 缺席').toBe(true)
    // fix-29 退役 pin：产品轨迹台账/转录投影死代码缺席（轨迹 = 官方 ui-trajectory 直用）
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/TrajectoryLedger.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/transcript.ts'))).toBe(false)
    // 1.45 迁移退役面：壳侧 session/knowledge 旧位本体随迁移清退（本体在插件包）
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/RecallTab.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/recall-model.ts'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/ForgeEventEntries.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/DispatchToolRow.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/client-plugin/forge-event-node.ts'))).toBe(false)
  })

  it('Hard Rule hero 单一条件：呈现判据唯一落点 sessionZonePhase（正零才 hero），HeroEmpty 零判据零数据源', () => {
    const model = read('apps/web/src/workbench/panel-model.ts')
    expect(model).toContain('export function sessionZonePhase')
    expect(model).toContain('input.lastReadyCount === 0')
    const hero = read('plugins/project/ui/hero/HeroEmpty.tsx')
    expect(hero).not.toMatch(/projects|useForgeProjects|phase/)
    expect(hero).toContain('添加项目')
    // fix-17：CTA 图标位 = 官方 IconProjectAddOutlineRegular（文本前缀 ％＋ 退役）
    expect(hero).toContain('IconProjectAddOutlineRegular')
  })

  it('装配发布 pin：product-views 发布官方缝占用者族 + 桥工厂（hero/knowledge 面板与 dock tab 族注册面随 1.45 迁插件 bundle——壳发布面零该键；fix-29 轨迹视图退役；m3.1 D5 会话头 pill 发布退役；4.7 设置分区退役；1.6 sidebar.workspaces 退役）', () => {
    const views = read('apps/web/src/product-views.ts')
    for (const name of [
      'ForgeBrandMark',
      'ForgeBrandName',
      'ForgeShellHost',
      'createWorkbenchBridge',
    ]) {
      expect(views, `${name} 未发布`).toContain(name)
    }
    // 退役 pin：以下占用者注册面/组件本体已迁插件 bundle——壳发布面零该键
    // （头注迁移记事含键名叙事——发布键断言只 pin 结构面 interface ForgePublishedViews 域）
    expect(views).not.toContain('ForgeTrajectoryView') // fix-29：轨迹 = 官方 ui-trajectory 直用
    expect(views).not.toContain('ForgeSessionTaskPills') // m3.1 D5：会话头挂接 pill 槽位卸载
    expect(views).not.toContain('ForgeSettingsSection') // 4.7：配置主权归 expert-squad 配置 tab
    expect(views).not.toContain('ForgeSidebarSlot') // 1.6：sidebar.workspaces 迁 @dsh-forge/project
  })

  it('工作台桥键面一致：workbench-bridge（发布侧 + 读取侧同模块）键 __DSH_FORGE_WORKBENCH__；e2e bridgeDispatch 面保持', () => {
    expect(read('apps/web/src/workbench/workbench-bridge.ts')).toContain('__DSH_FORGE_WORKBENCH__')
  })
})

describe('m3.1 D35 按钮风格对齐 pin（toolbar 深灰异类清零——官方全量 0 用，图标钮 = ghost 官方语言）', () => {
  const tagOf = (file: string, marker: string): string => {
    const src = read(file)
    const tag = src.match(new RegExp(`<Button[^>]*${marker}[^>]*>`))
    expect(tag, `${file} 缺 ${marker} 钮`).not.toBeNull()
    return tag![0]
  }

  it('机械清零：产品源 Button variant="toolbar" 零在场（官方 dsh 全包 0 用——深灰常驻底片 #54555780 异类）', () => {
    const offenders: string[] = []
    for (const p of walkAll(PRODUCT_SRC_ROOTS)) {
      if (!/\.(ts|tsx)$/.test(p) || p.endsWith('.test.ts') || p.endsWith('.test.tsx')) continue
      if (readFileSync(p, 'utf8').includes('variant="toolbar"')) offenders.push(p.replaceAll('\\', '/'))
    }
    expect(offenders, `toolbar 变体残留（对齐官方图标钮 ghost 形）: ${offenders.join(', ')}`).toEqual([])
  })

  it('九位对齐 pin：折叠/关闭/搜索清除/展开/行操作图标钮 = 官方 ghost（透明底 + hover interactive-bg-hover——数据锚与 aria 原样）', () => {
    const ghostSites: readonly (readonly [file: string, marker: string, note: string])[] = [
      // 1.13 迁移退役：面板正本迁 @dsh-forge/task-loop（ui/dispatch-events-panel/）——ghost 钮 pin 改指迁地面
      ['plugins/task-loop/ui/dispatch-events-panel/DispatchEventsPanel.tsx', 'data-dswf-dep-collapse', '悬浮进度流面板折叠钮（用户点名面继任——loop-event-delivery 1.8）'],
      ['plugins/knowledge/ui/EntryDrawer.tsx', 'data-dswf-kn-dialog-close', '知识详情弹窗关闭'],
      ['plugins/knowledge/ui/KnowledgeToolbar.tsx', 'dswf-kn-searchclear', '知识搜索清除'],
      ['plugins/project/ui/dock-tabs/overview/sticky-bar.tsx', 'data-dswf-ov-searchclear', '概览搜索清除'],
      ['plugins/project/ui/dock-tabs/overview/drawer/index.tsx', 'data-dswf-td-expand', '任务详情展开'],
      ['plugins/project/ui/dock-tabs/overview/drawer/index.tsx', 'data-dswf-td-close', '任务详情弹窗关闭（三态共锚）'],
      ['plugins/project/ui/dock-tabs/overview/task-tab/list-view.tsx', 'data-dswf-tt-more', '列表行 ⋯ 行操作'],
    ]
    for (const [file, marker, note] of ghostSites) {
      const tag = tagOf(file, marker)
      expect(tag, `${note}（${marker}）须为官方 ghost 图标钮形`).toContain('variant="ghost"')
      expect(tag, `${note}（${marker}）不得残留 toolbar 形`).not.toContain('variant="toolbar"')
    }
  })
})
