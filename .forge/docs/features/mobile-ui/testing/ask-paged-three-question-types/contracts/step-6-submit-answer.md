---
journey: "ask-paged-three-question-types"
step: 6
action: "submit-answer"
title: "末题提交载荷"
risk_level: "High"
surface: { type: "mobile", key: "mobile" }
anchors:
  endpoint: "POST /api/rpc interaction.answer 载荷 {id, selected:[label…], custom}(+skipped)"
anchors_source: "design/api-handbook.md §五 + proposal 交互契约"
last_anchor_sync: "2026-10-18T14:31:02+08:00"
sources:
  - "testing/ask-paged-three-question-types/journey.md 步骤6 + 边界6/7"
---

# Contract · step-6-submit-answer

## Outcome: success（提交后面板关闭）

### Preconditions
- fixture_spec：用户在末题；各题作答缓冲在位。

### Input
用户动作：点「提交」。

### Output
载荷经 interaction.answer 通道提交，形状 = `{id, selected:[label…], custom}`（+skipped）；提交后面板关闭，回到对话主视图（pending 交互清除）。

### State
面板态退出；pending 集合经回执更新。

### Side-effect
宿主侧消费答案载荷（host 决定后续；手机端零循环参与）。

### Invariants
- 提交语义 = 意图转发：载荷形状与官方交互契约一致，零校验。

## Outcome: placeholder-exclusive（占位输入框互斥）

### Preconditions
- fixture_spec：题目含占位输入框（与选项互斥呈现）。
- 分叉点：输入框聚焦作答。

### Input
用户动作：聚焦输入框输入并提交。

### Output
输入框聚焦时选项选择态让位（单选 = 选中 other 语义）；提交载荷 custom 携带输入值、selected 相应为空。

### State
作答缓冲呈输入主导形态。

### Side-effect
none（提交前）

### Invariants
- 载荷形状不变式：custom/selected 互斥语义在载荷层成立。

## Outcome: skipped-question（未作答 skipped 提交）

### Preconditions
- fixture_spec：用户对某题未作答直接翻到末题提交。
- 分叉点：skipped 语义进入载荷。

### Input
用户动作：跳答后提交。

### Output
该题以 skipped 语义进入载荷（不阻塞提交）；面板侧无未答阻塞提示（host 侧决定后续）。

### State
提交完成、面板关闭同 success。

### Side-effect
宿主消费含 skipped 的载荷。

### Invariants
- 面板零阻塞：未答不拦截导航与提交。

## Journey Invariants
- 提交一次性：仅「提交」发出一次完整载荷；提交结果与 host 落地由回放响应呈现。
