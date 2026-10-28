---
name: gen-contracts
description: 从 Journey 文档与代码侦察生成 Contract 规格——六维度语义描述符、风险驱动的 Outcome 密度、手册导出的技术锚点，每步一份文件落 contracts/ 下。
---

# 生成契约（gen-contracts）

每个 Journey Step 得到一份 Contract：六维度声明配**语义描述符**（表达业务意图的自然语言——regex 与框架断言推迟到 `gen-test-scripts`）。存在设计手册时，Contract frontmatter 携带**技术锚点**（endpoint / command / page / screen），把设计意图桥接到测试代码。

<HARD-GATE> 本技能只写 `testing/<journey>/contracts/`（feature 目录下——存储布局见 forge-pipeline 系统提示段「文档位置」）。不写测试脚本、不执行、不碰其他路径。 </HARD-GATE>

## 前置条件

| 工件 | 缺失时 |
|---|---|
| `testing/` 下 ≥1 个含 `journey.md` 的 Journey 目录 | 先跑 `gen-journeys` |

## State-Layer Discipline (boundary)

Contract 文件是 `testing/<journey>/contracts/` 下的磁盘工件——注册表词表**没有 contract kind**；**不得**经 `upsertFeatureDoc` 注册。管线位置由任务域承载（`test-gen-contracts` / `test-gen-scripts`）。

## 工作流

1. **读 Journeys**——`testing/` 下每个 Journey 目录；绝不按风险或体量跳过。解析名称、风险级、happy path 步骤、边界用例、不变式。
2. **代码侦察（事实表）**——读源码提取地面真值（签名、输出格式、错误码、副作用、前置条件）并附来源引用。把事实表写入/合并 `.forge/fact-table.json`（`source: "static"`、`confidence: "inferred"`；按 `fact_id` 合并，绝不删除运行期条目）。
3. **装载手册 + 锚点**——按 Journey 的模块归属（monorepo，全链统一判据：journey frontmatter `module` = 模块**唯一标识**如 `web`，非路径；单仓省略）与交互形态装载对应设计手册（手册产出约定以 tech-design 技能为正本）。手册缺失 → 跳过锚点填充并留提示，绝不中止。手册过期（生成早于当前 tech-design）→ 警告并继续。锚点**只**来自手册——绝不从代码逆向；匹配不上的 Step 锚点留空而不臆造。任一锚点被填充时写 `last_anchor_sync`（ISO-8601）。
4. **生成 Contract**——每步一份文件：`step-<N>-<action-slug>.md`。一个 Step 的全部 Outcome 共享其文件；happy path 步骤成为 `success` Outcome，边界用例成为带分叉 Preconditions 的附加 Outcome。
   - **每 Outcome 六维度**：Preconditions、Input、Output、State（必备）；Side-effect、Invariants（可选，缺省 `none` / 无）。
   - **fixture_spec 强制**在 Preconditions 内：声明式的既有数据状态（实体、关系、最低数量）。缺它即无效 Contract。
   - **Preconditions 互斥**：任一系统状态下至多一个 Outcome 的 Preconditions 成立；每 Step >5 个 Outcome 触发评审。
   - **风险驱动密度**（按 `risk_level`）：High 3-5 Outcome/步、13-20/Journey；Medium 2-3、8-12；Low 1-2、4-7。生成优先序：happy path → 形态必需 →事实表知情的边界（注 `source: inferred` + 理由）→ LLM 推断边界（仅 High/Medium）。匹配 Steps 的形态必需 Outcome 强制：cli `not-found` / `already-exists`；api `unauthorized`（需认证端点）；web `validation-error`（表单）/ `session-expired`（会话依赖）。
   - 每份 Contract 文件以 `## Journey Invariants` 节收尾（≥1 条）。
5. **校验**——schema 检查：必备维度非空；fixture_spec 在位；描述符无 regex；Outcome 名唯一；互斥；不变式节；side-effect 缺省；锚点 frontmatter 结构 +同步时间戳。失败时携错误回喂重新生成违规文件**一次**；仍失败 → 停止并呈报待人工修复的不合规清单（绝不带无效 Contract 继续）。
6. **写出**到 `testing/<journey>/contracts/`；保持事实表最新。
