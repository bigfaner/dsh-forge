---
feature: "mobile-ui"
journey: "ask-paged-three-question-types"
risk_level: "High"
surface_types: ["mobile"]
surface_keys: ["mobile"]
sources:
  - ".forge/docs/features/mobile-ui/prd/user-stories.md#US-3"
  - ".forge/docs/features/mobile-ui/prd/ui-functions.md#F2"
  - ".forge/docs/proposals/mobile-ui/proposal.md#交互契约"
  - "e2e/fixtures/mobile/README.md"
generated: "2026-10-17"
---

# Journey：ask 分页面板 · 三题型作答

**用户故事**：US-3 回答 ask 面板（批次①）。
**回溯**：proposal 交互契约「ask 面板」行 + ui-functions F2 选项语义（官方 renderQuestionComposer 源码钉死形状 R9#2）。

## 搭建前置条件（回放驱动）

- mobile project 加载 mobile dist；`page.route` 回放 `e2e/fixtures/mobile/`（proxy-rpc 通道含 `user-questions-answer` 完整交换，SSE 帧含 pending 交互通知）。
- 会话存在 pending 交互：题目载荷形状 = `pendingQuestion = {rpcId, questions:[{id, header?, question, detail?, options?:[{label, description?, recommended?}], multiSelect?}]}`；fixture 覆盖三题型：单选（multiSelect 缺省）、多选（multiSelect=true）、含 other 自由文本题。

## Happy Path

1. **会话产生待回答问题** → 预期：对话主视图出现 pending 交互入口，进入 `#/ask` ask 面板；一屏一题，左上角显示「1/N」序号/总数。
2. **用户在单选题点选某一选项** → 预期：该选项即时呈选中态（圆形 radio），无需二次确认；点选另一选项即改选，选中态唯一。
3. **用户点「下一个」** → 预期：翻到第 2 题（多选题），方框 checkbox 呈现，可任意勾选/取消多个选项组合，已勾选项互不影响。
4. **用户在多选题勾选组合后，在 other 自由文本域输入值** → 预期：输入值表示额外选中 other（出现 other 选中态），不影响已勾选的其它选项。
5. **用户点「上一个」回看第 1 题，再点「下一个」** → 预期：第 1 题已选状态保留，回翻不丢答案；第 2 题勾选与 other 输入同样保留。
6. **用户在末题点「提交」** → 预期：载荷经 `interaction.answer` 通道提交，形状 = `{id, selected:[label…], custom}`（+skipped）；提交后面板关闭，回到对话主视图（pending 交互清除）。

## 边界用例

1. **（引步骤 2）单选题带 other 自由文本域**：分叉前置 = 题目附带 customAnswer 域 → 用户输入值即表示选中 other（radio 落在 other 上）；改选其它选项时 other 输入保留为 custom 载荷候选，可再改回。
2. **（引步骤 3）多选题取消已勾选项**：分叉前置 = 已有勾选组合 → 点已勾选项即取消，其余勾选不变；全取消后 selected 为空仍可翻页，提交前由用户决定。
3. **（引步骤 4）recommended 选项徽标**：分叉前置 = 选项含 `recommended:true` → 该选项呈现推荐徽标，但不自动选中，用户点击行为与普通选项一致。
4. **（引步骤 4）多选题 other 与选项互不干扰**：分叉前置 = 用户先输入 other 再勾选选项 → 两者并存（selected 含选项 label、custom 含文本）；清空 other 输入 = 取消 other 选中，已勾选项不受影响。
5. **（引步骤 5）翻页不提交中间态**：分叉前置 = 用户在上一个/下一个间往返 → 任何翻页动作都不发 `interaction.answer`，仅最终「提交」发出一次完整载荷。
6. **（引步骤 6）占位输入框互斥**：分叉前置 = 题目含占位输入框（与选项互斥呈现）→ 输入框聚焦时选项选择态让位（单选=选中 other 语义），提交载荷 custom 携带输入值、selected 相应为空。
7. **（引步骤 6）skipped 题**：分叉前置 = 用户对某题未作答直接翻到末题提交 → 该题以 skipped 语义进入载荷（不阻塞提交），面板侧无未答阻塞提示（host 侧决定后续）。
8. **（引步骤 1）pending 交互与会话切换竞态**：分叉前置 = ask 面板打开期间用户退回主视图切到另一会话 → 面板关闭且已作答不误发到其它会话；再次进入原会话 pending 交互仍在（未提交不消失）。

## Journey Invariants

- **一屏一题分页不变式**：任意时刻面板至多呈现一题；序号/总数与实际题集一致；翻页不丢不重。
- **题型判别唯一依据 = `multiSelect`**：单选永远圆形 radio 单选中，多选永远方框 checkbox 任意组合——UI 形态与载荷形状（selected 数组 + custom）一一对应。
- **提交语义 = 意图转发**：手机端只组装 `{id, selected, custom}` 经 `interaction.answer` 转发，零校验零循环参与；提交结果与 host 落地由回放响应呈现。
- **作答状态局部性**：答案只存在于面板内直到提交；切会话/翻页/断线不产生误提交或跨会话泄漏。
- **对齐官方交互词汇**：previous/skip/continue 按钮族与官方页逐位同词汇；主按钮 #4176e6、选中态配方全站统一。
