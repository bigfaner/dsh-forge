---
name: to-tasks
description: 把共识终态（spec / 用户直接拆解）转化为任务容器内的任务批次——spec 探测分叉、逐 AC 拆解、单次 batch_add_tasks 全批提交与提交前自查。
---

# to-tasks：拆解为任务

## 一、适用与前置

- 何时用本 skill：spec 共识终态后拆解任务；或用户直接给出口头/文字目标要求拆解（两入口同一文档、同一收尾模板）。
- 前置：
  - 容器 slug 已定（任务容器 = slug 本身；向用户确认或从上下文取用，不得臆造）。
  - spec 在场时，以其 AC 判据清单为拆解输入；task 侧零 spec 感知——判据经拆解逐字下发到任务 `acceptance_criteria`。
  - 拆解只对 `approved` 态的 spec：`awaiting_approval` 态须先经用户批准，`completed` 态冻结不可拆解（后续需求走新 spec）。

## 二、spec 在场探测分叉

1. 先调 spec 域查询工具探测 spec 是否在场（工具返回值即事实，零服务依赖）。
2. 在场 → 读其 AC 判据清单（逐条 AC 判据原文），整理为判据清单后进入第三节。
3. 缺席 → 独立拆解路径照常：判据由用户/你自己直接给出并逐条列明，继续第三节。

## 三、拆解规则

- 粒度：一任务 = agent 一次可独立收口的委派粒度；逐 AC 映射承担——每条 AC 判据原文落到恰好一个任务的 `acceptance_criteria`（一格一 AC）。
- 依赖排序：拆解产出按执行序排列；`depends_on` / `before` 用批内 `local_id` 表达（批内互引合法）。
- 类型映射：按任务性质选 `type` 的**精确值**（如 coding-feature / coding-enhancement / coding-fix / doc / test-run——完整封闭词表见 query_task 帮助）。族名（coding / doc / test…）不是合法 type 值，照抄即派发期 fail-loud。
- facets 提示：spec 在场时，把交付档位期望面（档位→面映射：ui / api / pure-logic / docs）经 `context` 的 `facets` 键逗号分隔预填进任务定义（如 `facets=ui,api`）——纯文本随 acceptance_criteria 走，task 侧零 spec 感知；worker 结算自报 facets ≠ 该提示时 submit_task 仅 warn 提示（不拒写）。无 spec 或无面可判时省略该键。
- 其余格填空：`brief` 写清任务目标正文（spec 缺席时它是 worker 的唯一定义源）；`scope` 用结构化三键（created/modified/removed，相对项目根路径）；`context` 用 KEY=VALUE 数组（键唯一）。

## 四、收尾模板（抄写降为填空——模板即合法入参）

1. 先列出 AC 判据清单（spec 在场时逐条判据原文；缺席时列自定判据）。
2. 用**单次** `batch_add_tasks({ slug, tasks: [ ... ] })` 提交全批，每任务格填空：

```text
batch_add_tasks({
  slug: "<容器 slug>",
  tasks: [
    {
      local_id: "<批内唯一 id>",
      title: "<任务标题>",
      type: "<task type>",
      brief: "<任务目标正文>",
      acceptance_criteria: ["<对应 AC 判据原文——逐字一致>"],
      priority: "P1",                    // 可选 P0|P1|P2
      estimated_time: "1-2h",            // 可选
      scope: { created: [], modified: [], removed: [] },  // 可选，相对路径
      context: ["KEY=VALUE", "facets=<ui,api>"],  // facets 提示格：交付档位期望面逗号分隔；无面省略
      depends_on: ["<批内 local_id>"],   // 可选，批内互引或同容器既有任务
      before: ["<批内 local_id>"],       // 可选
      breaking: false,                   // 可选
      coverage_threshold: 0.8,           // 可选，0-1
      complexity: "medium",              // 可选 low|medium|high
      source_task_slug: "<源任务 slug>", // 可选，fix 链成对参数
      source_task_local_id: "<源任务 local_id>",
      block_source: true,                // fix 链：源已 blocked 时必带 true
    },
  ],
})
```

- **铁律 1（禁散调）**：一次 `batch_add_tasks` 调用提交全批——禁止逐条散调 `add_task`。
- **铁律 2（判据逐字一致）**：`acceptance_criteria` 每条 = 对应 AC 判据原文逐字复制——禁转述、缩写、改写（下游投影按判据文本逐字对齐，转述即断链）。

## 五、判例检索提示（拆解径——查好预填，不零注入）

1. **历史判例检索**：拆解涉及修复/加固性质的任务时，先检索缺陷台账历史判例，把命中项经 `context` 预填进对应任务（`BUG_LESSON=<bug_id> + 一句话根因/教训`，多条分行）；只保留与改动面直接相关的判例——宁缺勿滥，无命中零注入。
2. **测试判例检索提示**：测试类任务（或改动触及测试策略/用例的任务）另检索 `.knowledge/` 测试判例域三类——**flaky 史**（用例 + 环境 + 复发轮次）、**测试退役理由**（被测物变更 → 用例去向）、**覆盖真空**（评审发现的缺席面）；命中同样经 `context` 预填，无命中零注入。

判例检索只服务拆解径（拆解时查好、预填进简报）；程序派生的修复任务不由本技能经手，其判例事实由派发链路结构化携带。

## 六、自查清单（提交前逐条对照）

1. `local_id`：批内唯一（重复拒全批）。
2. `title` 非空；`type` 属任务类型词汇表。
3. `brief` 正文格已填（spec 缺席任务的定义源）。
4. `estimated_time` 字符串形（如 "1-2h"）。
5. `scope`：结构化三键 created/modified/removed；元素为相对项目根路径；同一路径不得跨数组重复；未知键即错。
6. `context`：KEY=VALUE 数组，键唯一。
7. `acceptance_criteria`：与 AC 判据逐字一致（禁转述/缩写/改写）。
8. `depends_on` / `before`：批内 local_id 或同容器既有任务；无悬空引用、无环。
9. fix 链：`source_task_slug` + `source_task_local_id` 成对；源任务已 blocked 时 `block_source: true` 必带；`priority` P0|P1|P2、`coverage_threshold` 0-1、`complexity` low|medium|high、`breaking` 布尔——形态正确。
10. facets 提示：交付档位期望面经 `context` 的 `facets` 键逗号分隔预填（如 `facets=ui,api`）；无面可判时明确省略，不留空串。
