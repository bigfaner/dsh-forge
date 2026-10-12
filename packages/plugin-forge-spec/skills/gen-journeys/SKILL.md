---
name: gen-journeys
description: 从 PRD 用户故事或提案中提取 Journey 叙事（带 High/Medium/Low 风险分级）——每条 Journey 一份 journey.md 落 testing/ 下，是 gen-contracts 的输入。
---

# 生成旅程（gen-journeys）

纯叙事提取——不做代码侦察。每条用户工作流成为一份 Journey 文档，描述 happy path +
边界用例 + 不变式。

<HARD-GATE>
本技能只生成 Journey 叙事文档。契约、测试脚本与代码属下游技能 `gen-contracts` 与
`gen-test-scripts`。
</HARD-GATE>

## State-Layer Discipline (boundary)

Journey 文档是 feature 测试树下的磁盘工件——文档注册表词表（七种 phase kind）
**没有 journey kind**，因此 journey **不**经 `upsertFeatureDoc` 注册。其管线位置由
任务域承载：`test-gen-journeys` / `eval-journey` / `test-gen-contracts` 任务类型及其
依赖。不写任务文件或索引——任务经 `addTask` 活在状态层（拆解期创建，不在此处）。

## 管线位置

```
gen-journeys → eval (journey) → gen-contracts → eval (contract) → gen-test-scripts → run-tests
 (叙事)                        (技术)                       (代码生成)        (执行)
```

## 输入模式（按文件存在性自动判别——绝不问用户哪种模式）

**PRD 模式**（缺省；`prd/prd-user-stories.md` + `prd/prd-spec.md` 存在）：一条用户故事 =
一条 Journey 候选；朝同一目标递进的连续故事合并；每条 Journey 可回溯到具体故事 ID。
`prd/prd-ui-functions.md`（若存在）把 UI 交互映射为步骤。

**提案模式**（PRD 文件缺失、`docs/proposals/<slug>/proposal.md` 存在）：Scope 与
Success Criteria 节**必备**——任一缺失 → 带诊断中止，不生成。一个 Key Scenario =
一条 Journey 候选；无 Key Scenarios 时从 Success Criteria/Scope 推导 smoke 级
Journey，frontmatter 注 `quality: low` 并在正文加质量提示。每条 Journey 可回溯到
提案小节。

两类来源都不存在 → 中止并列出缺失文件。

## 核心概念

- **Journey**：kebab-case 名称（`task-lifecycle`）、Risk、有序 Steps（用户动作 +
  预期结果）、Invariants（跨步约束）。
- **Risk**：`High`（状态变更/数据丢失/不可逆——边界用例数必须 ≥ happy path 步数）、
  `Medium`（多步、无不可逆副作用——按分支前置条件配边界用例）、`Low`（只读——仅
  happy path + 关键错误）。从 PRD 推断：增/删/改 → High；查/列/搜 → Low。
- **Golden Path**（必备）：每特性 ≥1 条 Journey 覆盖主故事的核心域动作序列，≥3 步，
  用领域术语（不用 API 术语）。复杂特性（≥2 类实体且存在父子关系）要求 ≥5 步跨实体
  步骤。

## 表面处理

本环境没有表面注册表 CLI。从仓库自身探测表面：`docs/conventions/testing/` 结构
（逐表面约定目录）、既有 journey 的 `surface_types`、feature 任务的表面字段。支持
类型：`web`、`api`、`cli`、`tui`、`mobile`。绝不猜——含糊且交互式 → 问用户；派发
任务语境 → 从任务简报推导并记录选择。每条 Journey 声明 `surface_types` +
`surface_keys`；全部 Journey 的并集必须覆盖每个已配置的表面类型与键。

## 工作流

1. **读输入源**（按判别出的模式）。不读源代码——提取仅限叙事。
2. **识别工作流**（含 Golden Path）并逐条结构化：名称、happy path 步骤、边界用例
   （引用 happy path 步骤的分叉前置条件）、预期结果、搭建前置条件。
3. **分级风险**（按上表）；提取产出的边界用例不足时补生成（非法输入、缺失前置
   条件、并发操作、边界值），强制 High 风险边界密度达标。
4. **逐 Journey 生成文件**——每条 Journey 一个目录：
   `docs/features/<slug>/testing/<journey-name>/journey.md`，frontmatter：

   ```yaml
   ---
   feature: "<slug>"
   journey: "<name>"
   risk_level: "High|Medium|Low"
   quality: low          # 仅提案模式且无 Key Scenarios 时
   surface_types: ["web"]
   surface_keys: ["<key>"]
   sources: ["<input doc paths>"]
   generated: "YYYY-MM-DD"
   ---
   ```

   正文：搭建前置条件 → 编号 happy path 步骤（每步：用户动作 + 预期结果）→ 边界
   用例（被引步骤 + 分叉前置条件 + 动作 + 结果）→ Journey Invariants。一条 Journey
   = 一份内聚文档；内容大时内部分批写，绝不拆文件。
5. **逐 Journey 校验**：名称在位；风险级有效；表面字段非空且与探测面匹配；
   ≥1 条 happy path 步骤；≥1 条边界用例；High 风险密度达标；≥1 条不变式；每步有
   动作 + 预期结果；PRD/提案可回溯；表面覆盖完整。失败先修复再收尾。
6. **呈报**——交互式呈现生成的 Journey；派发则在任务输出中汇总。质量门：`eval`
   技能以 `--type journey` 逐条评分；低于目标的 Journey 阻塞 `gen-contracts`
   （那是它的 gate，不是本技能的）。

## 文档风格公约

- **mermaid 优先**：结构与流程用图表达，文字做补充而非替代。
- **文字精简**：一段一个含义，无歧义短语，不留废话。
- **不留调整修复叙事**：文档写最终态，不写"原来如何、后来改成什么"的过程史。

## 下一步

`eval --type journey`，随后 `gen-contracts`。
