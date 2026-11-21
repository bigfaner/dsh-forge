---
name: loop-blocking
description: 循环内阻塞任务的处置 SOP——根因归类决策树 → 同族复发挂链 → 派修复/降级径 → 中继核收；循环停在阻塞任务上零进展时用。
---

# 循环阻塞处置（Loop Blocking）

归属注记：处置对象 = 循环内阻塞任务（域归属 task-loop）；按提案迁移清单随 spec 技能面落位，与 fix-bug/investigate-bug 同族消费 project bug 台账动词（工具/skill 缝，零插件间服务依赖）。

## 硬规则

<HARD-RULE>

1. 归类先行：未完成根因归类（new-problem / same-family-recurrence）不得派修复。
2. 同族复发必挂链：先确认台账前驱 bug_id，再派修复；不挂链的「再修一次」按新问题处理即误诊源头。
3. 阻塞事实如实结算：blocked 是合法终态——不为结算绿而弱化或虚报。

</HARD-RULE>

## 流程

```
判停 → 根因归类 → 同族挂链? → 三径择一 → 中继核收
```

### Step 1：判停

循环对同一任务重复失败（同一报错 ≥2 轮、或修复后原症状复现）即判停：停止再派同类修复轮，进入本 SOP。单轮偶发（环境噪音、超时）不判停——重试一次即可。

### Step 2：根因归类

读失败证据（任务日志、结算 reason、bug 台账），二选一归类：

- **new-problem**（首次发生）：台账无同因前驱——走 `recordBug` 新登记（summary + Bug Summary 五字段），记返回 bug_id。
- **same-family-recurrence**（已知问题复发）：台账有同因前驱——`listBugs` 关键词检索候选（详情存疑 `getBug` 深查），确认前驱 bug_id；归类是自报语义判断，不做机械匹配。

### Step 3：三径择一

1. **派修复**：缺陷面清晰、修复量级在单任务内——按 fix-bug 工作流派修复任务；同族复发在派发简报注入复发链候选（前驱 bug_id），fix 侧 `recordBug` 以 recurrence_of 挂链。
2. **深挖**：盲修循环（≥2 轮修复未命中）或跨缝复发——转 investigate-bug 深挖工作流，产出全面方案后再派修复。
3. **降级收口**：修复量级超出循环承载（跨包重构/契约面变更/需求歧义）——任务如实 `submitTask result=blocked`（必带 `block_classification_kind`；同族另带 `block_classification_recurrence_of` 指向前驱 bug_id），阻塞升级交主会话/用户裁决，循环跳过该任务继续其余分支。

### Step 4：中继核收

- 派修复/深挖径：修复任务结算（fixed/unresolved）后回收——fixed 则原任务解除阻塞重入循环；unresolved 则转降级收口径。
- 降级径：向用户回呈阻塞摘要（bug_id、归类、三径取舍、剩余范围），等待裁决；不静默搁置。

## 边界

- 本 SOP 零写码义务：处置动作 = 台账登记 + 派发决策 + 如实结算，修复本体走 fix-bug。
- `addTask` 派生权限归主会话与循环处置层；worker 会话只走 blocked 结算（`ERR_WORKER_ADDTASK_DENIED`）。
