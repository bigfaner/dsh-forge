---
name: write-prd
description: 通过协作对话把用户需求固化为结构化 PRD——按适用性产出 prd-spec、用户故事与 UI 功能清单，每份文档经 upsertFeatureDoc 注册进状态层。
---

# 撰写 PRD（write-prd）

从模糊需求出发，经协作对话收敛为清晰的 PRD（产品需求文档）。作用于已有的 feature
容器（远征链：feature 行已存在，通常在提案被接受时自动注册）。

**核心原则**：动手编码之前，先澄清"做什么"与"为什么"。

## 状态层纪律

此处产出的每份文档都要落盘**并**注册——注册表（而非文件树）才是"什么存在"的唯一
事实源；注册使 feature 相位单调推进（永不回退）。

| 文档 | 路径 | 注册方式 |
|---|---|---|
| PRD 规格 | `docs/features/<slug>/prd/prd-spec.md` | `upsertFeatureDoc` `doc_kind: prd-spec` |
| 用户故事 | `docs/features/<slug>/prd/prd-user-stories.md` | `upsertFeatureDoc` `doc_kind: user-stories` |
| UI 功能 | `docs/features/<slug>/prd/prd-ui-functions.md` | `upsertFeatureDoc` `doc_kind: ui-functions` |

注册调用形态（参数 snake_case；`rel_path` 仓库相对路径、正斜杠）：

```
upsertFeatureDoc { feature_slug: "<slug>", doc_kind: "prd-spec", rel_path: "docs/features/<slug>/prd/prd-spec.md", summary: "<一句话>" }
```

先写文件再注册（或先注册后立刻补写——行可能短暂悬空，但绝不留下未注册的产出文档）。
没有 manifest 也没有索引要维护——状态层已取代二者。

<HARD-GATE>
PRD 定稿并获用户批准之前，不得写任何代码、搭任何项目骨架或采取任何实施动作——先呈现 PRD，先拿批准。
</HARD-GATE>

<HARD-RULE>
不做技术选型：允许描述非功能约束（性能、平台、兼容性、安全/合规）；禁止点名框架、语言、数据库、库或架构模式——那些属于 tech-design 技能。判据："要达成什么效果"可以写，"用什么工具实现"不可以写。
</HARD-RULE>

## 意图管线

若 `docs/proposals/<slug>/proposal.md` 存在 brainstorm 提案，读其 `intent`
frontmatter；缺失或为空 → 按 `new-feature` 处理。意图决定格式：

| 意图 | PRD 格式 | 用户故事 | UI 功能 |
|---|---|---|---|
| `new-feature` | 完整版 | 是 | 是（仅 UI 表面） |
| `enhancement` | 背景 + 目标 + 验收管线 | 否 | 有信号才写 |
| `refactor` / `cleanup` / `fix` | 仅规格（下方三个必填字段） | 否 | 否 |
| `doc` | 极简（标题 + 目标 + 范围） | 否 | 否 |

内容生成阶段探测到的**覆盖信号**只增步骤、从不删减，且相互独立叠加："用户可见行为"/
UI 变更信号启用用户故事 + UI 功能；否定语境中的跳过信号不触发；触发时注记
（`<!-- Override: ... enabled by signal "..." -->`）。

**仅规格必填字段**（refactor/cleanup/fix）——替代用户故事，作为 tech-design 的信息
载体：

- **改动范围**：受影响的模块/文件/包（具体路径）
- **约束**：不得破坏的行为不变量
- **验收标准**：回归验收——如何在不引入回归的前提下确认成功

## 图示要求

### PRD 用例图（范式 + 分档）

- **范式**（`flowgraph` 扮演者 → 用例形，多角色/多流程特性照此内置）：

  ```mermaid
  flowgraph LR
    管理员((管理员)) --> UC1([注册工作区])
    管理员 --> UC2([评审提案])
    开发者((开发者)) --> UC2
    开发者 --> UC3([派发任务])
    UC2 -.扩展.-> UC4[升级为远征]
  ```

- **分档**：多角色或多业务流程的特性**强制**内置用例图；单一角色、单一流程的简单
  特性允许纯文字描述（一段话列清谁做什么即可），不硬凑图。
- 流程图：`new-feature` 的业务流程**必须**配 mermaid flowchart（工作流第 5 步）。

### prd-ui-functions 写作要求

- **布局**：关键页面配 ASCII 线框（围栏代码块内画区块布局：导航/主区/操作位）；仅限关键页，次要页面文字描述位置即可。
- **交互**：多步交互配 mermaid flowchart（状态流转复杂时用 `sequenceDiagram`）表达页面/动作流转，文字只做补充。

## 方法论速查

- **JTBD**：用户"雇佣"产品完成什么任务——目标句式"当…时，我要…以便…"，防功能清单偏离真实动机。
- **KANO**：区分基本/期望/兴奋需求——验收基线保基本，兴奋项标注防范围膨胀。
- **赫茨伯格**：保健因素（缺失即不满）与激励因素（具备才满意）分开列——非功能约束多属保健项。
- **用户故事地图**：按用户活动轴排列故事——先走通端到端脊梁，再向下切片迭代，防只按功能块平铺。

## 工作流

1. **探索上下文**——读提案（可选输入）、相关 feature 文档与近期工作。若仓库维护
   web 站点地图（`docs/sitemap/sitemap.json`）且请求触及既有页面，将其作为业务级
   页面清单读取；不要读架构/决策文档来牵引需求——技术约束不属于 PRD。
2. **评估范围**——多个独立子系统 → 请用户先拆分。
3. **提出澄清问题**——一次一个，优先选择题；焦点随意图变化（new-feature 问
   角色/目的/约束；仅规格问改动范围/不变量/验收）。派发任务语境（无交互用户）下，
   依任务简报自行决断并记录假设，不做阻塞等待。
4. **提出方案**（仅 `new-feature`）——2-3 个业务方案含取舍与推荐；不做技术选型。
5. **分节呈现**——背景（缘由、用户、干系人）→ 目标（尽可能量化）→ 范围（In/Out）
   → 流程（业务流程；new-feature 必配 mermaid 流程图）→ 功能规格（引用
   ui-functions 文件）→ 非功能注记。逐节获取批准。
6. **撰写文档**——按上方意图表执行。
   - 用户故事：仅 new-feature（或"用户可见行为"覆盖信号；当所有 In Scope 条目都
     指向不可编译工件时不写）。背景中每个角色 ≥1 条故事；动作具体；每条故事带可
     客观核验的 Given/When/Then 验收标准。
   - UI 功能：仅当特性有 UI 表面。含每项功能的落位（`new-page` vs
     `existing-page:<route>`）与导航架构一节，并遵守上方"prd-ui-functions 写作
     要求"（ASCII 线框限关键页 + mermaid 交互图）。
7. **注册每份产出文档**——经 `upsertFeatureDoc`（见上表）；返工后重新注册同一文件
   （同 kind、刷新 summary，注册表行原地更新）。
8. **自检**——背景各维度覆盖；目标尽量量化；范围边界显式；验收标准可核验；覆盖信号
   已注记；无范围外内容渗入。

## 下一步

PRD 获批后：有 UI 表面的特性 → `ui-design` 技能；其余 → `tech-design` 技能。
