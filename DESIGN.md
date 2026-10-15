# Design System: dsh-forge Web GUI (DSW)

> Extracted from: source code (apps/web/src/** + @deepseek-ai/dsh-client-ui-theme tokens)
> Date: 2026-02-27
> Based on: Official dsh (DeepSeek Harness) — 本项目样式**尽量与 dsh 对齐**，非独立设计语言

## Visual Theme & Atmosphere

**首要原则：与官方 dsh 逐位对齐。** 本项目不建立自己的视觉语言——色板、字体、圆角、阴影、交互词汇全部取自官方 `@deepseek-ai/dsh-client-ui-*` 组件与 `--dsw-*` 令牌体系；官方已有同语义组件一律直接复用，产品层只做组合与注入，仅官方缺件处自绘（`.dswf-*`，刻度仍对齐官方同型件原值）。对齐判据 = 官方实机形态逐位对照（布局/交互/状态语义），不是「语义近似」。

形态上呈现为：浅色纸白底 + 深色近黑双主题，克制的蓝灰中性色板，DeepSeek 品牌蓝（#4176e6）作唯一强调色。0.5px 细描边 + 低强度阴影（`#0000000a` 级）的层次语言；圆角 4–28px，支持 `corner-shape: superellipse(1.5)`。品牌签名「鲸游书海」插画沉底渐隐铺满对话区。全站零裸值——只消费 `--dsw-*` 语义令牌（lint-tokens 机械执行）。

## Color Palette

双主题令牌三层架构：`--dsw-static-*`（原始色板）→ `--dsw-alias-*`（语义别名，按主题切换）→ 组件消费别名。暗色主题锚 `body[data-ds-dark-theme]`。

| Role | Light | Dark | Usage |
|------|-------|------|-------|
| Background (bg-base) | #ffffff | #151517 | 页面主底 |
| Surface L1 / L2 / L3 | #ffffff ×3 | #232324 / #2c2c2e / #353638 | 分层浮面（卡片/弹层） |
| Surface module-platform | #f5f6f7 | #353638 | 平台模块底（stepper、选中态） |
| Sidebar fill | #f9fafb | #1b1b1c | 侧栏底 |
| Border L1 / L2 | #0000000a / #0000001a | #ffffff0f / #ffffff1f | 分隔线、输入描边 |
| Border L3 / L4 | #0000001f / #00000029 | #ffffff29 / #ffffff4d | 强分隔、elevation 描边 |
| Text Primary | #0f1115 | #f9fafb | 主文本 |
| Text Secondary | #61666b | #cfd3d6 | 次文本、描述 |
| Text Tertiary | #81858c | #adb2b8 | 占位、禁用 |
| Text Caption | #adb2b8 | #81858c | 弱标注 |
| Accent (business-primary / link) | #4176e6 (deepseek-500) | #7aaaff (deepseek-400) | 主交互色、链接、focus ring |
| Hover bg | #2631480f | #ffffff14 | 交互悬停底 |
| Active bg | #2631481a | #ffffff24 | 交互按压底 |
| Success | #22c55e | #22c55e | 成功态（tertiary: #e6faed / #233c2c） |
| Warning | #f59e0b | #f59e0b | 警告态（label: #dd8629） |
| Error | #ec1313 | #f25a5a | 错误态 |
| Toast | bg #353638 / label #fff | bg #43454a / label #fff | 提示条 |
| Tooltip | #2c2c2e | #43454a | 气泡 |
| Code block bg | #f9fafb | #1b1b1c | Markdown 代码块 |

语义模式色（模式溯源点色）：远征 expedition = business-primary 蓝；突击 blitz = warn-primary 琥珀 #f59e0b。

## Typography

字体族：
- 正文 `--dsw-font-family`: `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif`
- 品牌 `--dsw-font-family-brand`: `"Montserrat", var(--dsw-font-family)`
- 代码 `--ds-font-family-code`: `"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"`

字号阶梯（weight / size / line-height，单位 px）：

| Role | Token | Weight | Size | Line Height |
|------|-------|--------|------|-------------|
| Display | `--dsw-font-xl-24` | 600 | 24 | 32 |
| H1（面板大标） | `--dsw-font-l-20` | 500 | 20 | 28 |
| H2（栏目标题） | `--dsw-font-m-18` | 500 | 16 | 28 |
| Body | `--dsw-font-base-16` / `--dsw-font-s-14` | 400 | 16 / 14 | 24 / 22 |
| Body strong | `--dsw-font-base-strong-16` 等 | 500 | 同级 | 同级 |
| Caption | `--dsw-font-xs-13` | 400 | 13 | 20 |
| Small | `--dsw-font-xxs-12` | 400 | 12 | 18 |
| Micro | `--dsw-font-xxxs-11` | 400 | 11 | 14 |

Markdown 内容阶梯（随用户字号设置 `--dsh-content-font-size` 14–22px 等比缩放）：h1 700 21/30、h2 700 19/28、h3 700 18/26、h4 600 14/24、base 400 14/24、table 400 13/22（head 500）、small 12/20、inline code 12/19、code block 11/19（mono）。

## Components

官方件（Button / Input / Modal / Menu / Tag / Tooltip / Switch 等）复用 `@deepseek-ai/dsh-client-ui-*`，产品层零重写；以下为组件消费要点与自绘面。

### Buttons

- **Primary**: `--dsw-alias-button-primary-fill`（light #0f1115 / dark #f9fafb，近黑/近白反差面），hover `button-primary-hover`（dark: bluish-750 / light: bluish-100）
- **Info**: `button-info-fill` deepseek-500 #4176e6，hover deepseek-400
- **Ghost**: 透明底 + hover `interactive-bg-hover`；toolbar 变体常驻 `button-tool-bar-fill` #54555780
- **Floating/Elevated**: 白（dark: bluish-850/750）实底 + elevation 阴影
- 侧栏行内图标钮：18px 命中区，radius-sm，label-secondary，hover interactive-bg-hover

### Cards / Panels

- 背景 `bg-layer-2`；描边 0.5px `border-l4`；Radius `--dsw-radius-*`（见 Layout）
- 阴影走 elevation 组合（见 Depth），描边+微阴影双层
- Settings 卡片：`settings-card-fill` = layer-2 + `settings-card-stroke` = border-l4

### Inputs

- 主输入 `--dsw-specific-input-major`：light #fff / dark #2c2c2e
- Focus：`:focus-visible` outline 2px `state-business-primary`（指针输入态自动透明）
- 搜索框嵌入段头：展开即占满段宽，收起复归四件套

### Navigation (Sidebar)

- 布局：左栏 workspaces 区，项目块（DisclosureRow）+ 会话行树，会话缩进 `calc(8px + depth*12px)`，组内相邻行 2px 节奏
- 行刻度（对齐官方 ui-workspace）：会话行 h32、项目行 h34、段头 36px、rail 图标钮 36px 命中区
- Active: `sidebar-nav-item-active` bluish-100（dark 750）+ accent `deepseek-100`（dark 800）；Hover: bluish-75 / 850
- 行内 fading 动作组：`>* opacity:0` → 行 hover 显现，`opacity .15s var(--ds-ease-in-out)`

### Chips（自绘 ModeChip）

- 胶囊 999px（官方 Tag 同值）、h20、`font-xs-13`、label-secondary、hover 出 border-l2
- 模式点 7px 圆点，色随语义（expedition 蓝 / blitz 琥珀）

### Dialog chrome（配对 dialog 等 Modal 头部，用户裁决 2026-10-15）

- **Harness 菜单 = 纯文字「Harness」**，不采用图标（官方菜单栏同词）；
- **头部控件不贴边**：关闭钮（X）与 Harness 菜单文字均与 dialog 边缘保持正常内距（官方 Modal 头部 14px 内距刻度）；
- 头部左右控件对称呼吸：左 Harness 菜单、右关闭钮，同刻度留白；
- **下拉失焦即收**：Harness 菜单开启期，焦点离开菜单容器（含 dialog 内外点击）或窗口失焦即收起（官方 Menu/dropdown 惯例）。

## Layout

- Radius 标尺：`--dsw-radius-xs/sm/md/lg/xl/panel` = 4 / 8 / 12 / 16 / 20 / 28px；胶囊 999px
- 工作台结构：壳（官方 ConversationRoot 中区 + 常驻壳座位 fixed overlay）+ hero/知识/会话面板（CenterColumn 全高）+ 侧栏
- 间距纪律：官方主题无间距标尺令牌——纵向刻度取排版令牌行高（20/22/24/28px 固有刻度），不自创平行体系
- Hero：文本靠顶 `clamp(40px, 12vh, 128px) 24px 0`、gap 12px、居中
- 滚动条：5px 细条、999px 圆角、thumb neutral-200（dark 700）、hover 加深一档

## Depth & Elevation

| Level | Value | Usage |
|-------|-------|-------|
| elevation-stroke | `0 0 0 .5px var(--elevation-stroke-color)` | 所有浮面描边（light border-l4 / dark border-l3） |
| lv1 | `0 2px 4px 0 #0000000d` | 轻浮层 |
| lv2 | `0 4px 12px 0 #00000005, 0 2px 8px 0 #0000000a` | 卡片、下拉 |
| lv3 | `0 0 1px 0 #0003, 0 0 4px 0 #00000005, 0 12px 32px 0 #00000014` | 模态 |
| elevation-panel | stroke + `0 3px 8px #00000008, 0 0 16px #00000005` | 面板 |
| elevation-prominent | stroke + `0 3px 8px #0000000a, 0 0 20px #0000000d` | 突出浮层 |
| elevation-soft | stroke + `0 4px 16px #00000008, 0 0 24px #00000008` | 柔和浮层 |

菜单材质 backdrop：`blur(40px) saturate(150%)`。

动效：`--ds-ease-in-out: cubic-bezier(.4,0,.2,1)`；时长 fast .1s / 默认 .2s / slow .3s。

## Do's and Don'ts

| Do | Don't |
|----|-------|
| **样式尽量跟 dsh 对齐**：官方有的形态/刻度/交互一律取官方原值，逐位对照实机 | 不自创近似形态，「语义近似」不算对齐 |
| 复用官方组件（Button/Input/Modal/Menu/Tag…），产品层只组合注入 | 不重写官方已有同语义组件 |
| 色/字/距一律消费 `--dsw-*` 令牌 | 禁裸值（hex/px 间距）——lint-tokens 机械拦截 |
| 描边 0.5px + 微阴影表达层次 | 不用重阴影/彩色阴影 |
| 语义色取 alias（state-*/interactive-*/label-*） | 不直引 static 原始色板 |
| 暗色适配写 `body[data-ds-dark-theme]` 锚 | 不用 media query 模拟暗色 |
| 无间距令牌处取排版行高刻度 | 不引入平行间距体系 |

## Responsive Behavior

桌面工作台形态（本仓产品面无移动断点适配）；主题随 light/dark/system 偏好切换（官方 ui-theme 设置面）。

## Signature Patterns

1. **鲸游书海插画背景**：`public/brand/whale-hero-bg.svg` 沉底铺对话区（`[data-conversation-content]`），78% 高 + 顶部渐隐 mask 32%；hero 空态 opacity .88、其余相位 .4 保正文对比；暗色 `brightness(1.35) saturate(0.85)` 提亮去饱和。插画层 z-index:-1 + isolation 栈上下文，零指针拦截。
2. **令牌唯一纪律**：产品样式 `.dswf-*` 前缀；例外刻度须 `dsw-raw` 注明官方出处（如胶囊 999px = 官方 Tag 同值）。
3. **模式语义点色**：远征=蓝 / 突击=琥珀，贯穿 chip 点、状态徽标。
4. **superellipse 圆角**：`corner-shape: superellipse(1.5)` 渐进增强，回退普通圆角。
5. **行内 fading 动作组**：侧栏/列表行悬停才显动作钮（opacity 渐现），保持扫描整洁。
