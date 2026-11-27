---
title: dsh 官方 composer 能力边界与 input-history 价值立足点
summary: >-
  0.2.2-rc.5 实证：官方无 ↑/↓ 翻阅历史输入（keymap arrows 仅 arbitration 让权），草稿恢复 rc.2
  已有且语义不同——插件价值立足点成立，arrow 缝为活扩展点
keywords:
  - dsh
  - composer
  - input-history
  - 翻阅
  - 草稿
  - arbitration
id: dsh-composer-input-history
status: confirmed
version_ts: '2026-11-20T16:08:45.492Z'
updated: '2026-11-20T16:08:45.492Z'
type: facts
candidate_of: forge-pluginization-architecture
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# dsh 官方 composer 无输入翻阅能力（input-history 插件价值立足点）

来源：input-history-migrate-and-upgrade 评审期探针（0.2.2-rc.5 五包 tarball 实取证，2026-11）。

## 客观事实（可被官方后续版本推翻）

1. **↑/↓ 翻阅历史输入：官方未内置**。composer 按键面唯一注册点 `@deepseek-ai/dsh-client-ui-conversation@rc.5 src/client/input/editor/keymap.ts:228-229`——`KEY_ARROW_UP/DOWN_COMMAND` 仅作 arbitration 让权钩子（返回 pass/consumed 给 trigger 菜单），无历史栈消费；五包穷尽 grep `inputHistory|previousInput|history.*recall` 零命中（`history` 命中均为 Session 转录分页语义）。
2. **暂存草稿恢复：官方已有（rc.2 即存在，非新代新增）**——`conversation` localStorage 按 sessionId 持久化 + `draft.ts` 语义草稿快照（文本/reference chips/quotes/command token）+ `restoreDraft`；语义 = 单会话单草稿「回来时还在」，与 input-history 的「跨消息已发送输入序列翻阅 + mention 守卫 + 会话切源状态机」不重叠。
3. **arrow arbitration 缝是活扩展点**：官方 keymap `handlers.arbitrate` 即插件 inject 合法缝（rc.5 未收编、缝未关闭）——后续官方世代若收编输入翻阅，插件价值面收窄；插件侧差异化投入应向「会话切源 + mention 守卫」等官方草稿系统不覆盖语义倾斜。

## 语义对照表

| 能力 | 官方 | input-history |
|---|---|---|
| ↑/↓ 序列翻阅已发送输入 | 无 | 独有 |
| 单会话草稿持久化/切源恢复 | rc.2 已有 | 部分重叠 |
| mention 守卫 | 无 | 独有 |
