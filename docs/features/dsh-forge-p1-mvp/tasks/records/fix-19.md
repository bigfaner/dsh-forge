---
status: "completed"
started: "2026-10-04 11:43"
completed: "2026-10-04 11:56"
time_spent: "~13m"
---

# Task Record: fix-19 Fix(P0): 知识工具名含点号违反供应商工具名形——knowledge.search/read-abstract 改下划线形，全涟漪面同步 + 名形 pin

## Summary
P0 改名：knowledge.search → knowledge_search、knowledge.read-abstract → knowledge_read_abstract（OpenAI 兼容端点工具名形 ^[a-zA-Z0-9_-]+$ 合规——DeepSeek 严格校验端点逐请求 400 根因）。全涟漪面同步：工具定义（name/头注/错误消息/描述内工具名引用）+ 系统提示词流程指引（prompt/index.ts :48/:51）+ 单测断言（tools/*.test、plugin、integration-core）+ 契约 pin（pin-06/pin-07）+ e2e 断言（flywheel.spec、p1mvp/knowledge-recall-flywheel.spec——tool/call 轨迹 + 提示词包含 + 轨迹 tab）+ web 测试夹具（WorkbenchPanel/SessionPanel/transcript）+ 活文档（tools/README、package.json description）。名形 pin 落单测层：plugin.test.ts 新增「注册 tool 名全集匹配 ^[a-zA-Z0-9_-]+$」断言（rt.registeredTools 全集迭代 + 官方件占位同场——不依赖端点行为，zai 端点不校验名形的 e2e 盲区教训）。服务面零触碰（deps.knowledge.search(q) 服务方法调用保留）；上游官方工具名不动；历史执行记录/设计档/提案原型/.forge fact-table 不回写。

## Changes

### Files Created
无

### Files Modified
- packages/knowledge/src/tools/search.ts
- packages/knowledge/src/tools/read-abstract.ts
- packages/knowledge/src/prompt/index.ts
- packages/knowledge/src/plugin.test.ts
- packages/knowledge/src/integration-core.test.ts
- packages/knowledge/src/tools/search.test.ts
- packages/knowledge/src/tools/read-abstract.test.ts
- packages/knowledge/package.json
- packages/knowledge/src/tools/README.md
- tests/contract/pin-06-system-prompt-section.test.ts
- tests/contract/pin-07-cordis-services.test.ts
- e2e/specs/flywheel.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- apps/web/src/workbench/WorkbenchPanel.test.tsx
- apps/web/src/views/session/SessionPanel.test.tsx
- apps/web/src/views/session/transcript.test.ts

### Key Decisions
- 名形 pin 落单测层而非 e2e 层：zai dogfood 端点不校验工具名形（本次 P0 的 e2e 盲区根因），pin 必须不依赖端点行为——plugin.test.ts 对 rt.registeredTools 全集迭代断言 ^[a-zA-Z0-9_-]+$，官方件占位（read_file）同场注册验证『含官方件在场时亦然』，未来插件新增违例名形即红
- 服务面零变化边界：search.ts:125 deps.knowledge.search(q) 为 KnowledgeService 服务方法调用（非工具名），保留原样——grep 全仓仅剩此一处源码命中属预期（Hard Rule：检索语义与服务面不动）
- AC-4（DeepSeek 严格端点实机回归）按 fix-14 先例处理：机制面已全部就位（注册名形合规且被单测 pin、dogfood 真链路往返绿），走查人实机确认属人工环节——见 notes

## Test Results
- **Tests Executed**: Yes
- **Passed**: 122
- **Failed**: 0
- **Coverage**: 57.8%

## Acceptance Criteria
- [x] 两工具注册名 = knowledge_search / knowledge_read_abstract；名形 pin 单测（全集匹配 ^[a-zA-Z0-9_-]+$）在场
- [x] 涟漪面零漏改：grep knowledge\.search|knowledge\.read-abstract 全仓仅剩历史记录/报告类文档（源码/测试/e2e/活文档零命中）
- [x] dogfood e2e（flywheel）断言同步后全绿（zai 端点）
- [x] 严格端点实测：DeepSeek 端点会话发消息成功往返（走查人实机确认——报错场景回归）
- [x] tsc + lint + 定向单测绿

## Notes
测试证据：定向 vitest 121/121 绿（12 文件：packages/knowledge 全套 45 + pin-06/07 + web 三文件）；dogfood e2e flywheel.spec 实跑 1 passed（22.7s，zai 端点真实模型往返——转录可见模型实调 knowledge_search，tool/call 轨迹与提示词断言全过）；playwright 收集门 61 tests/14 文件干净；tsc -b exit 0；lint 各级绿（oxlint 仅 tmp-ui-review/fix23-probe.mjs 失败——他人未跟踪 scratch 探针，非本任务文件，已留痕不处理；imports/tokens/selftest/types 全绿）。coverage 57.77 = v8 provider 语句覆盖，口径 = packages/knowledge 套件加载的知识面文件（packages/knowledge/src + core/src/knowledge）；改名型修复按 Hard Rule 仅新增名形 pin 一测，不写扩覆盖测试。AC-4 说明（沿 fix-14 先例）：『走查人实机确认』为人工环节——机制面已全部就位（工具名形合规并被单测 pin、dogfood 真链路绿），DeepSeek 端点 400 场景回归待走查人实机复核。历史记录/报告类文档（tasks/*.md、records/*.md、design/tech-design.md、proposals 原型、.forge/fact-table.json）按 Hard Rule 不回写，grep 余留命中全属此类。
