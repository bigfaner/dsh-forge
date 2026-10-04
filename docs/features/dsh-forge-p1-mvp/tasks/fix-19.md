---
id: "fix-19"
title: "Fix(P0): 知识工具名含点号违反供应商工具名形——knowledge.search/read-abstract 改下划线形（knowledge_search / knowledge_read_abstract），全涟漪面同步 + 名形 pin"
priority: "P0"
estimated_time: "1.5h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P0): 知识工具名含点号违反供应商工具名形

> 来源：走查人实机（2026-10-03）「对话报错: Invalid 'tools[11].name': string does not match pattern. Expected ^[a-zA-Z0-9_-]+$ … INVALID_REQUEST」（DeepSeek-V41-Flash 端点）。

## Root Cause

产品注册的知识召回 tool 名 = `knowledge.search` / `knowledge.read-abstract`（[search.ts:83](../../../packages/knowledge/src/tools/search.ts) / [read-abstract.ts:58](../../../packages/knowledge/src/tools/read-abstract.ts)）——**含点号**，不匹配 OpenAI 兼容端点强制的工具名形 `^[a-zA-Z0-9_-]+$`。会话建立即组装全工具表（官方 ~10 + 产品 2），我们的落 tools[10]/[11] → **严格校验端点（DeepSeek）上每个请求 400，会话完全不可用**。dogfood e2e（zai 端点）不校验名形故未拦截——e2e 盲区。

## Description

**改名**：`knowledge.search` → `knowledge_search`；`knowledge.read-abstract` → `knowledge_read_abstract`（下划线形，名形合规且语义不变）。

**涟漪面同步**（全部点名，防漏改）：
1. 工具定义：tools/search.ts + read-abstract.ts（name 字段 + 文件头注 + 错误消息串「knowledge.search: …」等）
2. 系统提示词：prompt/index.ts 流程指引（:48/:51 两处工具名引用）
3. 单测：search.test.ts / read-abstract.test.ts / plugin.test.ts（:71/:78/:79/:101）/ integration-core.test.ts（多处 name 断言与提示词包含断言）
4. e2e：flywheel.spec.ts（tool/call 轨迹断言 + 提示词含工具名断言 + 4.2 记录里的锚）
5. 文档：packages/knowledge README 数据契约节、docs/architecture/web-ui-composition.md（§4 如引用）、SMOKE-LEDGER 相关行
6. **名形 pin（防回归核心）**：新增单测断言全部注册 tool 名匹配 `^[a-zA-Z0-9_-]+$`（对 rt.registeredTools 全集断言——含官方件在场时亦然，防未来再犯）

## Reference Files

- packages/knowledge/src/tools/{search,read-abstract}.ts — name 落点
- packages/knowledge/src/prompt/index.ts — 指引文本
- packages/knowledge/src/{plugin,integration-core}.test.ts + tools/*.test.ts — 断言
- e2e/specs/flywheel.spec.ts — 轨迹/提示词断言
- 报错原文（走查人）：request_id 264c1830-6ad1-4f73-a104-270f9bdf7507 / INVALID_REQUEST / tools[11].name

## Acceptance Criteria

- [ ] 两工具注册名 = `knowledge_search` / `knowledge_read_abstract`；**名形 pin 单测**（全集匹配 `^[a-zA-Z0-9_-]+$`）在场
- [ ] 涟漪面零漏改：grep `knowledge\.search|knowledge\.read-abstract` 全仓仅剩历史记录/报告类文档（源码/测试/e2e/活文档零命中）
- [ ] dogfood e2e（flywheel）断言同步后全绿（zai 端点）
- [ ] **严格端点实测**：DeepSeek 端点会话发消息成功往返（走查人实机确认——报错场景回归）
- [ ] tsc + lint + 定向单测绿

## User Stories

- Story 2（日常会话）：任意供应商端点会话可用（工具表合法）。

## Hard Rules

- 仅改名与文本涟漪——工具参数 schema/语义/服务面零变化（Hard Rule：检索语义与 SC10 断言面不动，仅名形）。
- 历史执行记录/走查报告中的旧名**不回写**（历史真相）；活文档（README/ARCHITECTURE/SMOKE-LEDGER）同步。
- 上游官方工具名不动（只改产品注册面）。

## Implementation Notes

- 改名后系统提示词指引同步是**必改项**（agent 依提示词调工具，名不一致则调不动）。
- e2e 盲区教训记录：zai 端点不校验名形 → 名形 pin 必须落在单测层（不依赖端点行为）。
