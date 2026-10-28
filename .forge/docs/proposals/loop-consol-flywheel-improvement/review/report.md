# 评审报告：loop-consol-flywheel-improvement

- 评审人：review-proposal（独立 subagent）
- 日期：2026-10-28
- 评审对象：`proposals/loop-consol-flywheel-improvement/proposal.md`（parent = loop-message-consolidation，飞轮派生）
- 方法：只读；全部机械引用读源码核销。

---

## 一、四问逐问结论

### 1. 需求满足吗 —— 满足，引用面全部核实

六条改进项均有对应方案与落点；提案假设的既有机械逐一到源码验证，**全部真实存在**：

| 引用 | 核销结论 |
|---|---|
| `sidebar-model.ts` SessionLoopBadge | ✅ `apps/web/src/views/sidebar/sidebar-model.ts:111-137`（status ∈ starting/running/stopping，slug 可空，窄读 `forge-dispatch-loop` 投影键） |
| 左缘流光标记 | ✅ `apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx:327,355-363`（`data-dswf-session-loop` 锚 + `dswf-sidebar-session-loopedge` 左缘标记 + 离场渐隐 `SessionLoopEdgeFade`） |
| `forge-dispatch-loop` 只折叠斜杠指令 | ✅ `packages/plugin-forge/src/projection/dispatch-loop.ts:15-23`（`command/run{run-dag-tasks}` → starting；settled 无指令事件可折叠，status 恒驻 running）——「指令断供 → 恒 idle」的现状诊断成立 |
| `forge-dispatch-events` 投影 | ✅ `packages/plugin-forge/src/projection/dispatch-events.ts`（fold `forge/progress`，entries 窗口 N=500 + total；taskKey 缺席 = 循环级事件，`progress/index.ts:113`） |
| 事件条目行 title/summary 同文 | ✅ `apps/web/src/views/session/ForgeEventEntries.tsx:141-155`，加粗 `entry.title` 与 `entry.summary` 同行拼接（:149-153），与提案描述逐位吻合 |
| 官方 bottom-follow | ✅ `@deepseek-ai/dsh-client-ui-chat/lib/client.js:4460` `useScrollFollow(state.followingTail, 25)`（25px 容差属实）、`:5049` `returnToBottom`、`lib/types/client/chat/use-chat-reading.d.ts:7` `followingTail` API |
| 落点文件 | ✅ `skills/review-proposal/SKILL.md`、`skills/run-tests/SKILL.md` 均在场；`.knowledge/conventions/wakeup-notification-minimal-info-set.md` 在场（2.3 晋升源真实） |
| 2.6 组卡 re-emit/锚定面 | ✅ `apps/web/src/client-plugin/forge-event-node.ts`（`forgeEventGroupAnchorSeq` :348-355、活跃 turn 内锚组末 seq、turn/end 后 re-anchor） |

无漏项；交付物边界与需求对等。

### 2. 方案周密吗 —— 主体直击根因，两处边界欠账

- **2.1/2.2/2.3**：把已实证的翻车点前移到检查项/口径层，属流程侧根治而非贴补丁。✅
- **2.4**：诊断准确（入口换通道、判据未跟），方向 B 复用既有投影零新增机械，是根因修法。但三态判定的推导边界有欠账（见 Q1/Q2）。
- **2.5**：已做排查定位到事件条目行渲染层单点，渲染层规则去重、数据面不动——最小且对症。✅
- **2.6**：诚实标注「成因假设，需 CDP 实测定谳，先归因再动码」，方法正确；但修复方向在归因前三轨并列（见 Q3），AC 靠结果约束兜底。

### 3. 改动收敛吗 —— 收敛

- §3 file 清单与 §2 方案一一对应，无多余文件；2.6 标注「必要时」涉及 ForgeEventEntries，诚实。
- 全程零新增机械（2.4 明确方向 B、2.5 渲染层单规则、2.6 对齐官方 returnToBottom 同缝），符合 §1.2 复用优先纪律。
- 技能/文档落点与代码落点分离清晰。

### 4. 表述清晰吗 —— AC 可测，两处词面含糊

- 六条 AC 均可测（AC4/AC6 带真机取证方式；AC1/AC2 是文档断言可 grep；AC3 落档；AC5 渲染断言）。
- 歧义词：「settled」（见 Q1）、「走查 AC 模板」（见 N3）。

---

## 二、条件核对项（触及 UI 交互面 + 运行期装配面，逐项）

| 核对项 | 结论 | 证据 |
|---|---|---|
| 真机取证 AC | ✅ 在场：AC4 真机截图（侧栏状态可辨）、AC6 CDP 归因定谳 + 真机复验可滚到最新消息 | proposal §4.4/§4.6 |
| 指标对比附录（飞轮派生必带） | ✅ 在场：四指标基线/目标表齐备 | proposal 尾段 |
| 待用户裁决清单段 | ❌ **缺失 = Blocker（B1）**：涉 UI 交互面（2.4 三态视觉词汇、2.6 修复方向取舍），提案无「待用户裁决清单」段（无也应写「无」并单列 2.3/2.6 的裁决点） | 全文无该段 |
| 官方核销结论 | ✅ bottom-follow 25px 容差 / returnToBottom / followingTail API 均有源码出处（见问 1 表）；`turn/start`/`turn/end` 载荷形状与 forge-event-node.ts:209-213 注释一致 | client.js:4460,5049；use-chat-scroll.d.ts:25 |

---

## 三、问题清单

### Blocker

- **B1｜缺「待用户裁决清单」段**。涉 UI 交互面提案必带（无决策点也须写明）；本提案实际存在应呈裁决点：2.4 三态视觉分配（running 蓝 / suspended 琥珀 / 终态渐隐）、2.6 修复方向取舍（节流 vs 补落底 vs 锚定迁移）现散落正文未集中呈裁。证据：proposal.md 全文；对照口径 review-proposal 技能「待裁决清单/裁决台账」项。处置：brainstorm 修订补段，重评。

### Question（呈用户随裁决一并定）

- **Q1｜2.4 三态词表与实际场景码不对齐**。提案写「循环级 progress 事件（startup/settled/suspend/stopped，taskKey 缺席）」，但场景码单源（`packages/plugin-forge/src/progress/index.ts:47-80`）循环族终态为 `loop/finish-all`/`loop/halt`/`loop/timeout`/`loop/stopped`，无 "settled"（`settle` 是任务级 verb，:101）；且 suspend 族四场景（:74-77）是否全部 loop 级（taskKey 缺席）未在提案中断言——若 suspend 事件携 taskKey，「taskKey 缺席即可判三态」的前提有洞。建议实现前以 FORGE_PROGRESS_SCENARIOS 单源列明确映射表。
- **Q2｜多实例与窗口边界未考虑**。同一会话先后/并行多容器循环时，badge 按什么键归属（`sourceSlug` 在场但匹配规则未写）；entries 窗口上界 N=500（dispatch-events.ts:31）——长循环把最近一枚 loop 级事件挤出窗口后，2.2 的「最近一枚 startup 事件圈定区间」与 2.4 的状态推导同时退化，兜底口径未写。host 重启残留风险较低（投影 checkpoint 冷读 = 日志重放，dispatch-events.ts:3），但依赖窗口内事件仍在。
- **Q3｜2.6 修复方向三轨并列，归因前无法估成本**。提案自律「先 CDP 归因再动码」正确，AC6 以结果（贴底保持）约束可测；但三轨（消费侧节流 / 增高后补落底 / 活跃 turn 锚定迁移）成本与风险差异大，建议归因定谳后回填选定方向再进拆解，避免派发期二次裁决。

### Note（留档）

- **N1**：2.4 侧栏状态推导建议镜像/复用 `FORGE_PROGRESS_SCENARIOS` 常量取值，禁散落字面量（progress/index.ts:42-45 单源纪律同款）。
- **N2**：2.4 改造后 `forge-dispatch-loop` 投影将确认恒 idle——是否同步标注退役或保留作历史兼容，提案未提；避免留死折叠面。
- **N3**：2.2 落点「走查 AC 模板 / run-tests 技能验收清单段」中「模板」所指位置含糊（仓内未见独立模板文件）；建议明确为 run-tests/SKILL.md 内具体段，避免派发期再定位。

---

## 四、放行结论

**不放行（1 Blocker）**：B1（缺「待用户裁决清单」段）清零并复核 Q1 映射表表述后重评。技术方案本体（六项改进、落点、官方机械核销、真机取证 AC、指标附录）经源码核验全部成立，返工量小——补一段集中裁决点即可提请用户裁决。
