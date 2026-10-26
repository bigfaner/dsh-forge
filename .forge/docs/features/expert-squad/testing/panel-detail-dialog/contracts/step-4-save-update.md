---
journey: "panel-detail-dialog"
step: 4
action: "save-update"
title: "保存：校验门 → update 落盘 → 换新回查看态 + 列表联动"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "详情 Dialog 编辑态 [保存] → 查看态 + Toast"
  dom: "[保存]（.dswf-btn-primary，busy 时 disabled）→ POST /api/expert-squad/update（body: workspace+name+draft）→ .dswf-dlg-err 字段级错误 / .dswf-toast[role=status] Toast / 查看态换新呈现；背后 .dswf-xcard[data-expert-key] 同步（patchEntry）"
anchors_source: "ui-design.md F2 + detail-source.ts save / expert-panel.tsx defaultDetailMutations / detail-logic.ts validateDraft·DESCRIPTION_MAX 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-detail-dialog/journey.md 步骤4 + 边界1/2/3"
---

# Contract · step-4-save-update

## Outcome: success（保存落盘换新联动）

### Preconditions
- fixture_spec：编辑态在场，草稿已修改（新岗位/新简介/新人设/白名单勾选变动/技能新增），全部通过校验门。

### Input
用户动作：点 [保存]。

### Output
POST update 发出（body 含 workspace、name 与五字段草稿）；成功后回查看态：新值呈现于查看段、Toast「档案已保存（热刷新生效）」（role=status）、头部钮回 [编辑]；**背后列表卡片即时同步新值**（patchEntry，不待轮询）。

### State
expert 换新为 update 应答档案；mode=view；busy=false；列表控制器条目 patch。

### Side-effect
- POST /api/expert-squad/update 一次（name 键定址；update 后下次取用/派发读新档——热刷新语义）。

### Invariants
- name 不随 update 变更（请求体 name 与卡 data-expert-key 恒同键）。
- busy 防重：在途期间保存钮禁用，零并发双写。

## Outcome: validation-empty-title（空岗位字段级报错）

### Preconditions
- fixture_spec：编辑态在场；草稿岗位被清空（或全空白），其余字段合法。

### Input
用户动作：点 [保存]。

### Output
岗位字段下呈 `.dswf-dlg-err`「岗位不能为空」；停留编辑态；无 Toast；**update 请求零发出**（拦截缓冲无 update 命中）；档案与背后卡片不变。

### State
errors.title = 「岗位不能为空」；draft 保留（输入未丢）；mode 仍 edit。

### Side-effect
none

### Invariants
- 校验失败零落盘零请求：错误只在字段级呈现，修正后可成功保存。

## Outcome: validation-bare-mustache（人设裸 `{{` 拒绝）

### Preconditions
- fixture_spec：编辑态在场；岗位合法；人设 textarea 含裸 `{{`。

### Input
用户动作：点 [保存]。

### Output
人设字段下呈 `.dswf-dlg-err`「人设含裸 {{ ——不被允许」；停留编辑态；update 零发出；档案不变。

### State
errors.personaMd 置错误文案；draft 保留。

### Side-effect
none

### Invariants
- 裸 `{{` 是模板占位符注入防线：任何落盘路径都不得携带裸 `{{` 人设。

## Outcome: update-failure（update 通道失败停留编辑态）

### Preconditions
- fixture_spec：编辑态在场、草稿合法；注入拦截使 update 路由拒绝（非 2xx/抛错）。

### Input
用户动作：点 [保存]。

### Output
停留编辑态（字段集与草稿保留）；Toast「保存失败：<错误信息>」（role=status）；查看态不进入；背后卡片不变。

### State
expert 不换新；mode 仍 edit；busy=false（退出在途）。

### Side-effect
- 一次失败的 update 尝试（档案零变更）。

### Invariants
- 失败零局部落盘：Dialog 专家与列表卡片两侧均不变；修正通道（解除注入再保存）后走 success 语义。

## Outcome: description-limit（简介 120 字上限）

### Preconditions
- fixture_spec：编辑态在场（source: static——textarea maxLength=120，与 update 路由 zod 门同值）。

### Input
用户动作：简介 textarea 输入超 120 字。

### Output
输入被截断至 120 字（maxLength 硬限）；无错误呈现；保存可正常通过。

### State
draft.description ≤ 120 字。

### Side-effect
none

### Invariants
- 简介上限在 UI 层前置拦截（maxLength），与 update 路由 zod 门同值双保险。

## Journey Invariants
- 保存链恒序：校验门（本地）→ update 路由 → 换新 + 回查看态 + Toast + 列表 patch；任一环失败则全链零变更。
