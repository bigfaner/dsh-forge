---
feature: "mobile-ui"
journey: "task-float-ball-progress-intents"
risk_level: "High"
surface_types: ["mobile"]
surface_keys: ["mobile"]
sources:
  - ".forge/docs/features/mobile-ui/prd/user-stories.md#US-7"
  - ".forge/docs/features/mobile-ui/prd/ui-functions.md#F6"
generated: "2026-10-17"
---

# Journey：任务悬浮球 · 浮层进度 · 暂停/派发意图

**用户故事**：US-7 查看任务进度（批次③）。

## 搭建前置条件

- host 上存在提案驱动的任务循环，至少一个 run 运行中；手机端已配对。

## Happy Path

1. **用户拖拽悬浮球到屏幕边缘** → 预期：悬浮球贴边收纳为透明半圆，不遮挡内容。
2. **用户点悬浮球展开任务浮层** → 预期：浮层主标题=提案名、副标题=slug；运行中任务卡置顶、已完成折叠；状态徽标对齐桌面端状态集；无审批控件、无进度百分比。
3. **用户查看运行中任务卡** → 预期：卡片显示暂停按钮；底部统一派发入口可见。
4. **用户分别点暂停与底部派发** → 预期：两类意图均转发至 host，host 守卫执行后任务状态徽标随回执更新（对齐桌面端状态集）。
5. **存在多个运行中 run 时用户切换** → 预期：浮层顶部出现 run 切换 chips，切换查看不同 run；悬浮球只反映最近 running run。

## 边界用例

1. **（引步骤 4）数据 stale 时操作**：分叉前置 = 数据已过期（stale 标记在显）→ 暂停/派发按钮置灰，操作不可发出，不发出过期意图。
2. **（引步骤 4）host 守卫拒绝暂停**：分叉前置 = 暂停意图被 host 校验拒绝 → 只回传提示数据呈现，任务状态不发生任何手机端臆测的变更。
3. **（引步骤 5）最近 running run 结束**：分叉前置 = chips 中最近 running run 完成 → 悬浮球反映对象切换到剩余最近的 running run；无 running 时悬浮球收敛到非运行形态。
4. **（引步骤 2）无任何任务**：分叉前置 = host 无任务循环 → 浮层空态呈现，无骨架卡残留。
5. **（引步骤 1）拖拽与点击冲突**：分叉前置 = 用户按住悬浮球但未位移即松手 → 判定为点击展开浮层，不误触发拖拽落点。

## Journey Invariants

- 悬浮球/浮层是只读进度面 + 意图转发面：暂停/派发一律经 host 守卫校验后才落地，手机端无任何直接改变循环行为的路径。
- 任务浮层信息纪律：无审批、无进度百分比；状态集与桌面端对齐。
- 悬浮球只反映最近 running run，多 run 全貌由 chips 承载。
