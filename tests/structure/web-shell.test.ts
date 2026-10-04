// 任务 1.5 结构 pin —— 壳接入装配纪律（源面同步 + vite 产物形状 + 令牌面就位）。
// 权威：tech-design Integration「boot manifest 掌舵 → dsh-client-web 壳内核」+ S2 清单。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

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
      'apps/web/src/shell/view-state.ts',
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

describe('zones 三区骨架 pin（2.5）', () => {
  it('模块面就位：容器/槽位/dock 跟随/dock 基座映射/barrel/样式 + shell 视图态机对接 hook', () => {
    for (const f of [
      'apps/web/src/zones/WorkbenchZones.tsx',
      'apps/web/src/zones/slots.ts',
      'apps/web/src/zones/dock.ts',
      'apps/web/src/zones/dock-kit.ts',
      'apps/web/src/zones/zones.css',
      'apps/web/src/zones/index.ts',
      'apps/web/src/shell/use-shell-view.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    expect(read('apps/web/src/zones/index.ts')).toContain("export * from './WorkbenchZones.js'")
    expect(read('apps/web/src/shell/index.ts')).toContain("export * from './use-shell-view.js'")
  })

  it('UF-7 默认收起 pin（view-state 初始态与恢复口径）+ dock 轨道归零样式', () => {
    const viewState = read('apps/web/src/shell/view-state.ts')
    expect(viewState).toContain('rightDock: false') // 初始收起（轨道归零；PRD UF-7 默认）
    expect(viewState).toContain('rightDockPreference ?? false') // 无显式偏好恢复默认收起
    const css = read('apps/web/src/zones/zones.css')
    expect(css).toContain('width: 0') // 收起轨道归零（原型同型）
    expect(css).toMatch(/data-dswf-dock=collapsed/)
    expect(css).toMatch(/data-dswf-dock=hidden/)
  })

  it('fix-10 官方 dockkit 基座 pin：右栏 = 官方面（DockController/DockLayout），自研轨道退役', () => {
    const zones = read('apps/web/src/zones/WorkbenchZones.tsx')
    expect(zones).toContain("from '@deepseek-ai/dsh-client-ui-dockkit'") // 依赖口径：官方静态装配线（S2；版本 pin 0.2.0-rc.2）
    expect(zones).toContain('DockLayout') // 横条形右栏 = README 推荐 Sidebar 形态件
    expect(zones).not.toContain('SegmentedTabs') // 自研页签条退役（官方 chips 承接）
    expect(zones).not.toContain('dswf-zones-dock-resize') // 自研调宽手柄退役（fix-4 路线）
    expect(existsSync(join(ROOT, 'apps/web/src/zones/dock-width.ts')), 'dock-width.ts 应已退役').toBe(false)
    const dockKit = read('apps/web/src/zones/dock-kit.ts')
    expect(dockKit).toContain('DOCK_LABELS_ZH') // 文案全中文化（DockLabels 契约产品供文案）
    expect(dockKit).toContain('syncDockTabs') // 页签跟随项目 = 官方 intents 驱动路径
    expect(dockKit).toContain('setExpanded') // rightDock ↔ 官方 expanded 映射（view-state 零改动）
    const css = read('apps/web/src/zones/zones.css')
    expect(css).toMatch(/data-dockkit-strip/) // WCO 避让经容器级官方锚（官方 strip 无自避让面）
    expect(css).not.toContain('--dswf-dock-width') // 容器宽度态退役（官方 collapsed/expanded 呈现语义接管）
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

  it('Hard Rule 渲染纪律：MarkdownText 裸渲染器仅 MarkdownDoc 一处 import（产品内其余禁直用）', () => {
    const offenders: string[] = []
    for (const p of walk(join(ROOT, 'apps/web/src'))) {
      if (!/\.(ts|tsx)$/.test(p) || p.endsWith('.test.tsx') || p.endsWith('.test.ts')) continue
      const src = readFileSync(p, 'utf8')
      if (/from '@deepseek-ai\/dsh-client-ui-primitives'/.test(src) && /MarkdownText/.test(src)) {
        if (!p.replaceAll('\\', '/').endsWith('components/MarkdownDoc.tsx')) {
          offenders.push(p.replaceAll('\\', '/'))
        }
      }
    }
    expect(offenders, `裸渲染器直用（须改经 MarkdownDoc 包装）: ${offenders.join(', ')}`).toEqual([])
    expect(read('apps/web/src/components/MarkdownDoc.tsx')).toContain(
      "import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'",
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

describe('views/session 会话面板 pin（2.11）', () => {
  it('模块面就位：面板组装 + 台账行组件 + 转录投影 + 样式 + barrel', () => {
    for (const f of [
      'apps/web/src/views/session/SessionPanel.tsx',
      'apps/web/src/views/session/TrajectoryLedger.tsx',
      'apps/web/src/views/session/transcript.ts',
      'apps/web/src/views/session/session.css',
      'apps/web/src/views/session/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/views/session/index.ts')
    for (const name of ['SessionPanel', 'TrajectoryLedger', 'transcript']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
  })

  it('Hard Rule 官方件复用：对话面 = chatSurface 注入位（零自绘会话 UI）+ 页签条 = 官方 ConversationRoot 页签行语言（fix-13）', () => {
    const panel = read('apps/web/src/views/session/SessionPanel.tsx')
    expect(panel).toContain('readonly chatSurface: ReactNode')
    // fix-13 决策变更：SegmentedTabs 分段控件退役 → 官方 .tabs/.tab/.tabActive 行语言复刻
    //（官方主题无公开页签件可 import——刻度实值 dsw-raw 注记，pin 新决策形态）
    expect(panel).toContain('dswf-session-header')
    expect(panel).toContain('dswf-session-tabs')
    expect(panel).toContain('role="tab"')
    // SegmentedTabs 分段控件于会话面板退役（import 面随形态退役——官方行语言复刻接管）
    expect(panel).not.toMatch(/import\s*\{[^}]*SegmentedTabs/)
    // 零自绘会话 UI：面板源不含消息气泡/输入框类自绘组件面（转录/输入/滚动全归官方注入面）
    expect(panel).not.toMatch(/composer|textarea|messageInput/i)
  })

  it('AC-4 keep-alive 机制 pin：三 pane 常挂载（hidden 切显隐不卸载）+ hidden 守卫样式', () => {
    const panel = read('apps/web/src/views/session/SessionPanel.tsx')
    for (const pane of ['chat', 'trajectory', 'recall']) {
      expect(panel, `pane ${pane} 缺席`).toContain(`data-dswf-pane="${pane}"`)
    }
    expect(panel).toContain('hidden={activeTab !== ')
    const css = read('apps/web/src/views/session/session.css')
    expect(css).toContain('.dswf-session-pane[hidden]')
  })

  it('AC-5 召回占位 pin：缺省 EmptyState 文案 + recall 注入接线位', () => {
    const panel = read('apps/web/src/views/session/SessionPanel.tsx')
    expect(panel).toContain('本会话暂无召回')
    expect(panel).toContain('readonly recall?: ReactNode')
  })
})

describe('views/knowledge 知识浏览 pin（3.6）', () => {
  it('模块面就位：纯模型 + 装载 hook + 三件（工具栏/域树/网格）+ 装配 + 样式 + barrel', () => {
    for (const f of [
      'apps/web/src/views/knowledge/browse-model.ts',
      'apps/web/src/views/knowledge/use-knowledge-browse.ts',
      'apps/web/src/views/knowledge/KnowledgeToolbar.tsx',
      'apps/web/src/views/knowledge/DomainTree.tsx',
      'apps/web/src/views/knowledge/KnowledgeCardGrid.tsx',
      'apps/web/src/views/knowledge/KnowledgeBrowse.tsx',
      'apps/web/src/views/knowledge/knowledge.css',
      'apps/web/src/views/knowledge/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/views/knowledge/index.ts')
    for (const name of ['browse-model', 'DomainTree', 'KnowledgeBrowse', 'KnowledgeCardGrid', 'KnowledgeToolbar', 'use-knowledge-browse']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
  })

  it('Hard Rule 域过滤前缀语义：domainPrefix 唯一透传点（entriesQueryOf）——网格/树零客户端过滤逻辑', () => {
    const model = read('apps/web/src/views/knowledge/browse-model.ts')
    expect(model).toContain('query.domainPrefix = filter.domain')
    const grid = read('apps/web/src/views/knowledge/KnowledgeCardGrid.tsx')
    expect(grid, '网格不得自建过滤语义（cards 服务端结果原样渲染）').not.toMatch(/domainPrefix|\.filter\(/)
    const tree = read('apps/web/src/views/knowledge/DomainTree.tsx')
    expect(tree, '域树只投影聚合节点（计数语义归 core aggregateDomainTree）').not.toContain('domainPrefix')
  })

  it('Hard Rule 官方件复用 + 自绘限域：工具栏 = 官方 Input/Pill；卡片热度 = HeatBadge(card.heat 原样)', () => {
    const toolbar = read('apps/web/src/views/knowledge/KnowledgeToolbar.tsx')
    expect(toolbar).toContain("from '@deepseek-ai/dsh-client-ui-primitives'")
    expect(toolbar).toContain('Input')
    expect(toolbar).toContain('Pill')
    const grid = read('apps/web/src/views/knowledge/KnowledgeCardGrid.tsx')
    expect(grid).toContain('HeatBadge')
    expect(grid).toContain('count={card.heat}')
    expect(grid).toContain('StateChip')
    // 自绘面仅限领域组件类（域树行/卡片），吃令牌（knowledge.css 零裸值由 token-lint 机械执行）
    expect(read('apps/web/src/views/knowledge/knowledge.css')).toContain('.dswf-kn-dom-row')
    expect(read('apps/web/src/views/knowledge/knowledge.css')).toContain('.dswf-kn-card')
  })
})

describe('views/knowledge 详情抽屉 pin（3.7）', () => {
  it('模块面就位：EntryDrawer（hook + 纯渲染体 + 元数据投影）+ barrel 出口', () => {
    for (const f of ['apps/web/src/views/knowledge/EntryDrawer.tsx']) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/views/knowledge/index.ts')
    expect(barrel, 'EntryDrawer 未出 barrel').toContain("export * from './EntryDrawer.js'")
  })

  it('Hard Rule 渲染纪律 + 按需读取：正文唯一经 MarkdownDoc（variant=body）；数据唯一通道 = entryDetail（不预载全库）', () => {
    const drawer = read('apps/web/src/views/knowledge/EntryDrawer.tsx')
    expect(drawer).toContain('MarkdownDoc')
    expect(drawer, '裸渲染器禁直用（须经 MarkdownDoc 包装）').not.toContain('MarkdownText')
    expect(drawer).toContain('variant="body"')
    expect(drawer).toContain('client.knowledge.entryDetail')
    expect(drawer, '抽屉不预载全库（browse/listEntries/heat 均非详情通道）').not.toMatch(
      /\.knowledge\.(browse|listEntries|heat|sessionRecall)/,
    )
  })

  it('AC3 关闭路径：✕ 锚（顶栏行尾 aria-label）+ Esc 捕获接线（抽屉先于工具栏清空——浏览上下文保持）', () => {
    const drawer = read('apps/web/src/views/knowledge/EntryDrawer.tsx')
    expect(drawer).toContain('data-dswf-kn-drawer-close')
    expect(drawer).toContain('aria-label="关闭抽屉"')
    expect(drawer).toContain("addEventListener('keydown'")
    expect(drawer).toContain('stopPropagation')
  })

  it('AC4 形态对齐官方 dockkit 抽屉形态：层级令牌 + 抬升面 + 滑入动画 + 右缘全高（不自发明平行模式）', () => {
    const css = read('apps/web/src/views/knowledge/knowledge.css')
    expect(css).toContain('.dswf-kn-drawer {')
    expect(css).toContain('z-index: var(--dsh-dockkit-float-layer, 60)') // 层级 = dockkit 浮层同一级
    expect(css).toContain('box-shadow: var(--dsw-elevation-prominent)') // 抬升面 = dockkit .float 同配方
    expect(css).toMatch(/@keyframes dswf-kn-drawer-in/) // 滑入
    expect(css.match(/\.dswf-kn-drawer \{[\s\S]*?position: fixed;/)).not.toBeNull() // 右缘全高滑入层
  })
})

describe('workbench 工作台装配 pin（2.12 + 3.8）', () => {
  it('模块面就位：装配面板 + hero 相位 + 官方会话面嵌入 + 桥发布 + 样式 + barrel（3.8：知识视图/召回 tab 经 views 注入，M0 占位件已退役）', () => {
    for (const f of [
      'apps/web/src/workbench/WorkbenchPanel.tsx',
      'apps/web/src/workbench/HeroEmpty.tsx',
      'apps/web/src/workbench/ChatSurface.tsx',
      'apps/web/src/workbench/workbench-bridge.ts',
      'apps/web/src/workbench/workbench.css',
      'apps/web/src/workbench/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/workbench/index.ts')
    for (const name of ['ChatSurface', 'HeroEmpty', 'WorkbenchPanel', 'workbench-bridge']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
    // 3.8：知识视图装配壳 + 召回 tab 数据面（跨视图互禁——跳转经装配态）
    expect(existsSync(join(ROOT, 'apps/web/src/views/knowledge/KnowledgeView.tsx')), 'KnowledgeView 缺席').toBe(true)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/RecallTab.tsx')), 'RecallTab 缺席').toBe(true)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/recall-model.ts')), 'recall-model 缺席').toBe(true)
  })

  it('Hard Rule hero 单一条件：呈现判据唯一落点 sessionZonePhase（正零才 hero），HeroEmpty 零判据零数据源', () => {
    const panel = read('apps/web/src/workbench/WorkbenchPanel.tsx')
    expect(panel).toContain('export function sessionZonePhase')
    expect(panel).toContain('input.lastReadyCount === 0')
    const hero = read('apps/web/src/workbench/HeroEmpty.tsx')
    expect(hero).not.toMatch(/projects|useForgeProjects|phase/)
    expect(hero).toContain('添加项目')
    // fix-17：CTA 图标位 = 官方 IconProjectAddOutlineRegular（文本前缀 ％＋ 退役）
    expect(hero).toContain('IconProjectAddOutlineRegular')
  })

  it('装配占位注册 pin：product-views 发布 ForgeWorkbenchPanel；client-plugin 影子注册 main.conversation（与 sidebar 同键面）', () => {
    const views = read('apps/web/src/product-views.ts')
    expect(views).toContain('ForgeWorkbenchPanel')
    expect(views).toContain("./workbench/index.js")
    const plugin = read('apps/web/src/client-plugin/plugin.ts')
    expect(plugin).toContain("export const MAIN_CONVERSATION_SLOT = 'main.conversation'")
    expect(plugin).toContain('views.ForgeWorkbenchPanel')
  })

  it('工作台桥键面一致：workbench-bridge（发布侧）与 sidebar-actions（读取侧）同键 __DSH_FORGE_WORKBENCH__', () => {
    expect(read('apps/web/src/workbench/workbench-bridge.ts')).toContain('__DSH_FORGE_WORKBENCH__')
    expect(read('apps/web/src/views/sidebar/sidebar-actions.ts')).toContain('__DSH_FORGE_WORKBENCH__')
  })

  it('官方会话面嵌入配方 pin（S2 §2.1/§2.2，upstream ui-subagent 同型）：conversation.content 工厂 variant=embedded + conversation.session view=chat', () => {
    const chat = read('apps/web/src/workbench/ChatSurface.tsx')
    expect(chat).toContain("'conversation.content'")
    expect(chat).toContain("variant: 'embedded'")
    expect(chat).toContain("'conversation.session'")
    expect(chat).toContain("view: 'chat'")
  })
})
