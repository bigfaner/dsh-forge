# 预设专家档案来源核对留痕（PERSONA_VARIANTS → 档案，有实战历史 13 类）

日期：2026-11-05 ｜ 对象：`packages/plugin-forge/experts/` ｜ 参照正本：`packages/core/src/forge/tasks/prompt/persona.ts` `PERSONA_VARIANTS`

## 实战历史分层依据

任务类型使用历史取自 `docs/features/*/tasks/*.md` frontmatter `type:` 记录（p1-mvp / m2-pipeline / m3-bootstrap-presets 三个 feature，192 条）——出现过即认定有实战历史。有历史 13 类 / 从未使用 7 类（新撰类见 [expert-draft-review.md](expert-draft-review.md)），合计 20，与 contracts `TASK_TYPES` 词汇一一对应无缺漏。

## 逐类型核对表（13 类）

迁移规则：矩阵 `expert.title` → frontmatter `title`；`expert.creed` → 正文「信条」（逐字保留）；gate/workflow 中的**类型级**指引（无编译/测试门禁、fix-bug 强制、run-tests 强制、gen-* 技能强制、判据缺失 blocked 等）化入「职责/边界」；**程序段**（复杂度分级门禁、结算纪律、反搅动锚、任务目录锚点节）不入档案（提案 §3 纳入 2 拆解线）。

| # | 键 | 实战证据（任务文件） | 矩阵出处 | title | creed | 类型级 gate/workflow 去向 |
|---|---|---|---|---|---|---|
| 1 | coding-feature | p1/m2/m3 大量 `coding.feature` 任务 | persona.ts:158-165 | 资深全栈工程师（逐字） | 逐字 | 规格唯一事实源/既有包内落码 → 边界；TDD 常驻 → 职责 |
| 2 | coding-fix | fix-1..45（p1 44 条 / m2 2 / m3 3） | persona.ts:198-205 | 缺陷修复专家（逐字） | 逐字 | fix-bug 强制、两阶段落库、recurrence_of 挂链 → 职责/边界/skills；Hard Rules fix 条款优先 → 边界 |
| 3 | gate | 1-5.gate ×3 feature | persona.ts:275-279 | 质量门守卫（逐字） | 逐字 | 全量套件、缺判据 blocked、口径可复现 → 职责/边界 |
| 4 | doc | m2 3.3/3.2、m3 3.6/5.4 及本轮 | persona.ts:235-242 | 技术作家（逐字） | 逐字 | AC 核查+落盘验证、mermaid/精简行文 → 职责/边界 |
| 5 | doc-consolidate | consolidate-specs ×3 | persona.ts:243-250 | 文档整合专家（逐字） | 逐字 | 语义零损失自查、只归并不新撰 → 边界 |
| 6 | doc-review | review-doc ×2 | persona.ts:259-266 | 文档评审员（逐字） | 逐字 | 意见可定位（原文位置）、只评审不代改 → 边界 |
| 7 | doc-summary | N.summary ×15（1-5.summary） | persona.ts:267-274 | 摘要提炼师（逐字） | 逐字 | 定式五节结构、不强制插图 → 边界 |
| 8 | test-run | run-test ×3 | persona.ts:206-210 | 测试指挥官（逐字） | 逐字 | run-tests 强制、失败如实 blocked、不改产品代码 → 职责/边界/skills |
| 9 | test-gen-contracts | gen-contracts ×3 | persona.ts:211-218 | 契约规格工程师（逐字） | 逐字 | gen-contracts 强制、六维度 Contract → 职责/skills |
| 10 | test-gen-journeys | gen-journeys ×3 | persona.ts:219-226 | 旅程叙事工程师（逐字） | 逐字 | gen-journeys 强制、风险分级+表面声明 → 职责/skills |
| 11 | test-gen-scripts | gen-test-scripts ×3 | persona.ts:227-234 | 测试脚本工程师（逐字） | 逐字 | gen-test-scripts 强制、@feature 对齐契约、编译门 → 职责/边界/skills |
| 12 | eval-contract | eval-contract ×3 | persona.ts:290-294 | 评估执行员（逐字） | 逐字 | 判据缺失 blocked、评分入 summary、只评不改 → 职责/边界 |
| 13 | eval-journey | eval-journey ×3 | persona.ts:295-299 | 旅程评估员（逐字） | 逐字 | 同上（旅程面口径）→ 职责/边界 |

## 机器门核验

`parseExpertFile` 同口径批量校验 20/20 PASS（YAML 可解析、无裸 `{{`、name/title/description/tools 必填、name=文件名、正文三段齐）——证据：[experts-gate-check.txt](experts-gate-check.txt)（由任务日志 `001-gate-check/gate-check.mjs` 生成）。

## 未迁入项说明（程序段保留，与档案零重复）

- 复杂度分级保底门（baselineGate low/medium/high）、结算纪律、反搅动锚 ×6、任务目录锚点节——留 `persona.ts` 程序段渲染（提案 §2.4）。
- Coding/Testing Strategy 共享段（TDD 统一、双轨方法论）为 9 类共用程序内容，不逐档案复制；档案正文仅承载该类型的独有语义（如 coding-fix 的落库链、test-gen 的技能强制）。
