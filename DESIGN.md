# dsh-forge 设计语言(提取自上游 dsh ui-theme)

> **来源**:上游仓库 `packages/client/ui-theme/src/styles/`(2026-09-19 源码提取;行号会漂移,以符号/变量名为准)。
> **适用范围**:dsh-forge 一切应用内自研 UI(TECH-ui-reuse-001);OS 原生控件(托盘菜单/系统通知)遵循各平台规范,不适用本体系。
> **权威优先级**:上游源码 > 本文件。上游变更时以 `ui-theme/src/styles/*.css` 为准更新本摘要。

## 色彩

**使用规则:一律使用语义别名(`--dsw-alias-*` / `--dsw-specific-*`),禁止直接引用静态色阶(`--dsw-static-*`)**;别名在亮暗两主题下自动切换。

### 关键别名(M1 壳级 UI 所需节选)

| 用途 | 别名 | 亮主题解析 | 暗主题解析 |
|------|------|-----------|-----------|
| 页面底色 | `--dsw-alias-bg-base` | #FFFFFF | rgb(21,21,23) |
| 悬浮卡面 | `--dsw-alias-bg-layer-2` | #FFFFFF | rgb(44,44,46) |
| 主文字 | `--dsw-alias-label-primary` | rgb(15,17,21) | rgb(249,250,251) |
| 次文字 | `--dsw-alias-label-secondary` | rgb(97,102,107) | rgb(207,211,214) |
| 链接/品牌动作 | `--dsw-alias-link` | rgb(65,118,230) | rgb(103,158,254) |
| 主按钮填充 | `--dsw-alias-button-primary-fill` | rgb(15,17,21)(单色黑) | rgb(249,250,251)(单色白) |
| 主按钮文字 | `--dsw-alias-label-primary-foreground` | 白/黑反转 | |
| ghost 按钮 hover | `--dsw-alias-interactive-bg-hover` | rgba(38,49,72,.06) | rgba(255,255,255,.08) |
| 遮罩 | `--dsw-alias-bg-mask-1` | rgba(0,0,0,.24) | rgba(0,0,0,.5) |
| 边框 | `--dsw-alias-border-l1~l4` | 黑色低透明 | 白色低透明 |
| 错误 | `--dsw-alias-state-error-primary` | rgb(236,19,19) | rgb(242,90,90) |
| 成功 | `--dsw-alias-state-success-primary` | rgb(34,197,94) | 同 |
| 警示 | `--dsw-alias-state-warn-primary` | rgb(245,158,11) | 同 |
| toast 背景 | `--dsw-alias-toast-bg` | rgb(53,54,56) | rgb(67,69,74) |

- 品牌蓝:`--dsw-static-deepseek-500` rgb(65,118,230)(仅经别名使用)。
- **主题切换**:`body[data-ds-dark-theme]` 属性驱动;新 UI 必须同时适配亮暗两主题。

## 字体

- 界面:`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif`
- 代码:`'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei'`(刻意不带裸 `monospace` 尾,避免 Windows CJK 回退宋体)
- 字号阶:`12/18`(辅助)、`14/22`(正文)、`16/24`(标题);标题字重 500(Figma 510 统一渲染为 500)

## 动效

- 缓动:`cubic-bezier(0.4, 0, 0.2, 1)`;时长三档 `0.1s / 0.2s / 0.3s`
- Toast:入场 160ms ease-out;退场 fade 1000ms(起点为 hold,默认 3000ms)

## 圆角与几何(上游组件实测值)

- 平滑圆角:`corner-shape: superellipse(1.5)`(`@supports` 守卫,不支持的引擎回退圆角;胶囊/圆形显式回退 `round`)
- **Button**:胶囊;md `h36 pad 0 14px gap 4 r18 f14/22`;sm `h28 pad 0 10px r14 f12/18`;disabled `opacity .4`
- **Dialog**:r24,宽 `min(380px, 100%)`,mask-1 + `blur(2px)`,bg-layer-2,阴影 elevation-prominent,内距 pb24、标题行 pad `22 14 12 24`,关闭钮 28×28 r8
- **Toast**:顶部居中 `top 40px`,r14,pad `12 16`,宽 `max-content ≤ min(640px, 100vw-48px)`,对比填充 + 反转文字,z-index 1100,`pointer-events: none`
- **Menu 卡**:r20,pad 4,min-w 218,`--dsw-specific-menu` 填充,elevation-prominent

## 组件先例(自研 UI 前先核对)

上游 `packages/client/ui-primitives`:Button / Modal / Toast / Menu / StateDot / ConnectionIndicator / Pill / HoverCard 等 —— 壳级新增 UI 优先复用或仿照这些组件的几何与令牌用法(见 `docs/conventions/ui-reuse.md`)。
