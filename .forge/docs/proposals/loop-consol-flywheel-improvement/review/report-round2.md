# 评审报告（复审 round 2）：loop-consol-flywheel-improvement

- 评审人：review-proposal（独立 subagent，复审）
- 日期：2026-10-28
- 评审对象：`proposals/loop-consol-flywheel-improvement/proposal.md`（按 round 1 修订后）
- 上轮报告：同目录 `review/report.md`（1 Blocker + 3 Question + 3 Note）
- 方法：只读；增量复核上轮问题项，全部机械引用重读源码核销，不重复已核验项。

---

## 一、逐项结论

### 1. B1（缺「待用户裁决清单」段）——✅ 清零

- §2.7 段在场（proposal.md:49-56），表格化集中四裁决点。
- 覆盖核对：D1 = 2.4 三态视觉分配、D2 = 2.4 终态留存时长、D3 = 2.6 修复方向取舍（三轨并列、归因后定）、D4 = 2.3 convention 晋升——上轮指出的散落裁决点全部收拢，无遗漏。
- §5 裁决台账在场且与 §2.7 一致（「待用户裁决」，未预填结论）。✅

### 2. Q1（场景码词表不对齐）——✅ 清零（表述与源码逐位一致）

- §2.4 已改为「场景判定以 `FORGE_PROGRESS_SCENARIOS` 常量单源取值（progress/index.ts:42-45 纪律）」，并要求实现前出「场景码 → 三态」明确映射表。
- 词表核对（对照 `packages/plugin-forge/src/progress/index.ts:47-80`）：
  - 终态族 `loop/finish-all` / `loop/halt` / `loop/timeout` / `loop/stopped`——四码均真实在场（:68-72），确为终局动词族（halt/timeout/finish-all/stopped 对应 verb 终态，:106-109）。✅
  - 「无 settled」——正确：`settle` 是任务级 verb（:101），场景码 24 值中无 settled。✅
  - 「suspend 族是否全部 loop 级（taskKey 缺席）在映射表中逐场景断言」——表述留作实现前断言，且源码已可定谳：suspend 四径经 `suspendWithWakeup` 发射时携带 `progressTaskKey`（`driver.ts:1027`，`slug/localId` 口径），即 suspend 事件**携 taskKey、非循环级**。提案的「待断言」措辞成立（映射表门槛会兜住），见遗留 Note N-1。

### 3. Q2（多实例/窗口边界）——✅ 落档

- sourceSlug 归属：「多容器并行按 `sourceSlug` 匹配归属」（proposal.md:33），`sourceSlug` 为 progress 载荷必填字段（progress/index.ts:92,134），键真实可用。✅
- 窗口挤出退化：「entries 窗口（500）挤出最近 loop 级事件时状态推导退化为『未知』（不误报 running）」——与 round 1 核实的窗口 N=500（dispatch-events.ts）一致，兜底口径安全方向正确（宁可未知不误报）。✅

### 4. Q3（归因后回填单轨）——✅ 落档

- §2.6：「定谳后回填选定方向（单轨）再进拆解，归因前不锁定实现轨」，AC6 以结果约束不依赖具体轨；§2.7 D3 把三轨取舍正式呈裁。上轮担心的「派发期二次裁决」已被流程门（回填后才拆解）拦住。✅

### 5. N2 / N3 吸收——✅ 均吸收

- N2：§2.4 末句「改造后 `forge-dispatch-loop` 投影确认恒 idle，同步标注退役（保留投影折叠面不删，标注仅供历史兼容读）」——死折叠面有交代。✅
- N3：§2.2 落点改为「`packages/plugin-forge/skills/run-tests/SKILL.md` 验收清单段（仓内无独立模板文件，落点即此）」——含糊词消解，派发期无需再定位。✅

---

## 二、修订引入新矛盾检查

- §2.4 词表与 §4 AC4（映射表单源落档）、§3 改动范围一致，无相互矛盾。
- §2.7 D1-D4 与 §2.2/2.3/2.4/2.6 正文、§5 台账三方一致。
- 指标对比附录、真机取证 AC（AC4/AC6）在场未动，无回退。
- 唯一增量事实点：§2.4 终态族列举四码正确，但**循环族第五码 `loop/blocked-pool`**（progress/index.ts:69；`driver.ts:2288-2293` 发射，verb=loop/status=blocked/taskKey 缺席 = 循环级，随后 `suspendForVerdict` 挂起待裁决）既不在终态族也不在 suspend 族的枚举叙述中，其三态归属未写。因提案已强制「实现前以单源出全量映射表」，此遗漏会被映射表门槛兜住，不构成 Blocker——记 Note。

---

## 三、遗留问题清单

| 级别 | # | 问题 | 证据 |
|---|---|---|---|
| Note | N-1 | suspend 族事实可先定谳：四径 suspend 事件均携 taskKey（非循环级），侧栏 suspended 判定不能走「taskKey 缺席」单判据，映射表需按 scenario/verb 判 suspended（如 `loop/blocked-pool` → suspended） | `driver.ts:1027`（progressTaskKey）、`driver.ts:2288-2300`（blocked-pool → suspendForVerdict）；proposal §2.4 |
| Note | N-2 | 循环族第五码 `loop/blocked-pool` 未在 §2.4 三态枚举叙述中出现，归属留待映射表回填（建议落 suspended，同 N-1） | `progress/index.ts:69`、`driver.ts:2291`；proposal §2.4 |

无 Blocker、无 Question。

---

## 四、放行结论

**放行**：B1 清零，Q1/Q2/Q3 全部落档，N2/N3 吸收，修订未引入新矛盾。两条 Note 均为映射表实现期即可闭合的事实回填（且 §2.4 已内置映射表门槛兜底），不阻塞裁决。可提请用户对 D1-D4 一并裁决。
