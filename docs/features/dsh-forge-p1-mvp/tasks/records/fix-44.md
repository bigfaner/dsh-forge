---
status: "completed"
started: "2026-10-05 08:30"
completed: "2026-10-05 08:54"
time_spent: "~24m"
---

# Task Record: fix-44 Fix: 书海背景上移出输入框遮挡带——[data-conversation-content]::before 底边让出 composer 座（inset 底偏移，cover 重裁——鲸/书海主体完整可见于输入框上方）

## Summary
书海覆层底边让出 composer 座：[data-conversation-content]::before 盒底边由 inset:0 改 inset:0 0 var(--dswf-sea-bottom-inset,134px) 0（cover 对剩余盒重裁——鲸/书海主体完整落于输入框上方可见带）。遮挡带 dogfood 会话实测两态：静息 106px（卡98+座边距8）/工具往返中 128px（工作态卡行增高22，双主题等值）——agent 执行期为会话主态，锚工作带定值 134=128+6px 抖动余量；变量声明于 brand.css 顶部 [data-conversation-content] 规则（注释记测量口径）。红线全部不动（pointer-events:none/仅 active 相位/hero 不进/召回轨迹 :has 退场/双资产/opacity≤.85）。e2e 新增「覆层底边 y ≤ composer 卡顶 y」几何断言（session-workbench 冒烟 dogfood——evaluate 双 rect 对照，覆层底边=content 底−::before 解析 bottom），brand/冒烟双 spec 绿。本任务为 fix-record 恢复翻转真实现：恢复 prompt「实现已完成」前提为假（全分支零提交/工作树零 diff/brand.css 仍持 inset:0 缺陷原文），依派发注记直接实施。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/styles/brand.css
- e2e/specs/p1mvp/session-workbench.spec.ts

### Key Decisions
- 遮挡带锚工作态而非静息态：静息带 106px 会让艺术底边在 agent 执行期（卡带 128px）被盖 16px——本产品会话主态即工作态，定值 134px 两态断言均成立（静息态艺术底边高于卡顶约 28px，无遮挡残带）；任务预估区间 ~120-150px 的方向因此得到证实
- 测量口径沿 probe-geo.mjs：卡座=[data-composer-input] 最近 form/card/composer 祖先（实测解析 .uV2eYG_card），带=卡顶 y 至 content 底边；hero 相位卡高 114px 但居中且无覆层（红线①）不参与定值
- 动态高度跟随（JS 读 composer 高度写变量）不引入（任务边界）——多行输入/更高工作行时静态偏移少量误差 P1 可受，记注记于 brand.css 注释
- 几何断言落位 session-workbench 冒烟（dogfood 真实 active 相位——brand spec 契约属性模拟面无真实往返态），evaluate 双 rect 对照与测量口径同源
- 留痕不入仓：tmp-ui-review/fix44-probe.mjs（隔离 userData+dsh-home 播种真实凭据+dogfood 模型叠层）+ fix44-conv-{light,dark}.png 双主题截图（鲸完整可见于 composer 上方、卡面无背景污染的视觉实证）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1090
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] active 会话：鲸+书海主体完整可见于 composer 上方（双主题）；composer 本体无背景污染
- [x] 滚动/选择/点击零阻挡照旧；hero/召回/轨迹相位背景退场照旧
- [x] e2e：现有 brand/会话面断言绿 + 新增「覆层底边 y ≤ composer 卡顶 y」几何断言（dogfood 会话）

## Notes
门：tsc -b 0 / pnpm lint（ox+imports+tokens+selftest+types+test-types）0 / vitest 1090过0败 / e2e brand-whale-sea 1过 + session-workbench 冒烟（含新几何断言）1过。session-workbench Step1b rail-collapse 与 Step5/6 右栏两红 = fix-42 已 A/B 实证（HEAD~1 同红）的前置环境 flake（titlebar 形态下官方 .collapsed 域 display:none），与本任务改动面（会话覆层伪元素几何 + 冒烟内断言）零交集。中间校正值一次：初值 112px（锚静息带 106）被冒烟中程往返态证伪（卡顶 774.4 > 覆层底 790.4），改锚工作带 134 后双态绿。运行期探针前查单实例锁（无活跃实例）。
