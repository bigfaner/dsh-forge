# 提案：循环消息收敛飞轮改进（loop-consol-flywheel-improvement）

- **parent_proposal_id**: loop-message-consolidation（注册时由 createProposal 填写源提案 id）
- 来源：loop-message-consolidation first-pass 复盘（任务 1.8）

## 1. 背景与指标

first-pass 快照：一次通过率 1、返工增量比 0.0%、**修正波次 8（≥ 阈值 6，越阈）**、fix 密度 36.4%。

结构性返工已被评审拦在拆解前（返工增量比 0），fix 集中在实现期暴露的两类盲区——与 expert-squad 复盘「fix 密度两视角定性」同构，本轮取实现视角改进。

## 2. 改进项

### 2.1 唤醒类消息信息集清单前置（压 fix 密度）

- 翻车点：异常唤醒卡首轮 FAIL（挂起卡非唯一 + 处置入口缺失 + 错误原文截断），fix 占本特性 fix 面大头。
- 改进：把「wakeup 消息最小充分信息集五要素」（任务标识/错误原文+全文引用/阶段/重试计数/处置入口，见 `.knowledge/conventions/wakeup-notification-minimal-info-set.md`）写入 review-proposal 检查项——凡提案含新增 wakeup 径，AC 必须逐要素断言，缺失 = Blocker。
- 落点：`packages/plugin-forge/skills/review-proposal/SKILL.md`。

### 2.2 计数类走查断言的实例边界口径（压修正波次）

- 翻车点：「恰一张」断言被派生 fix 任务的同径唤醒打破，fix-3 后仍需口径澄清才收敛。
- 改进：真机取证 AC 模板新增一条——计数类断言（tally/行数/badge）必须先以循环实例边界（最近一枚 startup 事件圈定区间）定义口径，并声明派生任务计入与否。
- 落点：`packages/plugin-forge/skills/run-tests/SKILL.md` 验收清单段（仓内无独立模板文件，落点即此）。

### 2.3 提炼态 convention 晋升裁决

- `.knowledge/conventions/wakeup-notification-minimal-info-set.md` 申请晋升 `docs/conventions/` 正本（随本提案裁决，不直改技能检查项之外的正本）。

### 2.4 会话列表恢复循环状态标识（用户补充 2026-10-28）

- 现状：标识链机械完好（`sidebar-model.ts:111-137` SessionLoopBadge + `ForgeWorkspacePanel.tsx:327,355-363` 左缘流光），但判据投影 `forge-dispatch-loop` 只折叠 `/run-dag-tasks` 斜杠指令事件——3b 改造后循环正门改为 dispatchTask/stopTaskLoop 工具，指令事件断供 → 投影恒 idle → 徽标消失。非 UI 退役，是入口换通道后判据未跟。
- 改进（推荐方向 B，零新增机械）：侧栏改窄读既有 `forge-dispatch-events` 投影——循环级 progress 事件判 running/suspended/终态，`sourceSlug` 在场；按状态区分标识（running 蓝流光 / suspended 琥珀静态缘 / 终态持续保留——D2 裁决：终态标识一直保留，供用户查找执行过任务循环的会话），复用既有左缘视觉词汇。场景判定以 `FORGE_PROGRESS_SCENARIOS` 常量单源取值（progress/index.ts:42-45 纪律），实现前出「场景码 → 三态」明确映射表（终态族 = loop/finish-all / loop/halt / loop/timeout / loop/stopped，无 "settled"）；suspend 族是否全部 loop 级（taskKey 缺席）在映射表中逐场景断言。多容器并行按 `sourceSlug` 匹配归属；entries 窗口（500）挤出最近 loop 级事件时状态推导退化为「未知」（不误报 running），与 2.2 实例边界同款兜底口径。改造后 `forge-dispatch-loop` 投影确认恒 idle，同步标注退役（保留投影折叠面不删，标注仅供历史兼容读）。
- 落点：`apps/web/src/client-plugin/sidebar-model.ts`、`apps/web/src/views/.../ForgeWorkspacePanel.tsx`。

### 2.5 进度卡条目行 title/detail 去重（用户补充 2026-10-28，排查后裁定）

- 排查结论：任务行本身无重复；重复在事件条目行（`ForgeEventEntries.tsx:141-155`）——加粗 `entry.title` 与同行 `entry.summary` 高度同文（title=`2.3 折叠条目组`，summary=`领取 · 2.3 折叠条目组`）。
- 裁定形态（用户裁决 2026-10-28：去重并换行）：渲染层单一规则——summary 命中 title 字面（taskTitle/taskKey/slug）时剥掉 summary 中标题前缀；且 title 与 detail（摘要/note）**分行展示**，不并一行；数据面不动。
- 落点：`apps/web/src/views/session/ForgeEventEntries.tsx`（:149-153 附近）。

### 2.6 进度卡增高破坏 chat-view 贴底跟随（用户补充 2026-10-28）

- 现象：循环运行期进度卡反复原地增高，chat-view 释放贴底跟随，无法滚到最新消息。
- 成因假设（静态证据，需 CDP 实测定谳）：组卡每次 progress 到达整体 re-emit 且行数阶跃 >官方 bottom-follow 25px 容差 → smooth 滚动 off-target → `settle()` 释放 followingTail；次假设：活跃 turn 内组卡锚定进限高过程折叠体，外层滚区不触发跟随。
- 修复方向：先 CDP 实测 `followingTail` 归因定谳，**定谳后回填选定方向（单轨）再进拆解**，归因前不锁定实现轨；AC6 以结果约束（运行期贴底保持、可滚到最新消息）不依赖具体轨。
- 落点：`apps/web/src/client-plugin/forge-event-node.ts`（组卡 re-emit/锚定）、必要时 ForgeEventEntries 行更新。

### 2.7 待用户裁决清单

| # | 决策点 | 备选 | 倾向 |
|---|---|---|---|
| D1 | 2.4 三态视觉分配 | 沿用既有词汇：running 蓝流光 / suspended 琥珀静态缘 / 终态渐隐离场（推荐）；或 suspended 另设新视觉 | 沿用 |
| D2 | 2.4 终态标识留存时长 | 渐隐离场维持现状（数秒）；或终态保留至下次循环启动 | 维持现状 |
| D3 | 2.6 修复方向 | CDP 归因定谳后于三轨中回填单轨（消费侧节流 / 增高后补落底 / 活跃 turn 锚定迁移） | 归因后定 |
| D4 | 2.3 convention 晋升 | 晋升 docs/conventions/ 正本 / 留 .knowledge/ | 晋升 |

## 3. 改动范围（file 粒度）

- `packages/plugin-forge/skills/review-proposal/SKILL.md`（检查项 +1）
- `packages/plugin-forge/skills/run-tests/SKILL.md`（取证断言口径 +1）
- `docs/conventions/`（晋升后的正本，若 2.3 获裁）
- `apps/web/src/client-plugin/sidebar-model.ts` + `ForgeWorkspacePanel.tsx`（2.4 循环状态标识恢复）
- `apps/web/src/views/session/ForgeEventEntries.tsx`（2.5 条目行去重；2.6 视归因可能涉及）
- `apps/web/src/client-plugin/forge-event-node.ts`（2.6 组卡 re-emit/锚定）

## 4. 验收标准

1. review-proposal 技能检查项含 wakeup 信息集五要素，含提案触发条件（新增 wakeup 径）。
2. run-tests/走查口径含计数断言实例边界要求。
3. 2.3 裁决结果（晋升/不晋升）落档。
4. 会话列表：dispatchTask 正门启动的循环，侧栏按 running/suspended/终态呈现区分标识（真机截图，恢复且状态可辨）；场景码 → 三态映射表以 FORGE_PROGRESS_SCENARIOS 单源落档。
5. 进度卡条目行不再出现 title 与 summary 同文重复（渲染层去重，数据面事件不动）。
6. 循环运行期 chat-view 保持贴底跟随（CDP 归因定谳 → 回填单轨修复 → 真机复验可滚到最新消息）。

## 5. 裁决台账

| # | 决策点 | 裁决 | 日期 |
|---|---|---|---|
| 提案裁决 | accept/reject | **accept** | 2026-10-28 |
| D1 | 三态视觉分配 | 沿用既有词汇（running 蓝流光 / suspended 琥珀静态缘 / 终态渐隐离场→按 D2 修订为持续保留） | 2026-10-28 |
| D2 | 终态标识留存 | **一直保留**——终态标识不消失，供用户查找执行过任务循环的会话 | 2026-10-28 |
| D3 | 2.6 修复方向 | CDP 归因定谳后回填单轨（归因前不锁定） | 2026-10-28 |
| D4 | convention 晋升 | 晋升 docs/conventions/ 正本 | 2026-10-28 |
| 补充裁决 | 2.5 条目行形态 | 去重并换行：title 与 detail 分行展示，不并一行 | 2026-10-28 |

## 指标对比附录（飞轮派生提案必带）

| 指标 | 基线（本提案注册时） | 目标 |
|---|---|---|
| 修正波次 | 8（越阈，阈值 6） | < 6 |
| fix 密度 | 36.4% | 下降 |
| 一次通过率 | 1 | 保持 1 |
| 返工增量比 | 0.0% | 保持 0.0% |
