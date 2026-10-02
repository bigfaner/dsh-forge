// dsh-forge 安装包应用目录装载器（4.1；assemble-installer-resources.mjs 物化为
// resources/app/main.js——app package.json main 指向本件）。
// 真实 main 不在 app 目录：宿主 dist 运行期 import @dsh-forge/contracts 等包
// （ipc/forge-channels 等 6 处），ESM 沿目录上溯解析——dist 须与运行时 node_modules
// 同容器（resources/runtime/host-dist），app 目录只留本装载器。
// TLA 动态 import 安全：被装载 main 自身仍是「void async 内 boot」形态（S1 死锁约束
// 针对 `await app.whenReady()` 顶层形式，不涉此处）。
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

await import(pathToFileURL(join(process.resourcesPath, 'runtime', 'host-dist', 'main.js')).href)
