/**
 * electron-builder 配置 —— 4.1 Windows NSIS 单平台打包管线。
 *
 * 模式继承旧线 M1（apps/desktop/build/electron-builder.config.mjs，apps/desktop 分支）：
 * 资源经 scripts/assemble-installer-resources.mjs 物化到 release/staging/ 后以
 * extraResources 整体嵌入——electron-builder 不触碰其内容（确定性），安装期零网络
 * （SC-NFR 离线自足：无远程脚本/字体/样式请求，运行时树全量随包分发）。
 *
 * 与 M1 的差异（P1 形态）：
 *   - asar: false —— host main 是 tsc -b 多文件产物（tech-design「apps/host：tsc -b +
 *     electron-builder 打包」，无 bundler 步），boot child 经 ELECTRON_RUN_AS_NODE 派生，
 *     必须是真实文件；运行时 node_modules 树同理（native prebuilds + realpath 解析链）。
 *   - 应用目录 = release/app（脚本物化，deps-free）——node_modules 收集器无依赖可收，
 *     运行时树完全由 extraResources 供（resources/node_modules，与 child 解析邻接）。
 *   - resources/package.json = 合成 anchor 清单 = 打包形态 installAnchor。
 *
 * 安装后布局（NSIS per-user，默认 %LOCALAPPDATA%\Programs）：
 *   {install}/resources/{runtime/{package.json, node_modules/, host-dist/}, web-dist/,
 *                        app/{main.js 装载器, package.json}, staging-manifest.json}
 *   —— runtime/package.json = 合成 anchor 清单 = 打包形态 installAnchor；runtime/host-dist
 *   = 宿主 dist 真实文件（main + boot child——与 node_modules 同容器保 ESM 上溯解析邻接；
 *   宿主 dist 运行期 import @dsh-forge/contracts，不能留在 app 目录）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname)
const STAGING = join(ROOT, 'release', 'staging')
const ROOT_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version ?? '0.0.0'

/**
 * 生成一份打包环境配置（导出供结构 pin 测试消费）。
 * @param {string} rootVersion - 版本（默认根 package.json——artifactName 占位）。
 */
export function createElectronBuilderConfig(rootVersion = ROOT_VERSION) {
  return {
    appId: 'app.dshforge.desktop', // 继承 M1（同产品线延续）
    productName: 'dsh-forge',
    artifactName: `dsh-forge-${rootVersion}-\${os}-\${arch}.\${ext}`,
    directories: { app: 'release/app', output: 'release/installer' },
    // 见文件头注记：child 派生 + native prebuilds + tsc 多文件产物 = 全真实文件。
    // app 目录 = 装载器 + 清单（真实 main 在 extraResources runtime/host-dist）
    asar: false,
    files: ['main.js', 'package.json'],
    // 显式 filter（M1 同款）：electron-builder 拷贝 filter 硬编码剔除「拷贝源根级
    // node_modules」——运行时树须嵌 runtime/ 一层；filter 同时自证物化内容边界
    // （icon.png = fix-45 窗口图标打包形态解析位 {resources}/icon.png）
    extraResources: [
      { from: STAGING, to: '.', filter: ['runtime/**', 'web-dist/**', 'icon.png', 'staging-manifest.json'] },
    ],
    // release/app 为 deps-free 物化目录——electron 版本显式声明（无 devDep 可推导）
    electronVersion: '44.0.0', // S1 pin：node-addon-require-builtin 指纹门（43.0.0/44.0.0/45.0.0-alpha.6）
    // 应用图标（fix-45）：鲸游书海 brand 标派生多尺寸 ico（build/ 一次生成入仓——生成器
    // tmp-ui-review/gen-whale-brand-v3.mjs --emit icon，管线零在线栅格化）。win.icon 内嵌
    // exe（任务栏/Alt-Tab/资源管理器）；shortcutIconName 缺省随 productName（dsh-forge）
    win: { target: ['nsis'], icon: 'build/icon.ico' },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      // 离线安装（SC-NFR）：NSIS 自身不下载；差分包在无更新通道前保持禁用
      differentialPackage: false,
      // 安装器/卸载器图标（fix-45）——与 win.icon 同源 build/icon.ico
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
    },
    publish: null, // P1 无更新通道（插件升级 = 随应用发版更新资源目录）
  }
}

export default createElectronBuilderConfig()
