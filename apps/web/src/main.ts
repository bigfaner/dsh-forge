// @dsh-forge/web vite 入口（定位：装配——官方 apps/web 母本模式）。
// 壳内核 = @deepseek-ai/dsh-client-web AppWebEntry（boot 页 → 模块系统 → 官方 ui-* 组合 →
// UI renderer 挂载 #root）；boot manifest 消费与掌舵（carrier → applyIndexInjections →
// 产品插件入图 → 就绪门放行）归 shell/。两线并行：run() 在就绪门上等待，bootShell 放行或
// reject（reject → 门 await 抛出 → 壳内核 boot 页渲染失败因——母本失败呈现路径）。
// product-views.js（求值期发布 __DSH_FORGE_VIEWS__）：client 插件槽位注册的组件源——
// 必先于插件 bundle 装载（同步 import 序保证）。
import '@deepseek-ai/dsh-client-ui-theme/brand-font.css'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import './styles/global.css'
import './styles/brand.css'
import './styles/wco.css'
import './styles/cursors.css'
import './product-views.js'
import { bootShell, type ProductClientEntry } from './shell/index.js'
import { ForgeRemoteView } from './views/remote/ForgeRemoteView.js'
import { isRestrictedRemoteViewCookie, isRestrictedRemoteViewLocation } from './views/remote/remote-view-model.js'

// 产品 client 插件掌舵入图描述（bundle = vite 第二入口产物 forge-client.js；rev = 构建戳）。
// id 字面量与 client-plugin/plugin.ts 的 FORGE_CLIENT_PLUGIN_ID 同源——不经 import 共享
// （共享会把 plugin.ts 拆成公共 chunk，破坏 client 入口自含形状）；同源由 plugin.test pin。
declare const __DSH_FORGE_BUILD_REV__: string
const productClient: ProductClientEntry = {
  id: '@dsh-forge/web-client',
  url: `forge-client.js?rev=${__DSH_FORGE_BUILD_REV__}`,
  rev: __DSH_FORGE_BUILD_REV__,
}

const el = document.getElementById('root')
if (el === null) throw new Error('dsh-forge web: #root 挂载点缺席')

// 手机受限视图分支（mobile-remote-approval 1.3）：`?forgeRemote=1` = 独立单页直挂——
// 不进官方壳（无侧栏/dock/对话，暴露面边界 = 渲染范围本身）；未配对/数据面不可达由
// 组件内回退配对引导页（官方配对流承载）。
// fix-8：`?forgePair=1` 配对独立窗分支退役（配对面承载改回主窗内官方 Modal dialog）。
// fix-18 ⑤：并联 cookie 读数缝——官方 BrowserAuth 303 "./" 剥查询串，/pair 成功面设
// dswf_forge_remote=1（host child.ts 单源）跨重定向存活，手机扫码恒落受限移动视图。
if (isRestrictedRemoteViewLocation(window.location) || isRestrictedRemoteViewCookie(document.cookie)) {
  createRoot(el).render(createElement(ForgeRemoteView))
} else {
  const entry = new AppWebEntry(el)
  void bootShell(productClient)
  void entry.run()
}
