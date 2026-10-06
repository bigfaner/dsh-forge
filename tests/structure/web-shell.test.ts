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
      'apps/web/src/workbench/HeroPanel.tsx',
      'apps/web/src/workbench/KnowledgePanel.tsx',
      'apps/web/src/workbench/panel-model.ts',
      'apps/web/src/workbench/workbench-bridge.ts',
      'apps/web/src/views/session/ConversationViews.tsx',
      'apps/web/src/views/sidebar/KnowledgeGlyph.tsx',
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
    ]) {
      expect(existsSync(join(ROOT, retired)), `${retired} 应已退役（fix-25）`).toBe(false)
    }
  })

  it('main.conversation 影子登记缺席（官方头部链白拿的机制面）+ 官方缝登记在场（main roster/panellist/页签 roster/shell.overlay）', () => {
    const plugin = read('apps/web/src/client-plugin/plugin.ts')
    expect(plugin).not.toContain("name: MAIN_CONVERSATION_SLOT")
    expect(plugin).not.toContain("'main.conversation'")
    expect(plugin).toContain("key: HERO_PANEL_KEY")
    expect(plugin).toContain("key: KNOWLEDGE_PANEL_KEY")
    expect(plugin).toContain('name: SIDEBAR_PANELLIST_SLOT')
    expect(plugin).toContain('name: CONVERSATION_VIEW_SLOT')
    expect(plugin).toContain('name: SHELL_OVERLAY_SLOT')
    // 面板 key 字面量同源（plugin 侧 ↔ 壳侧 panel-model——bundle 自含不经 import）
    expect(plugin).toContain("export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'")
    expect(plugin).toContain("export const HERO_PANEL_KEY = 'dswf-hero'")
    const model = read('apps/web/src/workbench/panel-model.ts')
    expect(model).toContain("export const KNOWLEDGE_PANEL_KEY = 'dswf-knowledge'")
    expect(model).toContain("export const HERO_PANEL_KEY = 'dswf-hero'")
  })

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

describe('views/session 会话页签族 pin（2.11 → fix-25 官方 roster 形态 → fix-29 轨迹官方直用）', () => {
  it('模块面就位：视图占用者族 + 召回数据面 + 样式 + barrel；fix-29 退役面缺席（台账/转录投影）', () => {
    for (const f of [
      'apps/web/src/views/session/ConversationViews.tsx',
      'apps/web/src/views/session/RecallTab.tsx',
      'apps/web/src/views/session/recall-model.ts',
      'apps/web/src/views/session/session.css',
      'apps/web/src/views/session/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/views/session/index.ts')
    for (const name of ['ConversationViews', 'RecallTab']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
    // fix-29 退役 pin：产品轨迹台账/转录投影死代码缺席（轨迹 = 官方 ui-trajectory 直用）
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/TrajectoryLedger.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/transcript.ts'))).toBe(false)
  })

  it('官方 roster 占用 pin：召回视图登记 id + pane 锚保持；fix-29 轨迹零登记（对话/轨迹 = 官方 chat/trajectory 直用）', () => {
    const views = read('apps/web/src/views/session/ConversationViews.tsx')
    expect(views).toContain('data-dswf-pane="recall"')
    expect(views).not.toContain('data-dswf-pane="trajectory"')
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

  it('AC4 形态对齐官方 dockkit 抽屉形态：层级令牌 + 抬升面 + 滑入动画 + 右缘全高（不自发明平行模式）', () => {
    const css = read('apps/web/src/views/knowledge/knowledge.css')
    expect(css).toContain('.dswf-kn-drawer {')
    expect(css).toContain('z-index: var(--dsh-dockkit-float-layer, 60)')
    expect(css).toContain('box-shadow: var(--dsw-elevation-prominent)')
    expect(css).toMatch(/@keyframes dswf-kn-drawer-in/)
    expect(css.match(/\.dswf-kn-drawer \{[\s\S]*?position: fixed;/)).not.toBeNull()
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

describe('views/docs 文档 tab pin（3.9——mermaid 懒加载 + strict 安全边界）', () => {
  it('模块面就位：分段解析 + mermaid 渲染件 + tab 体 + 样式', () => {
    for (const f of [
      'apps/web/src/views/docs/doc-segments.ts',
      'apps/web/src/views/docs/mermaid-diagram.tsx',
      'apps/web/src/views/docs/index.tsx',
      'apps/web/src/views/docs/docs.css',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
  })

  it('mermaid 产品依赖精确 pin（无 ^/~ 前缀）+ lockfile 在册', () => {
    const pkg = read('apps/web/package.json')
    expect(pkg).toMatch(/"mermaid":\s*"\d+\.\d+\.\d+"/)
    expect(pkg).not.toMatch(/"mermaid":\s*"\^/)
    expect(read('pnpm-lock.yaml')).toMatch(/mermaid@\d+\.\d+\.\d+:/)
  })

  it('Hard Rule 懒加载：mermaid 唯一动态 import 径（产品源零静态 import——仅 mermaid-diagram.tsx 一处 import()）', () => {
    const offenders: string[] = []
    let dynamicRefs = 0
    for (const p of walk(join(ROOT, 'apps/web/src'))) {
      if (!/\.(ts|tsx)$/.test(p) || p.endsWith('.test.ts') || p.endsWith('.test.tsx')) continue
      const src = readFileSync(p, 'utf8')
      if (/from\s+'mermaid'/.test(src)) offenders.push(p.replaceAll('\\', '/'))
      if (/import\('mermaid'\)/.test(src)) dynamicRefs += 1
    }
    expect(offenders, `mermaid 静态 import（禁——懒加载唯一动态径）: ${offenders.join(', ')}`).toEqual([])
    expect(dynamicRefs, '动态 import 恰一处（mermaid-diagram.tsx 装载径）').toBe(1)
    const mermaid = read('apps/web/src/views/docs/mermaid-diagram.tsx')
    expect(mermaid).toContain("import('mermaid')")
  })

  it('Hard Rule 安全边界：securityLevel=strict 字面量 + 禁 click 交互绑定 + 回退占位卡在场', () => {
    const mermaid = read('apps/web/src/views/docs/mermaid-diagram.tsx')
    expect(mermaid).toContain("securityLevel: 'strict'")
    expect(mermaid, '禁放宽 securityLevel（loose/antiscript/xss 均禁）').not.toMatch(/securityLevel[^\n]*'(loose|antiscript|xss)'/)
    expect(mermaid, '禁 click 回调交互绑定（strict 面——bindFunctions 恒不接）').not.toContain('bindFunctions')
    expect(mermaid).toContain('dswf-doc-mermaid-fallback')
    expect(mermaid).toContain('已回退为源码展示')
  })

  it('渲染纪律 + 数据面：正文 md 段唯一经 MarkdownDoc；数据唯一通道 = docs.read（悬空容忍）+ openExternal 恒经触发即忘包装', () => {
    const tab = read('apps/web/src/views/docs/index.tsx')
    expect(tab).toContain('MarkdownDoc')
    expect(tab, '裸渲染器禁直用（须经 MarkdownDoc 包装）').not.toContain('MarkdownText')
    expect(tab).toContain('client.docs.read')
    // openExternal 触发即忘：组件回调恒经 openDocExternal 包装（失败吞不炸 tab）
    expect(tab).toContain('export async function openDocExternal')
    expect(tab).toContain('void openDocExternal(makeClient()')
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

describe('workbench 工作台装配 pin（2.12 + 3.8 → fix-25 官方基座降位形态）', () => {
  it('模块面就位：壳宿主 + main 面板族 + hero 纯渲染件 + 面板模型 + 桥 + 样式 + barrel', () => {
    for (const f of [
      'apps/web/src/workbench/ShellHost.tsx',
      'apps/web/src/workbench/HeroPanel.tsx',
      'apps/web/src/workbench/HeroEmpty.tsx',
      'apps/web/src/workbench/KnowledgePanel.tsx',
      'apps/web/src/workbench/panel-model.ts',
      'apps/web/src/workbench/workbench-bridge.ts',
      'apps/web/src/workbench/workbench.css',
      'apps/web/src/workbench/index.ts',
    ]) {
      expect(existsSync(join(ROOT, f)), `${f} 缺席`).toBe(true)
    }
    const barrel = read('apps/web/src/workbench/index.ts')
    for (const name of ['ShellHost', 'HeroPanel', 'HeroEmpty', 'KnowledgePanel', 'panel-model', 'workbench-bridge']) {
      expect(barrel, `${name} 未出 barrel`).toContain(`export * from './${name}.js'`)
    }
    // 3.8：知识视图装配壳 + 召回 tab 数据面（跨视图互禁——跳转经桥）
    expect(existsSync(join(ROOT, 'apps/web/src/views/knowledge/KnowledgeView.tsx')), 'KnowledgeView 缺席').toBe(true)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/RecallTab.tsx')), 'RecallTab 缺席').toBe(true)
    expect(existsSync(join(ROOT, 'apps/web/src/views/session/recall-model.ts')), 'recall-model 缺席').toBe(true)
  })

  it('Hard Rule hero 单一条件：呈现判据唯一落点 sessionZonePhase（正零才 hero），HeroEmpty 零判据零数据源', () => {
    const model = read('apps/web/src/workbench/panel-model.ts')
    expect(model).toContain('export function sessionZonePhase')
    expect(model).toContain('input.lastReadyCount === 0')
    const hero = read('apps/web/src/workbench/HeroEmpty.tsx')
    expect(hero).not.toMatch(/projects|useForgeProjects|phase/)
    expect(hero).toContain('添加项目')
    // fix-17：CTA 图标位 = 官方 IconProjectAddOutlineRegular（文本前缀 ％＋ 退役）
    expect(hero).toContain('IconProjectAddOutlineRegular')
  })

  it('装配发布 pin：product-views 发布官方缝占用者族 + 桥工厂（client-plugin 登记面同键集；fix-29 轨迹视图退役）', () => {
    const views = read('apps/web/src/product-views.ts')
    for (const name of [
      'ForgeSidebarSlot',
      'ForgeShellHost',
      'ForgeHeroPanel',
      'ForgeKnowledgePanel',
      'ForgeKnowledgeGlyph',
      'ForgeRecallView',
      'createWorkbenchBridge',
    ]) {
      expect(views, `${name} 未发布`).toContain(name)
    }
    // fix-29 退役 pin：产品轨迹视图不再发布（轨迹 = 官方 ui-trajectory 直用）
    expect(views).not.toContain('ForgeTrajectoryView')
  })

  it('工作台桥键面一致：workbench-bridge（发布侧 + 读取侧同模块）键 __DSH_FORGE_WORKBENCH__；e2e bridgeDispatch 面保持', () => {
    expect(read('apps/web/src/workbench/workbench-bridge.ts')).toContain('__DSH_FORGE_WORKBENCH__')
  })
})
