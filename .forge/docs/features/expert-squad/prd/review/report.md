# PRD 评审报告：expert-squad（专家团插件）

- 评审对象：`prd/prd-spec.md`（82 行）、`prd/user-stories.md`（73 行）、`prd/ui-functions.md`（91 行）
- 裁决正本：`proposals/expert-squad/proposal.md`；提案评审遗留 Q1-Q4 已裁决转 tech-design，不属 PRD 洞
- 评审方式：独立上下文，按评审三问逐条核对；不评技术选型（proposal 2.4/2.5 的机制结论属上游已定案，PRD 引用不算越界）

## 一、需求合理吗

逐条追溯：In Scope 五项均有 proposal 真实诉求对应——

| PRD In Scope（prd-spec L22-27） | proposal 依据 |
|---|---|
| 专家档案 `.md` 正本 / 对话式增改禁用 / 文件直编热刷新 | 需求 1（L17）+ 2.3 行为 1/2 |
| 委派调度：continuable 隔离子会话 / 工具白名单 / 追问续聊 | 需求 2（L18）+ 2.3 行为 4 |
| 三层档案来源与同名遮蔽 | 2.5 通用缝 2 + 验收 8 |
| Web 管理面板四能力 | 2.3 行为 3 + 验收 3 |
| 独立插件发布经 plugin-manager | 需求 3（L19）+ 验收 4 |

- 无伪需求：PRD 未新增 proposal 之外的功能面；Out of Scope（L29-32）与 proposal §3 排除项一致，且明确把 Q1 降级契约、存储选型、UI 视觉显式推给 tech-design/ui-design，不藏关键风险。
- PRD 自身未新增点名实现工具的约束：非功能注记（L81）罗列的 inject/storage/ui-slots/fetch/plugin-manager 均为引用 proposal 2.4/2.6 已核销结论，合规。
- 量化基线（目标 1-3，L16-18）与故事直接呼应：5s ↔ US2 Then；坏档案隔离 ↔ US7。

结论：**需求层合理，无 Blocker**。

## 二、用例充分吗

- 角色覆盖：终端用户 UC1-UC5、开发者 UC6-UC7（prd-spec L38-45），两角色均有主流程用例 ✓。
- 每条 In Scope 需求有用例承载：档案（UC1/UC2）、委派（UC4/UC5）、三层来源（UC7 扩展 UC4）、发布（非用例面，由故事 US11 与验收承载）。
- 边界：失败（US7 坏档案不扩散）、迁移（US9 升级禁用保持、US10 遮蔽回落）、权限（US4 白名单拒调）均有着落。

**覆盖洞（见 B1）**：In Scope 明列「Web 管理面板：**列表 / 详情** / 入职向导 / 委派入口」（prd-spec L26），ui-functions F1 定义了搜索按名称/技能标签过滤与状态过滤、F2 定义了详情抽屉（履历时间轴渲染、不暴露 frontmatter）；但用户故事中无任何故事承载「浏览列表/搜索过滤/查看详情抽屉」——US3 的 Then 只覆盖「列表刷新」，US6 只覆盖启停。用例图 UC3「面板管理专家」粒度过粗，未拆出列表浏览与详情查看，掩盖了这一洞。

- 用例图与文字一致性：UC 节点与故事大体对应，但 US10（遮蔽定制）、US11（独立装载）无 UC 节点（见 N2）。

## 三、用户故事合理吗

- 可核验性：US1-US4、US6-US11 的 GWT 均含可观察断言（档案落目录、5s 生效、工具拒调、禁用后 API 拒绝、遮蔽命中 project 层），无「快/友好/合理」类词；US5 Then「专家能引用此前任务经过」核验口径偏弱（见 N1）。
- 故事间无重叠无矛盾：US1（对话建档）与 US3（向导建档）入口不同、产物一致，不冲突；US2 热刷新 5s 与目标 2 一致；US6 禁用与 US4 委派前提互补。
- 角色故事覆盖：终端用户 US1-7、开发者 US8-11 ✓。
- AC 与 In Scope 双向对齐：**存在单向洞**——每条故事可溯源到 In Scope，但 In Scope 的「列表/详情」无故事/AC 承接（即 B1）。

## 分级问题清单

### Blocker（1 条）

- **B1 用户故事未承载 Web 面板的「列表浏览/搜索过滤」与「详情抽屉」需求**。
  证据：prd-spec L26 In Scope 明列「列表 / 详情」；ui-functions L25（搜索按名称/技能标签过滤、状态过滤）、L27-40（F2 详情抽屉：履历时间轴、不暴露 frontmatter、编辑预填入口）；而 user-stories.md 全文无一条故事的 Given/When/Then 涉及浏览列表、搜索过滤或打开详情。违反评审三问之「每条 In Scope 需求至少一个用例承载 / 验收标准与 In Scope 双向对齐」。
  处置：write-prd 补 1-2 条终端用户故事（浏览与检索专家列表；查看专家详情）并重注册，其余文档不动。

### Question（2 条）

- **Q1 并发/竞态边界既无用例也未显式排除**：同一档案并发编辑、热刷新与进行中派发的竞态（派发读到半新半旧内容？），prd-spec L29-32 Out of Scope 未列、user-stories 无用例。建议：要么在 Out of Scope 显式排除（并发一致性归 tech-design），要么补一条边界用例。
- **Q2 目标 1「新建/修改专家 ≤ 5 分钟」无验收承接**（prd-spec L16）：11 条故事无任何一条以此量化基线为断言，该目标当前不可验收。建议：明确其验收口径（如 US1/US3 的操作步数上界）或降级为愿景表述。

### Note（2 条，留档）

- **N1** US5 Then「专家能引用此前任务经过」（user-stories L35）核验口径弱，建议改为可观察断言（如续聊回复包含对前序任务输入/成果的正确引用）。
- **N2** 用例图（prd-spec L36-46）未含 US10（遮蔽定制）、US11（独立装载）对应节点，图与故事集不完全对齐；补两个 UC 节点或加注说明即可。

## 放行结论

- **Blocker：1 条（B1），未清零——暂不放行。** 返工 write-prd（补列表/详情故事）并重新 upsertFeatureDoc 后重评。
- **Question：2 条（Q1 并发边界、Q2 5 分钟基线验收口径）**，随报告呈裁决；Q1 可与 B1 同批在 PRD 修（Out of Scope 一句话）或推 tech-design，Q2 需明确口径或降级表述。
- 需求合理性与 proposal 追溯无问题；提案评审遗留 Q1-Q4 已裁决转 tech-design，PRD 对其的 defer 表述（prd-spec L71「降级契约由 tech-design 钉死」）处置正确。

---

# 复审（第二轮）

- 复审对象：返工后 `prd-spec.md`（86 行）、`user-stories.md`（97 行）、`ui-functions.md`（91 行，未改动）；独立上下文，按评审三问复核 + 逐条核销返工声明。
- 工具局限：validateMermaid 在本次会话不可用（调用返回 invalid output），两张 mermaid 图未能机验；人工读图结构无异常，但 prd-spec L39 用例图头为 `flowgraph`（见 N3）。

## 一、返工核销

| 项 | 声明 | 核销结果 |
|---|---|---|
| B1 | 新增 US12 浏览检索、US13 详情抽屉 | **清零**。US12（L75-79）承载列表浏览 + 名称/技能标签搜索 + 状态过滤，卡片可见字段（状态灯/名称/岗位/信条摘要）与 ui-functions F1 L24-25 逐项对齐；US13（L81-85）承载详情抽屉：履历时间轴渲染、白名单与标签 chips、不暴露 frontmatter、编辑/禁用/委派操作位，与 F2 L30-40 逐项对齐；prd-spec L26 In Scope「列表 / 详情」由此双向承接，UC3 同步细化为「浏览/检索/详情」（prd-spec L42）。 |
| Q1 | US15 一致性故事 + Out of Scope 显式排除 | **清零**。US15（L93-97）给出可核验断言（快照完整且通过校验、不含混合内容、坏档案任何时点不入派发）；prd-spec L34 Out of Scope 显式排除「并发写入冲突的合并语义（归 tech-design）」——用例与排除两头都落，不藏风险。 |
| Q2 | 目标降级定性 | **清零**。目标 1（prd-spec L16）改为「建档完成后立即可委派」定性表述，由 US1 Then「委派入口立即可用」（L11）、US3 Then「列表刷新」（L23）承接；不可验收的「≤5 分钟」量化已移除。 |
| 新增 HR 预设 | prd-spec In Scope / 功能规格 / 用例图 + US14 | **已落实**（合理性判断见下）。In Scope L27、功能规格 7（L79）、用例图新增 HR 执行者→UC1（L45）、US14（L87-91）。 |

## 二、常规三问复核（增量）

1. **需求合理吗**：US12-13、US15 均可溯源——US12/13 承接 In Scope 面板四能力与 ui-functions，US15 是 Q1 裁决的落点，均非无中生有。HR 预设为用户明示新增需求，合理范围演进判断：proposal 全文无 HR 表述（唯一相关是 L14 对比句「agent preset 是 YAML 组合行、静态装载、面向部署者」），PRD 将其定位为「部署侧 agent 预设（dsh-forge 装配层）」且「专家团插件自身不感知 HR」（L27）——不动插件边界、不违反 proposal 排除项（不改制官方 agent-presets，是经装配层配置预设），与 proposal L14 承认的「preset 面向部署者」形态吻合，属合理范围演进而非需求错位。但它引入了一项 proposal §3 改动范围之外的交付物，归属哪个容器单方不可裁（见 Q3）。
2. **用例充分吗**：US12-15 均有用例图节点或执行者承载（UC3 已细化、HR 执行者新增）；US15 覆盖并发边界、US14 覆盖 HR 路径，B1 的覆盖洞已补。用例图与文字规格一致。
3. **用户故事合理吗**：US12-15 GWT 均含可观察断言（列表只显匹配项、抽屉不暴露 frontmatter、快照不含混合内容、HR 无委派工具时明确告知），无歧义词；与既有故事无重叠矛盾——US14（经 HR 代招）与 US1（主会话直接招募）入口不同、产物一致，同 US1/US3 先例；US15 与 US2/US7 互补（时点一致性 vs 生效时限 vs 坏档案隔离）；角色覆盖仍完整（HR 为执行者，操作主语仍是终端用户）。

## 分级问题清单（增量）

### Blocker（0 条）

B1 已清零，无新增 Blocker。

### Question（1 条）

- **Q3 HR 预设交付物的容器归属**：HR 预设是 dsh-forge 装配层交付（部署侧 preset + 绑定管理工具），不在 expert-squad 插件包与 proposal §3 改动范围内；proposal 也无此需求表述。落入本 feature 实现会使上游 proposal 与实际交付面出现偏差。需裁决：随本 feature 交付并在 proposal 补记范围演进，还是移归 `expert-squad-forge`（forge 接入提案）。PRD 文本本身自洽，不阻塞 PRD 放行。

### Note（新增 1 条，留档）

- **N3** prd-spec L39 用例图头为 `flowgraph`，非 mermaid 标准图头（flowchart/graph）；本次 validateMermaid 工具不可用未能机验，建议改为 `flowchart` 以确保渲染。

## 放行结论（复审）

- **Blocker：0 条——上轮 B1 清零，放行。** 三项返工（B1/Q1/Q2）均核销落实，US12-15 可核验且与 ui-functions、In Scope 双向对齐。
- **Question：1 条（Q3 HR 预设容器归属）**，不阻塞 PRD，随任务输出呈报裁决；建议在进入 tech-design 前定。
- Notes：N1（US5 断言强度）、N2（用例图 US10/US11 节点）、N3（flowgraph 图头）留档，不阻塞。
