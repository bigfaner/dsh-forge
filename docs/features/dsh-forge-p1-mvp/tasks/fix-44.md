---
id: "fix-44"
title: "Fix: 书海背景上移出输入框遮挡带——[data-conversation-content]::before 底边让出 composer 座（inset 底偏移，cover 重裁——鲸/书海主体完整可见于输入框上方）"
priority: "P1"
estimated_time: "2h"
complexity: "low"
dependencies: ["fix-38"]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 对话面板背景图被输入框挡住（用户验收 2026-10-05 反馈④-2）

## 症状（用户原话）

「对话面板的背景图高一点，不要被消息输入框档住。」

## 根因（fix-38 落地形态 + 官方 DOM 勘察）

- 覆层 `::before` 锚 `[data-conversation-content]`（apps/web/src/styles/brand.css:26-34）`inset:0` —— **盒区含 composer 座**；
- 官方 composer 座 `.wSkVaW_composerSeat{position:absolute;bottom:0;left:0;...}` 悬浮绘制在滚动容器底部之上（官方 JSX：scrollBody 子 = [Views, composerSeat]）——背景母版的视觉焦点（底部破浪鲸 + 前景书海）恰落在这个被盖的带区；
- `background: center/cover` 在全高盒上裁切 → 鲸沉底 → 底部 ~1-2 百 px 被 composer 卡盖住。

## 修复方案

- `::before` 盒底边让出 composer 座：`inset: 0 0 var(--dswf-sea-bottom-inset, 132px) 0`（cover 对剩余盒重裁——书海+鲸整体落在输入框上方的可见带）；
- `--dswf-sea-bottom-inset` 缺省值锚定 composer 静息高度（本会话活体测量：composer 卡高 114px @hero 相位；active 相位座底锚 + 卡片边距，执行时以 dogfood 会话实测定值 ~120-150px——变量声明在 brand.css 顶部，注释记测量口径）；
- 红线全部不动：`pointer-events:none` / 仅 `[data-content-phase='active']` / hero 不进 / 召回轨迹退场 `:has` 规则 / 深浅双资产 / opacity ≤.85 总守护；
- 多行输入增高时静态偏移的少量误差为 P1 可受（记注记；动态跟随 = 胶水 JS 读 composer 高度写变量，后续里程碑裁决——不引入）。

## 验收

1. active 会话：鲸+书海主体完整可见于 composer 上方（双主题）；composer 本体无背景污染；
2. 滚动/选择/点击零阻挡照旧；hero/召回/轨迹相位背景退场照旧；
3. e2e：现有 brand/会话面断言绿 + 新增「覆层底边 y ≤ composer 卡顶 y」几何断言（evaluate 双 rect 对照——dogfood 会话）。

## Reference Files

- apps/web/src/styles/brand.css（:26-39 覆层——唯一修改面）
- 官方 composer 座：dsh-client-ui-conversation client.js（scrollBody/composerSeat JSX；`.wSkVaW_composerSeat{position:absolute;bottom:0}` CSS）
- 母版与红线：docs/brand/README.md「鲸游书海」节（渐隐/不透明度/双资产约定）
- 测量留痕：tmp-ui-review/probe-geo.mjs（composer 卡 114px @hero——active 相位执行时复测）
- 关联：fix-38（背景接入本体——本任务纯几何收尾）

## 边界与不做

- 不改资产本体（渐隐方向/构图不动——纯 CSS 盒几何）；
- 不做动态高度跟随（JS 胶水面记后续）；
- 不动锚选型（conversation-content 定位祖先锚 + z-index:-1 层序——fix-38 实证结论保持）。
