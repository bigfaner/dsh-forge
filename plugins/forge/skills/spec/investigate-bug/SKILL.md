---
name: investigate-bug
description: 用户点名触发的 bug 深挖工作流——定锚 → 物料侦察 → 判别实验清单 → 全面方案成文；Step 1-2 委派 bug-investigator 专家（独立上下文消化全链），Step 3 主会话核收落卷（不落卷 = 深挖未完成）。
---

# 深挖缺陷（Investigate Bug）

用户主动排查一条 bug：深入全链，产出可执行的全面修复方案。

与 `fix-bug` 的分工：fix-bug 修「这一处」（TDD 最小修复）；investigate-bug 挖「这一族」（全链消化 + 同族/异族判别 + 根因分层方案）——盲修循环、跨缝复发、多次 unresolved 的疑难链在此收口。

## 硬规则

<HARD-RULE>

1. 方案文档不落卷 = 深挖未完成（Step 3 强制）。
2. 落点双轨：有关联提案落 `proposals/<slug>/issues/<localId>/`，无关联落 `probes/<bugId>/`。
3. 主会话不自行消化全链——Step 1-2 委派 bug-investigator，大上下文消耗隔离在子会话。

</HARD-RULE>

---

## Step 0: 定锚

确认两件事，写成两行再前进：

- **目标 bug**：bug_id（用户点名或经 listBugs 检索锁定）；缺席时按用户给的症状关键词 `listBugs` 检索，回呈候选列表由用户点名，不自行拍板。
- **用户关切点**：为什么点名深挖——屡修屡发？跨缝复发？还是 suspicion 未定位？关切点决定 Step 2 判别实验的优先序。

## Step 1: 物料侦察（委派 bug-investigator）

经 `delegate_expert` 委派 `bug-investigator`（只读深挖专家，独立上下文），指令携带：目标 bug_id + 用户关切点。专家产出：

1. **getBug 全链**：整条复发链逐成员消化（历次修法、失效形态、suspected 位置演化）；
2. **聚合统计**：`aggregateBugs` 按 errorType 分组——`total≥3 ∧ open≥1` = 同族复发未根治；
3. **类似检索**：`listBugs` 按 errorType / suspected 位置关键词横向检索，捞可能同族但未挂链的孤条。

## Step 2: 判别实验清单（同一委派内完成）

专家对「同族 / 异族」逐条给出**判别实验**：每个候选假设配一个能排除它的最小实验（复现输入 / 日志探针 / 代码走读断点），区分「证据已闭合可直接排除」与「须实跑实验」。主会话收到的是清单与证据，不是结论独白。

## Step 3: 全面方案成文（主会话核收落卷）

主会话汇总专家产物，成文全面方案：

- **根因假设分层**：每个假设标注证据强度（已闭合 / 待实验）与判别实验结果；
- **修复策略**：分层对应——根治级（承重假设核销 + 脆弱面评估）与症状级（兜底），显式取舍；
- **回归面**：修复波及的测试与守卫清单。

<HARD-RULE> 落卷（必答）：方案文档写成即落卷——有关联提案落 `proposals/<slug>/issues/<localId>/`，无关联落 `probes/<bugId>/`（目录经 forgeDirs 查询 docs 根解析）。落卷后深挖才算完成；后续该链派 fix 任务时，T3 拦截的建模报告探测与 T4 anchor 预检都会认这两处卷宗路径。 </HARD-RULE>

**产出摘要**（回呈用户）：

```
Investigation Summary
─────────────────────
Bug:        <bug_id + 一句话>
Chain:      <链长 N，成员状态序列（如 fixed→fixed→open）>
Verdict:    <同族复发未根治 / 异族新问题 / 证据不足待实验>
Hypotheses: <根因假设分层，各附证据强度>
Plan:       <修复策略 + 回归面>
Report:     <落卷路径>
```

## 边界

- 深挖不修复：本技能零写径（不改码、不登记、不回填台账）——排查者产出方案，修复走 fix-bug / 派发链。
- 判别实验清单中的「须实跑实验」项：若用户要求继续，按实验逐条执行后回填证据到卷宗正本，方案随之修订。
