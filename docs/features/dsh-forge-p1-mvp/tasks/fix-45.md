---
id: "fix-45"
title: "Feat: dsh-forge 程序图标——鲸游书海 brand 标派生应用图标集（.ico 多尺寸 + png），接入 dev 窗口 icon 与 electron-builder win/nsis——退役 Electron 默认图标"
priority: "P1"
estimated_time: "3h"
complexity: "medium"
dependencies: ["fix-38"]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# Feat: 程序图标采用左上角 brand 图标（用户验收 2026-10-05 反馈④-3）

## 需求（用户原话）

「dsh-forge程序图标采用左上角brand图标，不沿用electron默认的。」

## 现状（本会话核实）

- **dev/运行窗口**：apps/host/src/window/create.ts BrowserWindow 选项无 `icon` → Electron 默认图标；
- **安装器/安装后 exe**：electron-builder.config.mjs 全文无任何 icon 字段（win.icon / nsis.installerIcon / uninstallerIcon / shortcutIconName 缺席）→ NSIS 默认 + exe 默认；
- brand 母版在场：docs/brand/whale-sea-mark.svg（24×24 viewBox，**单 currentColor**——fix-38 侧栏标识同源）；生成器 tmp-ui-review/gen-whale-brand-v3.mjs 已有确定性派生先例（种子 20261004）。

## 方案

### ① 图标资产派生（母版单源）

- 生成器扩展 `--emit icon`：从 whale-sea-mark.svg 派生**应用图标画布**——图标 ≠ 侧栏标直放大：24×24 构图在大尺寸下太满（书页浪/闪电细节密），画布按 app icon 惯例内缩留白（内容 ~76-80% 网格，四周留 2/24 安全边）；
- **定色**：侧栏标 currentColor 语义不适用位图——取品牌墨色单色（README 双口径中的 ink #22314a，浅底可辨；深底 Windows 任务栏由系统合成——单色不透明底方案 P1 裁决：图标底 = 透明，前景墨色；如暗色任务栏辨识不足，执行时对照后可转 bluish 强调色并记 README）；
- 输出：`build/icon.svg`（派生母本，入仓）+ `build/icon.png`（512×512）+ `build/icon.ico`（256/128/64/48/32/16 多尺寸）——**位图一次生成入仓**（确定性提交，管线不依赖在线栅格化）；生成器留脚本（docs/brand 同源惯例）；
- 栅格化路径：SVG→PNG 无仓内依赖——用仓内既有 electron（probe 已验证 CDP 截图可行：data-URL 页 + captureScreenshot）或脚本内手写 PNG（路径自选，产物入仓为准）；PNG→ICO 多尺寸合成用 ico 头手写或 7zip/ imagemagick 不得引入新依赖——**手写 ICO 封装**（BMP/PNG 帧头格式简单，PNG 帧允许）。

### ② 接线

- **dev/运行窗口**：create.ts `icon:` 选项接 `build/icon.png`（路径解析按 hostRoot 口径——打包形态资源随 extraResources，窗口图标 Windows 打包后由 exe 内嵌优先；create.test 断言 icon 路径在场且文件存在）；
- **electron-builder**：config 增 `win.icon: 'build/icon.ico'` + `nsis.installerIcon/uninstallerIcon: 'build/icon.ico'`（+ `shortcutIconName` 缺省随 productName）——结构 pin 测试（tests/structure 相应面）同步断言三字段；
- **assemble-installer-resources.mjs**：如打包形态窗口图标需随包（非 exe 场景核查——Windows exe 内嵌后 BrowserWindow icon 可省），按 4.1 staging 口径把 icon.png 归位（执行时按实测裁决，注记留痕）。

### ③ 文档

- docs/brand/README.md：应用图标条目（派生口径/定色裁决/安全边）入「鲸游书海」现行节。

## 验收

1. dev 启动：任务栏/窗口标题栏/Alt-Tab 显示鲸标（非 Electron 默认）；
2. `pnpm run dist`（或现行打包脚本）产物：安装器 + 安装后 exe/快捷方式图标 = 鲸标（16-256 各尺寸清晰——26px 任务栏与 256 资源管理器大图双查）；
3. 生成器可复现（种子确定性——重跑 byte-identical 或差异可解释）；单测/结构 pin 绿；
4. 双主题任务栏可辨（浅/深任务栏人工对照）。

## Reference Files

- docs/brand/whale-sea-mark.svg（母版）+ README「鲸游书海」节（定色/红线）；tmp-ui-review/gen-whale-brand-v3.mjs（生成器扩展位）
- apps/host/src/window/create.ts（icon 选项接入）+ create.test.ts（断言面）
- electron-builder.config.mjs（win/nsis icon 字段）+ scripts/assemble-installer-resources.mjs（staging 归位）
- 侧栏现役消费面参照：apps/web/src/views/sidebar/ForgeBrand.tsx（fix-38 内联三层构图——图标派生的构图基准）
- 关联：fix-38（brand 体系立形——图标为其应用面延伸）

## 边界与不做

- 不自创新构图（鲸游书海母版单源派生——留白/定色是仅有的派生自由度，均记 README）；
- 不引入栅格化新依赖（sharp/resimag 等——electron 截图或手写封装二选一）；
- macOS .icns / linux 不做（P1 Windows NSIS 单平台——管线注记已有）；
- 不做动态/多主题图标（Windows 单 ico 静态）。
