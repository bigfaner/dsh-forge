---
title: tool 返回面 lossless JSON 合规修复（createProposal/transitionProposal 显式 undefined 键）
status: draft
---

# 提案：tool-row-lossless-json-fix（blitz）

## 症状

`createProposal` tool 调用报：

```
Error: tool "createProposal" returned invalid output: value is not lossless JSON
```

而 DB 行已落库（proposals 表在场、事件已发射）——**写路径成功、报错发生在返回值校验层**。后续重试撞 slug UNIQUE 冲突，agent 被错误信令误导。

## 根因链（已核实）

1. 报错点：DSH harness `@deepseek-ai/dsh-tools` `snapshotToolValue` → `ToolOutputError(INVALID_TOOL_OUTPUT)`——tool `execute` 返回后在输出快照边界校验，晚于业务写入。
2. 校验规则：`@deepseek-ai/dsh-util-values` `snapshotJsonValue` 迭代遍历——`Reflect.ownKeys` 收录显式赋 `undefined` 值的键；访问到 `undefined` 值时 `typeof !== "object"` → **整个返回值判非 lossless JSON 拒绝**。
3. 污染源：`packages/core/src/forge/small-domains/proposals.ts` `toProposalRow`（L125-141）NULL 列映射用 `?? undefined`——DTO 带显式 `undefined` 属性：
   - `author: row.author ?? undefined`——INSERT 恒置 author NULL → **createProposal 100% 复现**；
   - `relPath/decidedAt/mode/supersededBy` 在 NULL 时同病。
   - `toChainedFeature`（L95-106）`summary/proposalId ?? undefined` 同病——transitionProposal 成链分支连带。
4. 本仓两种写法并存：`tasks/query.ts`（L99-111）条件展开 `...(row.x !== null ? { key: row.x } : {})` = 键缺席，合规；proposals/features 域 `?? undefined` = 违规。

## 爆炸半径

- **tool 面（严格边界，必炸）**：`createProposal`、`transitionProposal`（同一对映射器；含 superseded/chained 路径）。
- **RPC 面（Electron 结构化克隆，宽容）**：`forge:proposals/list` 等 GUI 通道不受扰——undefined 属性跨 IPC 存活且无害。
- 已排查安全：`addTask`（纯标量返回）、`submitTask`（`{taskId,status,restored[]}`）、`queryTask`（条件展开）、`dispatchTask`（条件展开，dispatch-task.ts L504-519）。
- 次级污染点（RPC/prompt-input 面，非本修必改，任务内逐点处置）：`tasks/list.ts` L226-227、`tasks/claim.ts` L217-218、`small-domains/features.ts` L121-122/L133、`tasks/detail.ts` L87（`registry.get` 缺省 undefined）。

## 修法

- `toProposalRow`/`toChainedFeature` NULL 列映射改条件展开（对齐 `tasks/query.ts` 房式）——NULL = 键缺席，可选字段语义不变（`ProposalRow` 可选键本就缺席式）。
- 回归测试：镜像 lossless 规则的走查助手（自实现递归断言「无 own enumerable undefined 值属性」——不引 DSH 运行时依赖），覆盖 create（author 恒 NULL）、transition accepted（decidedAt 写入/supersededBy 缺席）、superseded（supersededBy 在场）、chained（summary NULL）四路。
- 次级污染点逐点处置：tool 可达路径必改；纯 RPC 面留注释口径（或顺手同式收敛），处置清单落任务总结。

## 验收

- `pnpm vitest run packages/core/src/forge/small-domains packages/plugin-forge` 全绿（新增回归用例在场）。
- 新用例证明：createProposal/transitionProposal 返回 DTO 走查零显式 undefined 属性。
- 次级污染点各有处置（改条件展开或注释留 RPC 面口径）。
