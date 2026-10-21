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
import { bootShell, installPruneWatchdog, type ProductClientEntry } from './shell/index.js'
import { ForgeRemoteView } from './views/remote/ForgeRemoteView.js'
import {
  remoteViewDecisionLine,
  remoteViewDecisionOf,
} from './views/remote/remote-view-model.js'

// 产品 client 插件掌舵入图描述（bundle = vite 第二入口产物 forge-client.js；rev = 构建戳）。
// id 字面量与 client-plugin/plugin.ts 的 FORGE_CLIENT_PLUGIN_ID 同源——不经 import 共享
// （共享会把 plugin.ts 拆成公共 chunk，破坏 client 入口自含形状）；同源由 plugin.test pin。
declare const __DSH_FORGE_BUILD_REV__: string
const productClient: ProductClientEntry = {
  id: '@dsh-forge/web-client',
  url: `forge-client.js?rev=${__DSH_FORGE_BUILD_REV__}`,
  rev: __DSH_FORGE_BUILD_REV__,
}

// 独立插件包缺省装载行（composer-input-history-plugin/1.4）：bundle = vite 构建期原样
// 发射的 @dsh-forge/input-history dist/client.js（官方自注册 CJS，vite.config 发射插件）；
// id 字面量与本包 bundle-client.mjs PLUGIN_ID 同源（自注册头）——不 import（资产零代码耦合）。
// rev 同用构建戳（与掌舵 url 查询一致——模块系统 atRevision 契约）；inject = 装配期注入边
// （与本包 dsh.client 清单同源：装载序落在 session-controller 之后——ctx.sessions 运行期可达）。
const inputHistoryClient: ProductClientEntry = {
  id: '@dsh-forge/input-history',
  url: `input-history-client.js?rev=${__DSH_FORGE_BUILD_REV__}`,
  rev: __DSH_FORGE_BUILD_REV__,
  inject: ['@deepseek-ai/dsh-api-session-controller'],
}

// quote-reference 插件缺省装载行（super-composer/1.9，input-history 判例同构）：
// bundle = vite 构建期原样发射的 @dsh-forge/quote-reference dist/client.js；
// id/inject 与本包 package.json dsh.client 清单同源（vite.config 双真相源断言核销）。
const quoteReferenceClient: ProductClientEntry = {
  id: '@dsh-forge/quote-reference',
  url: `quote-reference-client.js?rev=${__DSH_FORGE_BUILD_REV__}`,
  rev: __DSH_FORGE_BUILD_REV__,
  inject: ['@deepseek-ai/dsh-api-session-controller'],
}

// super-composer 插件缺省装载行（super-composer/1.9，同上判例同构；包清单 inject 为空集）。
const superComposerClient: ProductClientEntry = {
  id: '@dsh-forge/super-composer',
  url: `super-composer-client.js?rev=${__DSH_FORGE_BUILD_REV__}`,
  rev: __DSH_FORGE_BUILD_REV__,
}

const el = document.getElementById('root')
if (el === null) throw new Error('dsh-forge web: #root 挂载点缺席')

// 手机受限视图分支（mobile-remote-approval 1.3）：`?forgeRemote=1` = 独立单页直挂——
// 不进官方壳（无侧栏/dock/对话，暴露面边界 = 渲染范围本身）；未配对/数据面不可达由
// 组件内回退配对引导页（官方配对流承载）。
// fix-8：`?forgePair=1` 配对独立窗分支退役（配对面承载改回主窗内官方 Modal dialog）。
// fix-22 诊断日志面②：落地判定决策行——两分支都记（branch/viaLocation/viaCookie +
// search/hash/referrer 读数），console 落浏览器面；fix-23 改 beacon 上报：GET /__rvdiag
// （host child.ts 只读上报端点，无鉴权依赖）fire-and-forget——手机浏览器 console 不可
// 回传，落地决策行经宿主落 harness.log 才可达。
// fix-18 ⑤：并联 cookie 读数缝——官方 BrowserAuth 303 "./" 剥查询串，/pair 成功面设
// dswf_forge_remote=1（host child.ts 单源）跨重定向存活，手机扫码恒落受限移动视图。
const decision = remoteViewDecisionOf(window.location, document.cookie)
const decisionLine = remoteViewDecisionLine(decision, window.location, document.referrer)
console.warn('[remote-view-diag]', decisionLine)
void fetch(`/__rvdiag?line=${encodeURIComponent(decisionLine)}`, { method: 'GET', keepalive: true }).catch(() => {})
if (decision.branch === 'restricted') {
  createRoot(el).render(createElement(ForgeRemoteView))
} else {
  const entry = new AppWebEntry(el)
  void bootShell([productClient, inputHistoryClient, quoteReferenceClient, superComposerClient])
  // W4 行存续看门（session-binding-guarantee §W4）：活在壳 bundle 全局面——插件 fiber 内
  // 看门随插件同殁，检不出 prune。周期查 __DSH_FORGE_CLIENT__ 激活标记 + forge 洞位
  // ctx.slots.entries 计数（经插件发布的 __DSH_FORGE_HEALTH__ 探针）；插件侧 cordis
  // `internal/service` 事件（sessions 注销 = prune 级联回收官方信号）转发主动核查——
  // 事件 + 轮询双保险。失效 = fail-loud（console + 页面显式横幅），不静默。
  installPruneWatchdog({})
  void entry.run()
}
