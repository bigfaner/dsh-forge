---
name: gen-journeys
description: 从 PRD 用户故事中提取 Journey 叙事（带 High/Medium/Low 风险分级）——每条 Journey 一份 journey.md 落 testing/ 下，是 gen-contracts 的输入。
---

# 生成旅程（gen-journeys）

纯叙事提取——不做代码侦察。每条用户工作流成为一份 Journey 文档，描述 happy path +边界用例 + 不变式。

<HARD-GATE> 本技能只生成 Journey 叙事文档。契约、测试脚本与代码属下游技能 `gen-contracts` 与 `gen-test-scripts`。 </HARD-GATE>

## State-Layer Discipline (boundary)

Journey 文档是 feature 测试树下的磁盘工件——文档注册表词表（七种 phase kind）**没有 journey kind**，因此 journey **不**经 `upsertFeatureDoc` 注册。其管线位置由任务域承载：`test-gen-journeys` / `eval-journey` / `test-gen-contracts` 任务类型及其依赖。不写任务文件或索引——任务经 `addTask` 活在状态层（拆解期创建，不在此处）。存储布局（`<slug>` feature 目录树）见 forge-pipeline 系统提示段「文档位置」。

## 管线位置

```
gen-journeys → eval (journey) → gen-contracts → eval (contract) → gen-test-scripts → run-tests
 (叙事)                        (技术)                       (代码生成)        (执行)
```

## 输入模式

**PRD 模式**（`prd/prd-user-stories.md` + `prd/prd-spec.md` 存在）：一条用户故事 =一条 Journey 候选；朝同一目标递进的连续故事合并；每条 Journey 可回溯到具体故事 ID。`prd/prd-ui-functions.md`（若存在）把 UI 交互映射为步骤。

任一 PRD 文件缺失 → 带诊断中止并列出缺失文件，不生成。

## 核心概念

- **Journey**：kebab-case 名称（`task-lifecycle`，模块内唯一）、Risk、有序 Steps（用户动作 +预期结果）、Invariants（跨步约束）。
- **模块归属**（monorepo）：每条 Journey 落到唯一目标模块（workspace 包/应用目录，如 `apps/web`、`packages/core`）——从用户故事与 PRD UI 函数的落位推断；跨模块工作流按主落位模块归属并在正文标注跨界步骤。单仓无此概念。含糊 → 问用户（交互式）或从简报推导并记录选择。
- **Risk**：`High`（状态变更/数据丢失/不可逆——边界用例数必须 ≥ happy path 步数）、`Medium`（多步、无不可逆副作用——按分支前置条件配边界用例）、`Low`（只读——仅 happy path + 关键错误）。从 PRD 推断：增/删/改 → High；查/列/搜 → Low。
- **Golden Path**（必备）：每特性 ≥1 条 Journey 覆盖主故事的核心域动作序列，≥3 步，用领域术语（不用 API 术语）。复杂特性（≥2 类实体且存在父子关系）要求 ≥5 步跨实体步骤。

## 工作流

1. **读输入源**（按判别出的模式）。不读源代码——提取仅限叙事。
2. **识别工作流**（含 Golden Path）并逐条结构化：名称、happy path 步骤、边界用例（引用 happy path 步骤的分叉前置条件）、预期结果、搭建前置条件。
3. **分级风险**（按上表）；提取产出的边界用例不足时补生成（非法输入、缺失前置条件、并发操作、边界值），强制 High 风险边界密度达标。
4. **逐 Journey 生成文件**——每条 Journey 一个目录：`testing/<journey-name>/journey.md`（feature 目录下），frontmatter：

   ```yaml
   ---
   feature: "<slug>"
   journey: "<name>"
   risk_level: "High|Medium|Low"
   module: "<module-path>"   # monorepo 必填（目标模块目录）；单仓省略本行
   sources: ["<input doc paths>"]
   generated: "YYYY-MM-DD"
   ---
   ```

   正文：搭建前置条件 → 编号 happy path 步骤（每步：用户动作 + 预期结果）→ 边界用例（被引步骤 + 分叉前置条件 + 动作 + 结果）→ Journey Invariants。一条 Journey = 一份内聚文档；内容大时内部分批写，绝不拆文件。
5. **逐 Journey 校验**：名称在位；风险级有效；monorepo 下 `module` 非空且为真实模块目录；≥1 条 happy path 步骤；≥1 条边界用例；High 风险密度达标；≥1 条不变式；每步有动作 + 预期结果；PRD 可回溯。失败先修复再收尾。
6. **呈报**——交互式呈现生成的 Journey；派发则在任务输出中汇总。质量门：`eval` 技能以 `--type journey` 逐条评分；低于目标的 Journey 阻塞 `gen-contracts`（那是它的 gate，不是本技能的）。
