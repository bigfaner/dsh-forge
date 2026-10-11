---
created: "2026-10-11"
author: "faner"
status: "Draft"
intent: "enhancement"
---

# Proposal: worker 提效——分层提示词 + 定向质量门 + 摘要结构化（worker-lean-execution）

> **定位**：worker 派发面的执行效率与产物可读性优化（行为增强，非新能力面）。
> **战术基调**：提速靠三杠杆（按会话解剖实测排序）——档位调优（模型生成占 62-94% 墙钟）、
> 反搅动纪律（砍步数：墙钟与步数强线性 12-17s/步）、定向门（砍与改动面无关的机械成本）；
> 纪律本身（TDD、先思考、外科手术式修改）保留且推崇。

## Problem

worker 执行慢、流程重、摘要难读。四个病灶（代码证据 + 会话解剖实测）：

1. **模型生成占 62-94% 墙钟 + 两代慢档位**：工具执行仅占 10-14%，其余全是模型生成
   （步进间隙均值 8-12.5s、峰值 235s）。worker 档位两代皆慢——早期 inherit 解析为
   `glm-5.3/max`、近期显式 `glm-5.3-flash/high`——快档配置从未用过。
2. **步数爆炸（58-201 步/任务）**：碎片化编辑（30-48 edit 摊 11-14 文件）、探索搅动
   （`ls` 类 pwsh 单任务 41 次、同文件重复读、整树 glob 单次 14-16s）、门迭代循环
   （lint 重跑 8 次、vitest 重跑 10+ 次）、git 轮询 6-14 次/任务。
3. **全仓质量门税**：`just compile`=`pnpm build` 全仓、`just lint`=6 道全仓检查；单次不慢
   （lint ~15s、compile 4-6s、定向 vitest 4-19s），贵在固定序列 × 重跑轮次，且未分层测试。
4. **摘要两头病**：submit 侧无结构化 AC/决策承载（全糊进 summary 自由文本）；面板把纯文本
   整段平铺（时间线 Note 无折叠、「目标/结果」行内联 span 压成一串）。

### Evidence

- **会话解剖实测（三轮）**：总体 = 6 特性 ~45 个已结算 worker（3.8-77.7 分钟），深度解剖
  16 会话 + 3 会话逐次归因：
  | 任务 | 墙钟 | 工具执行 | 模型生成 | 步数 | edit | pwsh 探索类 |
  |---|---|---|---|---|---|---|
  | 1.6 | 31.9m | 3.2m (10%) | 28.7m | 166 | 48 次/14 文件 | 18 |
  | 1.8 | 32.0m | 3.1m (10%) | 28.9m | 201 | 35 次/11 文件 | 41 |
  | 1.7 | 13.6m | 1.5m (11%) | 12.1m | 58 | 30 次/12 文件 | 1 |
  | 1.11 | 19.9m | 2.7m (14%) | 17.2m | 83 | 39 次/11 文件 | 5 |
  - 模型生成占比 62-94%（唯一低值 26% 为刻意 sleep 的观测探针）；步数与墙钟强线性
    （12-17s/步）；两代档位（`glm-5.3/max` 继承期 → `glm-5.3-flash/high` 显式期）；
  - 「范围外用例失败致重复执行」假说不成立（逐次归因：定向单测首发全过/唯一失败在编辑集内/
    全绿重复扫场）；真实三模式 = 自愿进 e2e 调试循环（15+ 次 test:e2e + 自创探针 spec）、
    沙箱环境摩擦重造轮子（自建 node-spawn-guard + 4 个自定义 vitest 配置）、全绿后重复扫场。
- 约束块固定四步门：`packages/core/src/forge/tasks/prompt/compose.ts`（CONSTRAINTS_BLOCK）；
  定向检查步/终局门表：`templates/shared.ts`（targetedChecksStep / GATE_QUALITY_TABLE）
- 全仓配方：仓根 `justfile`（compile=`pnpm build`=tsc -b 全仓 + vite；lint=6 道全仓检查）
- 摘要渲染平铺：`apps/web/src/views/overview/drawer/timeline.tsx`（Note）、
  `drawer/index.tsx`（ResultView 内联 span）
- SURFACE 缺口：run-tests SKILL.md 期待从 task context 取 SURFACE_KEY/TYPE，
  compose.ts renderTaskContext 不产出——老 forge 21 模板全有，M3 平移丢失
- 上游能力盘点（全量核对，无缺口）：persona per-spawn 遮蔽 ✅（applyChildComposition scoped
  段，optionalString 无长度上限）；toolFilter per-child ✅；子会话继承父组合全部插件 ✅
  （composeFrom——todo/技能目录/compaction/AGENTS.md 全达 worker）；同回合并行多调用 ✅；
  read_image（coding/validation 族）✅；jobs ✅；AGENTS.md 送达 ✅（**maxBytes 65536**）；
  技能按需加载 ✅；worker 档位三键 ✅；fs 落盘 ✅。不依赖的缺口：skill 按子会话过滤（无钩子，
  已裁）、批量 fs 工具（read/write/edit 皆单文件单操作——同回合并行调用替代）

## Solution

杠杆排序：**L1 档位调优（零代码）＞ L2 反搅动纪律（砍步数）＞ L3 定向门（省工具时间 +
砍重跑轮次）**。六条改动线（S4 为移交占位）：

### S0 档位调优（运营交付，零代码——最大杠杆）

- worker reasoning `high → default`（ForgeSettings.worker 已支持，改完即生效）。'default'
  = 不下发 effort、落模型自带默认档——**交付时先跑一轮步进间隙对比（基线 12-17s/步）再定档**。
- AGENTS.md worker 使用段：default 起步建议 + 任务级升档指引 + 定向命令约定（受影响包的
  检查/测试命令惯例）+ **沙箱环境摩擦标准解**（EPERM 等的规范规避命令/配置——实测每会话
  重造轮子）。

### S1 定向门 + 分级 + 测试分层（门纪律段——承载面 = worker persona，见 S2a）

- **保底门**（必须，命令 agent 自选，不用固定 just 配方）：① 受影响包的类型检查/构建
  （含直接依赖它的包）；② 改动文件 lint；③ 改动包/模块的**定向单元测试**（vitest 级）。
- **测试分层**：gate 任务 = 全面测试（全量单元测试，GATE_QUALITY_TABLE 消费面收窄至 gate
  单族）；非 gate 的代码触及类任务（coding 族/test-gen/validation-code）= 保底门；validation-ux
  = 视觉验收主径；doc/eval/test-run 的门各如其类型变体表；run-tests 技能仅 test-run 使用。
- **UI 视觉验收**：触及 UI 的任务要求视觉验收（效果截图判读）；**验收工具与方式由 agent
  自行决定，不写死**——工具约定由用户在 AGENTS.md 写明或任务内容指定，变体引导只声明
  「须以效果截图为据完成视觉验收」。
- **分级**：complexity=low → 保底③ + ①②裁剪版（改动文件 lint + 改动包类型检查）；
  medium/high → 保底门全走。
- **如实上报**（恒定核心段④单源——门变体仅含「门布尔零妥协」语境句）；失败分诊/提交纪律/
  不越权三节维持原语义。

### S2 分层承载：系统提示词装 agent 级、初始提示词装任务级

**承载通道**：上游 `SubagentStartRequest.persona` → 子会话 scoped `deployment:persona-prefix`
段遮蔽部署人格（dsh-subagent `applyChildComposition` 源码级验证）；**合成放 plugin-forge**
（消费 claimed.task.taskType + complexity，零 DTO 改动）；spawn 请求（SpawnWorker 面 +
in-process-driver）增 persona 透传；persona 文本禁裸 `{{`（上游严格插值）。

#### S2a worker 系统提示词（persona——agent 级：工作流程与风格）

**组成矩阵**：恒定核心段（单源常量，20 类型全在场）+ 类型变体段（按 taskType 路由；
复杂度分级为变体段内第二维）。

**恒定核心段**（**通用纪律，不涉任何任务域——代码/测试/文档专属内容一律下沉变体段**）：
① 风格/人格（先思考定方案与改动范围再动手、最小改动、Simplicity First、自适应策略与验收 +
Tradeoff 分级行 + worker 作风行）；② 失败分诊；③ 提交纪律 + 不越权；④ 如实上报；
⑤ 反搅动纪律 ×6（通用工具纪律）；⑥ 产物落盘约定；⑦ todo_write 引导；⑧ ask 二分。
（TDD 推崇、外科手术式精确修改、测试分层等任务域内容不再入核心段——由 coding 族的
Coding Strategy 变体与各类型专家身份/工作流变体承载。）

**类型变体段**：专家身份（变体段首行角色设定，随类型扮演不同专家）/ 门纪律 / Coding
Strategy（是否注入）/ type-policy 工作流 / Record Fields / 类型专属引导。

**反搅动纪律 ×6**（核心段通用工具纪律；上游核实：dsh-tool-fs 三工具皆单文件单操作——
批量 = 同回合并行多调用 + write 全文重写，能力在场仅需引导）：
1. 批量编辑（机械口径）：同文件多处改动 → 优先一次 write 全文重写；多文件独立修改 →
   同一回合并行发出多个工具调用（实测 worker 纯串行 1.08 call/step）；
2. 探索收敛：先 grep 后读、限定目标子树、同文件不重复读、`ls` 类不作步进空转；
3. 门迭代一次修全（检查失败 → 一次修全所有发现 → 复跑一次）；
4. 终验一次：全绿后同一范围不再重复扫场；
5. 环境摩擦用标准解：照 AGENTS.md 的规范规避命令/配置，不每会话自建；
6. git 查询收敛：status/diff 仅提交前与必要诊断。
（原第 7 条「测试域不越界」属任务域纪律，下沉 coding 族与 gate/test-run 族门纪律变体，
语义不变——含「非 gate/test-run 不自建 e2e 调试循环；触及 UI 须完成视觉验收（工具由
AGENTS.md 或任务内容约定，agent 自选）」。）

**产物落盘约定**：截图（含 UI 视觉验收）、长命令输出、探针工件 →
`logs/<slug>/<taskKey>/<序号>-<事件类型>/`（一任务一文件夹、一事件一子文件夹、同事件文件
内聚、多轮不混档、多模态可扩展——结构规格由姊妹提案所有）；**叙述只带子文件夹路径**。

**todo_write 引导**：领取后第一步把任务（含 AC 逐项）转成 todo 清单；随做随更；全 completed
才 submitTask（submit-task 技能核对项）。两步以内琐碎任务跳过。

**ask 二分**：低风险假设 → 声明假设继续（summary 记录）；重大歧义 → blocked 结算、问题写
reason。

**20 类型 persona 变体表**（**本表步数为唯一权威——SC10 穷尽断言依据**；Coding Strategy ✓ =
coding ×6 + test-gen ×3 共 9 类，其余 11 类不注入）：

| 类型 | 专家身份（变体段首行角色设定） | 门纪律变体 | Coding Strategy | 工作流变体（现模板迁入，low 级裁剪） | 专属引导 |
|---|---|---|---|---|---|
| coding-feature | 资深全栈工程师：从规格到可交付特性的端到端实现者 | 保底门+分级 | ✓ | 4 步：读定义→SCAN→TDD 实现→定向检查 | 触及 UI 须视觉验收 |
| coding-enhancement | 交付工程师：在既有特性上做增强，尊重现状克制扩张 | 保底门+分级 | ✓ | 4 步（增强语境） | 同上 |
| coding-cleanup | 代码整洁专家：清理死重与退化痕迹，行为零变更 | 保底门+分级；COVERAGE=maintain | ✓ | 4 步 + SCAN 简化后缀（Step 1.5 附加段） | — |
| coding-refactor | 重构专家：结构改善守护者，Impact Mapping 先行 | 保底门+分级；COVERAGE=maintain | ✓ | 5 步（含 Impact Mapping）+ SCAN 简化后缀 | — |
| code-quality-simplify | 简化大师：以删减与收敛换可读性，五维审视 | 保底门+分级 | ✓ | 2 步（读定义→简化改进；五维扫描简化版内嵌） | — |
| coding-fix | 诊断外科医生：先定位根因再最小切除，不做超出病灶的修复 | 保底门+分级；Hard Rules fix 变体 | ✓ | 5 步：读定义（错误语境三问）→SCAN→Locate→Fix→定向检查 | — |
| test-run | 测试指挥官：只忠实编排与报告，不修码不掩盖 | 门=测试报告本身（run-tests 编排） | ✗ | 2 步技能驱动 | run-tests 强制（MUST） |
| test-gen-contracts | 契约测试工程师：以接口契约为纲生成可跑通的测试 | 保底门（新生成测试自身跑通） | ✓ | 2 步（读定义→生成并运行验证） | — |
| test-gen-journeys | 旅程测试工程师：沿用户旅程覆盖端到端路径 | 同上 | ✓ | 2 步（journey 语境） | — |
| test-gen-scripts | 测试脚本工程师：产出可复用的编排脚本 | 同上 | ✓ | 2 步（脚本语境） | — |
| doc | 技术作家：以读者视角落笔，结构与准确性并重 | 无编译/测试门；验证=AC 逐项+产物在场性 | ✗ | 4 步：读定义→执行→自检→记录收尾（现模板第 4 步无显式头，迁移补齐） | — |
| doc-consolidate | 文档整合专家：去重归并，保语义无损 | 同 doc 门 | ✗ | 2 步（合并语境） | — |
| doc-drift | 漂移审计员：以代码为准核对文档，逐条判偏 | 同 doc 门 | ✗ | 2 步（漂移核对语境） | — |
| doc-review | 文档评审员：装载 AC 逐项核对，给出修复建议 | 同 doc 门 | ✗ | 4 步：装载 AC→发现文档→核对修复→审阅摘要 | — |
| doc-summary | 摘要提炼师：压缩不失真，按定式结构输出 | 同 doc 门 | ✗ | 2 步（相位摘要 5 节结构） | — |
| gate | 质量门守卫：只认全绿证据，不放行任何红灯 | **全面测试**（全量单元测试，顺序执行全绿才过） | ✗ | 3 步：读定义→核验判据→质量门表 | — |
| validation-code | 代码验证员：只记发现不改码，证据导向 | 定向单测复核+类型检查（SCAN 验证变体：记发现不改码） | ✗ | 3 步（读定义→验证→发现报告） | — |
| validation-ux | UX 验收员：以效果截图为据判读视觉与交互 | 视觉验收为验收主径 | ✗ | 3 步（读定义→视觉取证→判读报告） | 视觉验收主径（工具自选） |
| eval-contract | 评估执行员：按契约面执行评分，如实落盘 | 评估面执行如实报告 | ✗ | 2 步（读定义→执行评估并落盘） | 评分产物落盘 |
| eval-journey | 旅程评估员：沿旅程面评估，如实落盘 | 同上 | ✗ | 2 步 | 同上 |

（工作流变体 = 现 `templates/*.ts` 20 模板向 persona 的迁移清单，语义不变只换承载面；
迁移期逐模板 grep 'constraints block' 跨块引用改写——targetedChecksStep 引用语、
GATE_QUALITY_TABLE 消费注释、validation-code 补定向措辞。）

**老 forge 对齐（21 模板逐项比对）**：步数老↔现逐一对上；共享段（SPEC_AUTHORITY/
HARD_RULES 三变体/SCAN/AC_VALIDATION/Record Fields）逐字平移（三律适配声明在源码注记）；
「测试域不越界」在老 forge coding-fix 已有先例。迁移漂移三处（老有现无，本提案回归修复）：
SURFACE 行丢失、surface 前缀定向命令扁平化（全仓税来源）、复杂度分级丢失。

**AC 逐项严格核查为不变项**：一切分级裁剪不触碰 AC_VALIDATION（逐项 PASS/FAIL + 证据 +
spec 来源）。

#### S2b dispatchPrompt（初始提示词——任务级：目标与验收 + 结构化提取面）

- **<task-context> 聚焦（目标导向）**：TASK_ID/SOURCE/TITLE/TYPE/CATEGORY/SURFACE/BLOCKERS/
  PHASE_SUMMARY/COVERAGE/PRIORITY/MARKERS + **GOAL（原 DESCRIPTION 键更名——以结果为导向
  表述「要达成什么」，实现路径由 persona 工作流承载）** + ACCEPTANCE_CRITERIA。任务规格
  唯一到达面；首行无特殊设计。
- **结构化提取面**（`KEY: value` 行协议；GOAL/ACCEPTANCE_CRITERIA 多行段；AC 条目合成时
  单行化——换行折叠空格，机械提取无歧义）：

  | 键 | 工具消费面 |
  |---|---|
  | TASK_ID | submitTask 的 slug/localId（slash 分割约定写进 submit-task 技能） |
  | GOAL | 提交时 summary 首行结果句的对照基准（结果是否达成的判据） |
  | ACCEPTANCE_CRITERIA | **acceptanceCriteria[].criterion 同源**——提交时逐项回填 met/evidence（与 S3 criterion↔ac_json 交叉校验闭环） |
  | SURFACE | run-tests 技能 / S1 定向命令锚 |
  | COVERAGE | persona 测试面（覆盖率指令） |
  | TYPE/CATEGORY | submit-task 记录字段路由 / 分类字段提示 |
  | PRIORITY/BLOCKERS/PHASE_SUMMARY | 调度语境（不进工具参数） |

- **结算出口一句**（submitTask 路径指称——纪律细节在 persona）。
- digest 语义不变（对简报全文取指纹——对账锚不受迁移影响）。

### S3 摘要契约（结构化提交——老 forge record.json 形制回归）

老 forge `forge task submit --data record.json` 本来就是结构化提交（summary 一句话 +
keyDecisions 数组 + acceptanceCriteria 数组 + 机械门 met=false 拒绝）——M3 迁移压扁进
summary 自由文本 = 摘要冗长无结构的结构性根源。回归：

| 字段 | 形制 | 说明 |
|---|---|---|
| `summary` | string，必填 | 一句话结果 |
| `keyDecisions?` | string[] | 决策独立数组（≤3 条）——从 summary 拆出 |
| `acceptanceCriteria?` | `[{criterion, met, evidence}]` | 独立 AC 数组：criterion + met + **一行简要证明**（用例/命令+结果；长输出落盘只带路径；只含证明） |
| `typeReclassification?` | `{originalType, actualType, reason}` | 类型重分类记录面（老 forge 先例回归） |
| `filesCreated?` / `filesModified?` | string[] 分组 | 文件分组回归；顶层 `files`（扁平）并存时校验 files = created ∪ modified |
| `notes?` | string | 备注 |
| doc 三件 | `referencedDocs?` / `reviewStatus?` / `docMetrics?` | doc 族 Record Fields 落点 |
| test 四件 | `casesGenerated?` / `casesEvaluated?` / `scriptsCreated?` / `testResults?` | test 族落点 |
| validation 两件 | `validationPassed?` / `issuesFound?` | validation 族落点 |
| gate 一件 | `gateChecks?` | 检查项清单（gatePassed 由四门布尔派生，不重复设） |
| **eval——不对齐** | — | score/findings/severity/passed 维持 vars_json 承载 |

- **机械门**：success 且任一 met=false → 拒绝；**criterion 交叉校验**：条数与顺序必须与
  tasks.ac_json 定义侧逐项对应，不符即拒（保住定义/结果镜像审计）；
- **入库**：task_records 增 `ac_json`（AC 结果，与 tasks.ac_json 定义侧镜像成对）+
  `record_fields_json`（其余结构化字段）；`files_json` 形制升级 `{created, modified}`
  （消解与分组的双存储冗余；历史行旧扁平形制读面归一）；`gate_json` 不动（与 gateChecks
  互补）；迁移沿仓规留痕（v1 直改先归档 dogfood 证据库 / v2 头注破例）；
- **读面定形**：TaskRecordEntry.files 保持平铺并集（面板文件数零波及）+ 新增
  filesCreated/filesModified 可选字段；query.ts 两形制归一解码；
- submit-task SKILL.md + submitTask 工具描述同步改写（summary 一句话/AC evidence 逐项填写/
  todo 全绿核对项/长内容落盘只带路径/Record Fields 与 schema 落点对齐）。

### S4 面板结构化展示（已移交姊妹提案 task-ui-visual-copy-blitz）

全部 UI 交付面（timeline Note 折叠/结构化提交消费展示/ResultView 收起展开）移交姊妹提案；
本提案保留 S3 数据端；展示端消费本提案结构化列，字段缺席降级纯文本行结构。

### S5 工具面（todo_write 解禁 + goal 三件套暂禁）

- WORKER_GLOBAL_DENY_TOOLS 移出 `todo_write`、**暂入 goal 三件套**（create_goal/get_goal/
  update_goal——生命周期错位：会话即终/幂等重入换会话致孤儿/自动续跑不适用 one-shot；
  撤销成本 = 名单去三名）。改后全局 deny = 10 名，m3 探针 denyExpect 12→14；
- 锚迁移：矩阵单测 / worker-face / e2e 探针 / **pin-12 契约测试**（goal 三名 exempt→deny
  重分类 + 全等断言 + 头注）/ worker-matrix.ts 注释，全部随迁。

## Alternatives

| 方案 | 取舍 | 结论 |
|---|---|---|
| 相位边界全量门 | 墙钟收益可观，但集成漂移到相位末才暴露 | 落选，另案观察 |
| 仅模型档位配置 | 最大单杠杆 | 已升格 S0 |
| persona 字段遮蔽部署人格 | 已选定——分层承载 | 已升格 S2a |
| 固定定向 just 配方 | 回到固定序列 | 落选（agent 自选命令） |
| 自动推导项目块 | 新增推导机械易过时 | 落选，AGENTS.md 单源 |
| skill 目录过滤 | 成本可忽略/正文按需/类型策略已点名/无上游钩子 | 不做 |
| do nothing | 维持现状 | 落选 |

## Scope

**In Scope**：
1. S0 运营交付——AGENTS.md worker 使用段（档位/定向命令/沙箱标准解）
2. 分层承载（S2）——personaText（核心段①-⑧ + 五类变体，完整组成以 S2a 矩阵为准）+
   dispatchPrompt（task-context 聚焦 + **GOAL 键更名** + SURFACE 行 + 结算出口）；
   persona 合成 plugin 侧；spawn 透传
3. 门纪律段（S1）——保底门/分级/测试分层；GATE_QUALITY_TABLE 收窄 gate 单族
4. 结构化提交（S3）——submitTask 全字段 + 机械门 + criterion 交叉校验 + task_records
   两列 + files_json 形制升级 + SKILL.md/工具描述改写
5. 自研面板 worker 会话命名统一 label（显示面改源：任务链接派生或 descriptor.label，
   不读会话标题 fallback）
6. 工具面（S5）——deny 集变更 + 全部锚随迁
7. 测试迁移（统一入口）——快照 ×20 双层重录、compose.test AC4/AC5 改写 + xml-tags/G1 pin
   核对、e2e 锚（task-dispatch-pipeline + interrupted-dispatch-recovery + m3 探针迁
   system 面）、b5-anchors 夹具核对、S2b 面板命名源组件/RPC 测试

**Out of Scope**：skill 目录过滤（无上游钩子）；相位边界全量门（另案）；自动推导项目块。
**未迁移类型豁免**：old forge 共 21 任务类型，dsh-forge 现涉 20 类——`doc.fix` 未迁移，
本提案**不为其建 persona 变体**（实现时跳过，在此记录即可）；old forge 尚有未迁移至
dsh-forge 的技能同理——dsh-forge 不涉及的均跳过、不预建，待迁移时随类型补入变体表。
（AGENTS.md 单源）；worker 设置面代码变更；产物落盘机械面（姊妹提案）；时间线 Markdown
渲染（姊妹提案）；goal 三件套引导与启用（暂禁）；上游批量 fs 工具（并行调用替代）。

## Risks

| # | 风险 | 缓解 |
|---|---|---|
| R1 | agent 自选门命令导致欠验证 | 保底门清单写死 persona 门纪律段；验证证据行必带 + todo 全绿核对 |
| R2 | 定向门放过跨包破坏 | 类型检查覆盖「改动包 + 直接依赖包」；gate 任务全量面兜底 |
| R3 | goal 三名入 deny 依赖实名注册——极简 profile 缺 tool-goal 时 loud 校验拆 spawn | deny 组装面缺席环境条件剔除（worker-matrix 单测锚定二选一） |
| R4 | 分层承载 + 文案变更破坏 e2e 锚 | 测试迁移统一入口；断言锚双层化（persona + task-context；e2e 迁 system 面） |
| R5 | todo_write 在琐碎任务浪费回合 | 多步必做、两步内豁免；观察清单维护回合开销 |
| R6 | SURFACE 行依赖 surface_key 填写率 | 缺席省行；run-tests 回落读 justfile 既有径不变 |
| R7 | reasoning 降档 + 单元测试门降低缺陷检出率 | gate/e2e 终局门保留；任务级可升档；观察期比对 blocked 率 |
| R8 | 反搅动纪律是软约束 | 纪律锚进 persona 断言（核心 ×6 + 变体测试域锚）；下轮会话解剖量化验证步数下降 |
| R9 | persona 通道上游语义（严格 `{{}}` 插值；capability 门 out-of-process persona:false——通道限 in-process driver） | 生成面「无裸 `{{`」单测；上游升级契约面随迁；换绑定需重新验证 |
| R10 | 分层承载后简报丢失纪律上下文 | 系统提示词每请求在场（结构性到达面）；e2e 断言 system 面含纪律锚 |
| R11 | S3 工具面膨胀（~16 可选字段采用率低/误填） | 分类字段按 category 条件呈现；采用率进观察期指标（summary 长度分布 + 填充率） |
| R12 | S3 存储迁移回归（append-only 触发器、files_json 历史行归一） | 读面归一单测（两形制夹具）；迁移沿仓规留痕 |
| R13 | 结构化数据缺席的渲染回落（旧记录） | 姊妹提案展示面按字段缺席降级纯文本（旧格式夹具断言随迁）；本提案数据端两形制归一不变 |

## Success Criteria

| # | 判据 | 度量面 |
|---|---|---|
| SC1 | worker persona 不再含固定 `just compile/fmt/lint` 序列，改含保底门 + 分级 + 测试分层（gate=全面、非 gate 代码触及类=定向单测、validation-ux=视觉验收、doc/eval/test-run 各如其表）+ 自选命令指令 | persona 文本断言 + e2e system 面锚 |
| SC2 | low 复杂度 persona 不含 SPEC-CODE SCAN/逐需求 TDD 段；medium/high 保留；一切分级含 AC 逐项核查段 | persona 生成函数 complexity 分支断言 |
| SC2b | coding 族（含 test-gen）persona 含完整 Coding Strategy 段（四节 + ask 二分）；非 coding 族不含 | persona 文本断言（coding vs doc 两面） |
| SC3 | 带 surface_key 的任务简报含 `SURFACE: <key> (<type>)` 单行双值 | claim/compose 断言 |
| SC4 | todo_write 不在 deny、goal 三件套在 deny；全部锚随迁绿 | 单测/e2e |
| SC5 | 结构化提交面在场（全字段 DTO + met=false 拒绝 + criterion 交叉校验 + ac_json/record_fields_json 入库 + files_json 形制升级 + files 一致性校验）；summary 一句话；eval 不入 schema | contracts DTO + core submit 单测 + 技能文件锚 |
| SC6 | persona 含反搅动纪律锚 ×6（恒定）；UI 视觉验收锚在 coding-feature/enhancement 与 validation-ux 断言（变体非恒定） | persona 文本断言（恒定锚穷尽 + 变体锚按类型） |
| SC7 | AGENTS.md worker 使用段含档位建议 + 沙箱标准解 | 文档断言 |
| SC8 | persona 含产物落盘约定锚（路径模板 + 叙述只带路径）；submit-task 技能同步 | persona 断言 + 技能锚 |
| SC9 | 分层承载成立：dispatchPrompt 任务级聚焦（GOAL 键 + SURFACE + 结算出口；无人格段/工作流段——反锚）；子会话 system 面含 persona | compose 双产物断言 + e2e 解码（user vs system 分层） |
| SC9b | 自研面板 worker 会话命名统一 label 形制（错名显示面随 S2 兑现自然修复 + e2e 锚：session/title 以 taskKey 开头） | e2e 会话解码断言 |
| SC10 | persona 组成矩阵落地：核心段①-⑧ 一切类型在场（穷尽单测）；变体段（专家身份 + 门纪律 + 工作流等）按 20 类型表路由正确；low 裁剪不触及核心段与 AC 核查 | persona 生成函数 ×20 类型 ×复杂度矩阵单测 |

**一致性检查**：SC1↔S1+S2a/交付2+3；SC2/SC2b↔S2a/交付2；SC3↔S2b/交付2；SC4↔S5/交付6；
SC5↔S3/交付4；SC6↔S2a/交付2；SC7↔S0/交付1；SC8↔S2a+S3/交付2+4；SC9↔S2 分层/交付2+8；
SC9b↔交付7；SC10↔S2a 组成矩阵/交付2。十二条 SC（SC2b/SC9b 为插入编号）每条有交付承载；
交付 8（测试迁移）承载 SC9/SC10 的穷尽与 e2e 面——无悬空 SC、无无消费交付、无互斥。
**检查结果：一致，无冲突。**
