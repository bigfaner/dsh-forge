// @dsh-forge/web vite 入口（定位：装配——官方 apps/web 母本模式）。
// 壳内核 = @deepseek-ai/dsh-client-web AppWebEntry（boot 页 → 模块系统 → 官方 ui-* 组合 →
// UI renderer 挂载 #root）；boot manifest 消费与掌舵（carrier → applyIndexInjections →
// 产品插件入图 → 就绪门放行）归 shell/。两线并行：run() 在就绪门上等待，bootShell 放行或
// reject（reject → 门 await 抛出 → 壳内核 boot 页渲染失败因——母本失败呈现路径）。
// product-views.js（求值期发布 __DSH_FORGE_VIEWS__）：client 插件槽位注册的组件源——
// 必先于插件 bundle 装载（同步 import 序保证）。
import '@deepseek-ai/dsh-client-ui-theme/brand-font.css'
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import './styles/global.css'
import './styles/brand.css'
import './styles/wco.css'
import './product-views.js'
import { bootShell, type ProductClientEntry } from './shell/index.js'

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

const entry = new AppWebEntry(el)
void bootShell(productClient)
void entry.run()
