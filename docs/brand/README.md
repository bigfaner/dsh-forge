# dsh-forge 品牌标识

## 前任：知识就是力量（fix-15，2026-10-03 – 2026-10-04——历史档）

翻开的书（**知识**）托举一道自书脊升起的闪电（**力量**）—— 知识资产是产品的核心卖点（知识飞轮），闪电同时呼应「能量/驱动」，书页左右非对称透明度（.88 / .6）制造翻动的层次。2026-10-04 起由「鲸游书海」（下节）接任——元素谱系（书 + 闪电）延续。

- 母版：[dsh-forge-mark.svg](./dsh-forge-mark.svg)（viewBox 24×24，三路径纯几何，无外部依赖——**历史档**，保留不删）
- 用色：**单一 `currentColor`** —— 随官方令牌自动适配明暗主题（浅色 = 深字、深色 = 浅字），杜绝固定黑块问题
- 24px 小尺寸可读性：闪电为视觉主体（全不透明），书页为基底（降透明度）—— 缩到 16px 仍可辨

## 变体与使用约定

| 场景 | 用法 |
|---|---|
| 侧栏品牌行 / rail | 内联 SVG，`color: var(--dsw-alias-label-primary)`（或 bluish 强调色，执行裁决） |
| 需要强调色时 | 外层容器设 `color: var(--dsw-alias-brand-primary)`（仅描形，不做填充底） |
| 禁用 | 禁止固定色值 / 禁止深色填充方块底（黑色图片问题的根因） |

## 现行：鲸游书海（2026-10-04 v2 图标 / v3 背景，fix-38 接入）

同源概念演进（书 + 闪电元素谱系不变，叙事升维）：

> **知识（书海）托举探索者（鲸）前行；鲸的喷泉水花即闪电——力量由知识激发。**

**v2（现行）——鲸 = 原生 dsh 官方几何**：走查人指令「鲸鱼形象参考原生 dsh」——鲸剪影直接取
`@deepseek-ai/dsh-client-ui-primitives` 的 `FISH_LOGO_PATH`（官方 hero `HeroFish` 同源，viewBox
23.16×17.04，几何零改动仅缩放平移）——品牌血缘直承官方 dsh，与产品的官方优先纪律同构。

- 图标母版：[whale-sea-mark.svg](./whale-sea-mark.svg)（viewBox 24×24，currentColor 三层：官方鲸
  剪影 ×0.62 / 双层书页浪 .88+.6 / 闪电喷泉；腹线没入书浪 = 破浪而行，16px 可辨锚 = 鲸尾卷 + 闪电）
- 图标消费位（fix-38 落地）：`apps/web/src/views/sidebar/ForgeBrand.tsx` 内联——鲸剪影经官方
  `FISH_LOGO_PATH` 导出面 import 消费（**几何零拷贝**，上游演进自动跟随）；书页浪两路径 + 闪电
  喷泉一路径照母版内联（产品自有元素）；变体/禁用约定沿用上表；品牌名 `dsh-forge` 字标不变
- 对话面板背景：[whale-sea-conversation-bg.svg](./whale-sea-conversation-bg.svg)（v3——**海洋由无数本各式各样的书构成**：
  133 本四形混排「立脊如礁 / 斜倚如波 / 书堆如屿 / 翻摊如浪花」，四深度带随双正弦波脊起伏递退；
  原生 dsh 鲸 ×14 破浪其间（鲸腹前有破浪锚书制造沉浸），携闪电喷泉与灵感气泡；
  视觉权重压底部 ~28%——中部会话栏素净；元素不透明度 .03–.12 不伤正文可读性；
  生成器 `tmp-ui-review/gen-whale-brand-v3.mjs`（种子 20261004，确定性可复现/可调参））
  - 应用内消费（fix-38 落地形态）：`apps/web/public/brand/` 静态双资产（`whale-sea-bg-ink.svg`
    浅色墨 / `whale-sea-bg-paper.svg` 深色纸——生成器 `--emit ink|paper` 自母版确定性派生，
    烘焙色零媒体查询，vite public → dist → `dsh-forge://app/` 服务）
  - 承载 CSS：`apps/web/src/styles/brand.css`——官方会话滚动区 CSS 锚铺底（fix-25 后中区归
    官方 ConversationRoot，产品不注入组件），`body[data-ds-dark-theme]` 双口径**精确跟随应用内
    主题**（不经 prefers-color-scheme）；覆层 `pointer-events:none` + `opacity` ≤ .85 总守护
  - 红线：仅 active 相位会话滚动区——不进官方 hero（空会话大标）、召回/轨迹视图与
    composer/输入区；顶部 55% 渐隐遮罩已内置（消息流区域恒净）
- 应用图标（fix-45，用户验收 2026-10-05 反馈④-3）：`build/icon.svg`（派生母本）+
  `icon.png`（512）+ `icon.ico`（16/32/48/64/128/256 多尺寸 PNG 帧）——**位图一次生成
  入仓，打包管线零在线栅格化**。派生口径（仅有的两个派生自由度）：
  - **构图**：mark 三层原样整体缩放定位（不自创构图）——图标 ≠ 侧栏标直放大：24×24
    构图大尺寸下太满，按 app icon 惯例内缩：内容长边 19.2/24（80% 网格）+ bbox 中心
    对齐画布中心（四周安全边 ≥2/24，实测 getBBox 派生，不手工估算）；
  - **定色**：侧栏标 currentColor 语义不适用位图——取品牌墨色单色 **#22314a** + 透明底
    （P1 裁决：浅底可辨；深底 Windows 任务栏由系统合成——如暗色辨识不足再转 bluish
    强调色并记本节）；
  - 生成器：`tmp-ui-review/gen-whale-brand-v3.mjs --emit icon`（母版
    whale-sea-mark.svg 单源；栅格化经 tmp-ui-review/icon-rasterizer——electron
    Chromium offscreen 透明截帧 + 手写 ICO 封装，零新依赖；同机重跑 byte-identical）；
  - 接线：dev/运行窗口 BrowserWindow `icon` = `build/icon.png`（解析单源
    apps/host/src/window/icon.ts——打包形态 `{resources}/icon.png`，assemble 物化；
    Windows 任务栏/Alt-Tab 由 exe 内嵌优先）；electron-builder `win.icon` +
    `nsis.installerIcon`/`uninstallerIcon` = `build/icon.ico`（shortcutIconName 缺省随
    productName）——**退役 Electron 默认图标**（dev 任务栏 + 安装器 + 安装后 exe 三面）；
  - 不做面：macOS .icns / Linux / 多主题动态图标（P1 Windows NSIS 单平台）。
- v1（自绘鲸剪影）已被 v2 替换——官方几何优先，自绘形态退役不存档

## 历史

- 2026-10-03 前：「知」字方块（`--dsw-alias-brand-primary` 深底 + 反色字）—— 浅色主题呈近黑方块（走查人报告「黑色图片」问题）
- 2026-10-03：本设计（fix-15）替换 —— 透明底 + currentColor
- 2026-10-04：「鲸游书海」候选稿 v1（自绘鲸）→ v2（**官方 FISH_LOGO_PATH 鲸**）→ v3（背景概念收紧：**无数各式书本构成海洋本体**，133 本四深度带）——**同日走查人裁决采纳**
- 2026-10-04：fix-38 接入 —— v2 图标（官方鲸 + 书页浪 + 闪电喷泉，经 FISH_LOGO_PATH 导出面零拷贝）+ v3 对话面板书海背景（静态双资产 + CSS 锚）升**现行**；fix-15「书 + 闪电」标退役为历史档（上节）
- 2026-10-05：fix-45 应用图标 —— v2 标派生 `build/icon.{svg,png,ico}`（80% 网格内缩 + 墨色单色透明底），接入 dev 窗口 icon 与 electron-builder win/nsis——Electron 默认图标退役
