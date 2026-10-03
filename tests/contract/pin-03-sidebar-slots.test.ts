// G1 pin ③：slot 洞名（`sidebar` / `sidebar.workspaces` / 子洞）与 injected props。
// 权威：tech-design Appendix 契约面清单第 3 项 + Integration「产品 sidebar 替换 → 官方
// ui-sidebar 壳（槽位路线 A）」；S2 残留 #1 经 2.7 清点入池（本文件即处置）。上游面（0.2.0-rc.2）：
//   - dsh-client-ui-sidebar `lib/types/client/contract/slots.d.ts`：壳声明的 7 洞 SlotMap 增强 +
//     各洞 Sidebar*OwnerProps（「声明即占有」——跨壳/区边界只传 owner 事实，业务数据走注册方 inject）
//   - dsh-client-ui-layout `lib/types/client/index.d.ts`：布局拥有的根槽 'sidebar'
//     （single/root/SidebarOwnerProps——壳列组件的挂载位，壳拥有几何/收展）
//   - dsh.client 声明：ui-sidebar 组合依赖 7 包 + platform web
// 我方镜像：apps/web/src/client-plugin/plugin.ts（洞名常量 + 影子 priority + 注入面形状）。
// Hard Rule 边界：只 pin 洞名/kind/scope/owner props 形状与 dsh.client 常量；single 槽
// priority 升序最低者渲染的运行期决议机制不文本 pin（属 ui-slots 实现细节，e2e 2.7 已实证）。
import { describe, expect, it } from 'vitest'
import {
  FORGE_CLIENT_INJECT,
  SIDEBAR_BRAND_MARK_SLOT,
  SIDEBAR_BRAND_NAME_SLOT,
  SIDEBAR_SHADOW_PRIORITY,
  SIDEBAR_WORKSPACES_SLOT,
} from '../../apps/web/src/client-plugin/plugin.js'
import {
  dshClientDecl,
  expectPinnedVersion,
  interfaceMembers,
  norm,
  readTypes,
  readUpstream,
  slotHole,
  slotMapKeys,
} from './pins.js'

const SIDEBAR_SLOTS_FILE = 'lib/types/client/contract/slots.d.ts'
const rawSlots = () => readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar', SIDEBAR_SLOTS_FILE)

describe('pin ③-1 版本锚（profile 组合物化：boot manifest 经 profile 装载的官方 ui-*）', () => {
  it('dsh-client-ui-sidebar = 精确 pin 版本', () => {
    expectPinnedVersion('profile', '@deepseek-ai/dsh-client-ui-sidebar')
  })
  it('dsh-client-ui-layout（根槽 sidebar 声明方）= 精确 pin 版本', () => {
    expectPinnedVersion('profile', '@deepseek-ai/dsh-client-ui-layout')
  })
})

describe('pin ③-2 壳洞名全集（SlotMap 增强块 7 洞）', () => {
  it('洞名全集 = 7 洞（toggle.badge / brand.mark / brand.name / panellist / workspaces / settings / footer.action）', () => {
    expect(slotMapKeys(rawSlots())).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'sidebar.footer.action',
      'sidebar.panellist',
      'sidebar.settings',
      'sidebar.toggle.badge',
      'sidebar.workspaces',
    ])
  })

  it('sidebar.workspaces 洞 = single/root/SidebarSectionOwnerProps（工作区浏览区——替换目标）', () => {
    expect(slotHole(rawSlots(), 'sidebar.workspaces')).toContain(
      "kind: 'single'; scope: 'root'; owner: SidebarSectionOwnerProps;",
    )
  })

  it('品牌行内容洞 = brand.mark（size 几何）/ brand.name（占位者自持内容）', () => {
    expect(slotHole(rawSlots(), 'sidebar.brand.mark')).toContain("kind: 'single'")
    expect(slotHole(rawSlots(), 'sidebar.brand.mark')).toContain('owner: SidebarBrandMarkOwnerProps')
    expect(slotHole(rawSlots(), 'sidebar.brand.name')).toContain('owner: SidebarBrandNameOwnerProps')
  })
})

describe('pin ③-3 injected props（owner props 形状——跨壳/区边界的全部事实）', () => {
  const raw = rawSlots()
  const types = norm(raw)

  it('SidebarSectionOwnerProps = {wide, expandSidebar}（折叠态输出 + 展开请求）', () => {
    expect(interfaceMembers(raw, 'SidebarSectionOwnerProps')).toEqual(['expandSidebar', 'wide'])
    expect(types).toMatch(/export interface SidebarSectionOwnerProps \{[^}]*wide: boolean/)
    expect(types).toMatch(/export interface SidebarSectionOwnerProps \{[^}]*expandSidebar: \(\) => void/)
  })

  it('SidebarBrandMarkOwnerProps = {size}（方形图标请求边长）；BrandName = {children?: never}', () => {
    expect(interfaceMembers(raw, 'SidebarBrandMarkOwnerProps')).toEqual(['size'])
    expect(interfaceMembers(raw, 'SidebarBrandNameOwnerProps')).toEqual(['children'])
    expect(types).toContain('children?: never')
  })

  it('洞内业务数据不经 owner props（「Business data and actions arrive through the region\'s own inject」）', () => {
    expect(types).toContain("Business data and actions arrive through the region's own inject")
  })
})

describe('pin ③-4 根槽 sidebar（布局拥有的壳列挂载位）', () => {
  it("ui-layout SlotMap 声明 'sidebar' 洞 = single/root/SidebarOwnerProps（壳列挂载位）", () => {
    const layout = readTypes('profile', '@deepseek-ai/dsh-client-ui-layout', 'lib/types/client/index.d.ts')
    expect(layout).toContain("'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps; }")
    expect(layout).toContain('receives the frame\'s live column state')
  })
})

describe('pin ③-5 dsh.client 声明（组合依赖常量面）', () => {
  it('ui-sidebar：platform=web + inject 7 包（renderer/ui 组合，按上游声明序）', () => {
    const decl = dshClientDecl('profile', '@deepseek-ai/dsh-client-ui-sidebar')
    expect(decl['platform']).toBe('web')
    expect(decl['inject']).toEqual([
      '@deepseek-ai/dsh-api-workspace-controller',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-session',
      '@deepseek-ai/dsh-client-ui-workspace',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-shortcuts',
    ])
  })
})

describe('pin ③-6 我方镜像兼容（apps/web client-plugin 槽位路线 A）', () => {
  it('洞名常量 = 上游洞名（workspaces 替换目标 + 品牌行两内容洞）', () => {
    expect(SIDEBAR_WORKSPACES_SLOT).toBe('sidebar.workspaces')
    expect(SIDEBAR_BRAND_MARK_SLOT).toBe('sidebar.brand.mark')
    expect(SIDEBAR_BRAND_NAME_SLOT).toBe('sidebar.brand.name')
  })

  it('影子 priority -100 < 官方占用者缺省 0（single 槽 lowest renders——替换而非并存）', () => {
    expect(SIDEBAR_SHADOW_PRIORITY).toBeLessThan(0)
  })

  it('插件服务依赖 = slots + sessions + uiWorkspace + workspaces（fix-11：会话打开面 = uiWorkspace.openSession——Session Controller 无 open 面；官方 ui-workspace 同型先例）', () => {
    expect([...FORGE_CLIENT_INJECT]).toEqual(['slots', 'sessions', 'uiWorkspace', 'workspaces'])
  })
})
