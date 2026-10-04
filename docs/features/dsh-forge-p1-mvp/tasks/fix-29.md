---
id: "fix-29"
title: "Fix: 会话页签行双『轨迹』——fix-25 产品 'dswf-trajectory' 与官方 ui-trajectory view（id='trajectory'，同 order 10）双占 conversation.view 名册：退役产品复刻、直用官方轨迹视图（UF-4 三签 = 官方 chat + 官方 trajectory + 产品 dswf-recall）"
priority: "P1"
estimated_time: "2h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 双『轨迹』页签——退役产品复刻，直用官方轨迹视图

> 来源：走查人实机（2026-10-04）「现在轨迹tab有两个，预期1个」。fix-25（官方 ConversationRoot 回归中区）落地后出现。

## 根因（源码实证）

fix-25 把产品 UF-4 页签迁上官方 `conversation.view` 名册时，官方名册里 **ui-trajectory 插件已注册同语义视图**：

- 官方：[dsh-client-ui-trajectory client.js:8736-8745](../../../apps/host/profile.dev/node_modules/@deepseek-ai/dsh-client-ui-trajectory/lib/client.js) `conversation.view id='trajectory' order=10 label=轨迹`（官方轨迹表视图：历史加载/折叠回合/图片子槽/消息-工具-compaction 定义族）；
- 产品：[plugin.ts:318-328](../../../apps/web/src/client-plugin/plugin.ts) `conversation.view id='dswf-trajectory' order=10 label='轨迹'`（TrajectoryLedger 最简台账 + fix-11 转录映射迁移版）；
- 同名册双占位 → 页签行：对话 / **轨迹（官方）** / **轨迹（产品）** / 知识召回。

fix-25 前不可见——影子替换吞掉了整条官方页签行；降位后官方名册浮现，冲突显形。

## Description

**退役产品 'dswf-trajectory' 注册，直用官方轨迹视图**（走查人官方优先方向一致：对话界面对齐原生 dsh）：

1. 删 plugin.ts `TRAJECTORY_VIEW_ID` 注册行（:318-328）+ product-views 的 ForgeTrajectoryView 发布面 + ConversationViews.tsx 轨迹视图件（TrajectoryLedger + fix-11 转录锚若仅服务该件则一并退役——官方视图自带官方数据管线，转录映射为自绘台账而设）；
2. 页签终态：**chat（官方）+ trajectory（官方，order 10）+ dswf-recall（产品，order 20）** —— UF-4 三签形态保持、每签唯一；
3. e2e/单测随迁：轨迹页签断言改官方 DOM 契约（`[data-conversation-tabs]` 内 label=轨迹 唯一 + 官方轨迹表锚）；产品轨迹视图相关测试退役/改官方面；
4. 备选（否决记录）：产品 profile patch 置停官方 ui-trajectory 行保产品台账——逆官方优先方向且弃官方富视图（历史加载/折叠/图片），不取；owner 若坚持产品台账形态可翻案此口径；
5. 顺手核对：召回视图（dswf-recall）无官方对位（知识召回 = 产品域）——不迁不并。

## 验收

1. 页签行恰三签：对话 / 轨迹 / 知识召回——『轨迹』唯一；官方轨迹视图内容正常（回合时序/工具行/历史加载）；
2. 页签切换 keep-alive 语义不回归（官方 roster 原生）；
3. e2e：三签唯一性 + 轨迹视图官方锚断言通过；产品视图退役后无死代码/死测试。

## Reference Files

- 官方（只读）：dsh-client-ui-trajectory client.js:8736-8745（view 注册面）/:8705-8735（定义族装配）
- 产品：apps/web/src/client-plugin/plugin.ts:317-328（退役点）、product-views.ts（发布面）、views/session/ConversationViews.tsx:205-233（轨迹视图件）、views/session/TrajectoryLedger.tsx + transcript 锚（随迁裁决）
- 关联：fix-25（降位重构——冲突引入点；其「对话 = 官方 chat 直用」的同型先例正是本任务对轨迹的口径）

## 边界与不做

- 不动官方 ui-trajectory（roster 出厂行保持）；
- dswf-recall（知识召回）保持产品注册（无官方对位）；
- TrajectoryLedger/transcript 映射若仍有其他消费面（如召回跳转）则保留数据面、只退视图注册——执行时按消费清点裁决。
