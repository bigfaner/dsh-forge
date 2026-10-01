// 产品 client 插件入口（定位：装配——vite 第二入口产物，母本模式同型）。
// 形态契约（上游 client bundle 注册面，S2 清单 pin）：bundle 为无 import/export 的自含脚本
// （模块系统 defaultLoadBundle 以 classic <script> 加载），求值即注册工厂；本入口零导出、
// 唯一值依赖 ./plugin.js（rollup 内联后自含）——形状由 vite 构建 pin 断言（产物无 import/export 语句）。
// 入图 = shell/boot.ts 掌舵（__DSH_BOOT__ 追加行，immediately 预取装载本 bundle）。
import { moduleLoaderFacade, registerForgeClient } from './plugin.js'

registerForgeClient(moduleLoaderFacade())
