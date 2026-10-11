# styles/

定位：**基础** —— 令牌引入与全局样式（仅 `--dsw-*`；1.5 填充）。
边界：零裸值（色/字号/间距/圆角/阴影）——`scripts/lint-tokens.mjs` 入 G0 机械执行。

- `global.css` —— 全局基底：仅消费官方令牌（`--dsw-font-family` / `--dsw-alias-bg-base` /
  `--dsw-alias-label-primary`）；令牌由官方 ui-theme client bundle 激活注入（boot 注入行装载），
  注入前取关键字回退，不取裸值。
- `brand.css` —— 「鲸游书海」对话面板书海背景（fix-38 ②）：官方会话滚动区 CSS 锚铺底
  （active 相位门 + 召回/轨迹 `:has` 退场 + hero 红线）；资产 = `apps/web/public/brand/`
  静态双件（ink/paper——生成器派生），`body[data-ds-dark-theme]` 双口径跟随应用内主题
  （不经 prefers-color-scheme）；母版/约定见 `docs/brand/README.md`「鲸游书海」节。
- `wco.css` —— WCO 壳形态偏离块（M3.1 左栏三残差 D1/D2）：官方 `data-windows-titlebar`
  补偿面（去竖线/中区左上圆角/收起轨 0 + 双 28px 圆钮）的显式对冲——竖线 1px 常驻 +
  圆角移除 + 收起 = 59px 竖排图标列常驻；锚定纪律 = 稳定结构面（`[data-shell-overlay]`
  / `[data-sidebar-collapsed]` / `[data-slot]` 洞锚），hash 类名零耦合；上游事实由
  `tests/contract/pin-15-wco-shell-compensation.test.ts` 机械 pin。
- `cursors.css` —— 全局光标系统（D32 全局面接任 + 产品风格对齐，2026-10-11 用户裁决链
  「风格要和应用一致 / 拖宽拖移不要过大 / 按钮指手全局修改——整个产品保持一致」）：
  OS 单色光标（text/IBeam、col-resize、move）纯白不可辨缺陷的缓解 + 按钮指针族同化。
  资产中央化（`--dsh-cursor-*` 自定义属性，四形：钢笔 / 缩小版双向箭头 / 缩小版十字
  箭头 / Lucide「pointer」指手（ISC 派生））；配色 = 墨/纸正文同源（浅墨 `#0f1115` /
  暗纸 `#f9fafb` 形体 + 反侧描边，随主题翻转；强调蓝归还链接/按钮专属位）；消费面
  全局双窗体（会话消息文字 + 原生输入件 + 官方 DragHandle + drawer/dispatch-panel
  拖拽面 var() 接线 + 指针面双径：产品 45 处 sweep 接线 + 中央元素阶梯兜官方包）；
  机械面由 `tests/contract/pin-17-cursor-visibility.test.ts` pin。
