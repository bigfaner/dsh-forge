---
journey: "panel-detail-dialog"
step: 3
action: "start-edit"
title: "切编辑态：字段预填与字段集（name 不可改）"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  page: "详情 Dialog 编辑态主体（.dswf-dlg-body）"
  dom: "[编辑]（.dswf-btn-ghost）→ [保存]（.dswf-btn-primary）切换；字段：input[aria-label=岗位] / textarea[aria-label=简介]（rows=1、maxLength=120）/ textarea[aria-label=人设]（rows=6）/ .dswf-msel[data-msel=tools] 与 [data-msel=skills]（box 已选 chips + checkbox 下拉 + 技能新增 input[aria-label=新增技能]）"
anchors_source: "ui-design.md F2 + detail-dialog.tsx AutoTextarea/MultiSelect / detail-logic.ts draftOf·TOOL_CANDIDATES 事实表（static）"
last_anchor_sync: "2026-10-23T00:00:00+08:00"
sources:
  - "testing/panel-detail-dialog/journey.md 步骤3"
---

# Contract · step-3-start-edit

## Outcome: success（编辑态预填）

### Preconditions
- fixture_spec：≥1 位启用专家的详情 Dialog 已打开（查看态），档案五字段非空。

### Input
用户动作：点击头部 [编辑]。

### Output
主体切编辑态字段集：岗位 Input 预填 title；简介 textarea 预填 description（rows=1、maxLength=120）；人设 textarea 预填 personaMd（rows=6）；工具 multi-select 已选 chips = 档案 tools、候选=固定清单（read/edit/bash/grep/web/skill）；技能 multi-select 已选 chips = 档案 skills、候选=全目录技能汇总、含新增输入框；**工具段在上、技能段在下**；头部钮变 [保存]。

### State
mode=edit；draft = draftOf(expert)（数组深拷贝——编辑不污染原档案）；errors 清空。

### Side-effect
none

### Invariants
- 英文标识 name 不入草稿：编辑态无 name 输入位，键正本不可改。

## Outcome: skill-add-local（技能新增——本地草稿态）

### Preconditions
- fixture_spec：编辑态在场；新增技能值不在当前候选/已选集。

### Input
用户动作：技能新增框输入新值并回车。

### Output
新值即入已选 chips（去空去重），输入框清空；此为草稿态——未保存前档案与列表不变。

### State
draft.skills 追加新值；expert 与列表条目不变。

### Side-effect
none（落盘归 step-4 save）

### Invariants
- 新增仅在草稿层：保存前零请求；空值/重复值被吞（零效果）。

## Outcome: cancel-discard（编辑丢弃回查看态）

### Preconditions
- fixture_spec：编辑态已修改 ≥1 个字段（草稿 ≠ 档案）。

### Input
用户动作：以关闭路径（✕/Esc/遮罩）退出后重新打开同一专家详情。

### Output
Dialog 重开为查看态，呈现档案原值（修改未落盘）。

### State
草稿随关闭丢弃（state 置 undefined）；重开 open(expert) 重建新快照。

### Side-effect
none

### Invariants
- 未保存的编辑零持久化效应：关闭即弃，重开即档案现值。

## Journey Invariants
- 编辑态操作只改草稿（draftOf 深拷贝起点），expert 换新仅发生于成功保存/启停。
