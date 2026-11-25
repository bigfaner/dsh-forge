---
title: 官方无 auto form 插件配置页——配置 UI 正门是插件自带 companion 页经 slots 注册
summary: >-
  「settings .volatile() 字段声明后官方表单自动生成配置页」不成立：dsh-settings README 明言 autoGenerate
  "no shipped client does so yet"。官方插件配置页正门 = 插件自带 client companion 包，经
  `ctx.slots.inject('settings.plugins.tab')` 注册
  tab（id/order/label），页面表单由插件自绘或组合官方组件；settings 服务只供 revisioned
  读写与校验。引用「官方已有先例」前必须到官方包文档/源码反证，不存在的包（如「dsh-context 实证」）即核销失败信号。
keywords:
  - auto form
  - autoGenerate
  - settings.plugins.tab
  - companion UI
  - 插件配置页
  - 假设核销
domainPath: docs/conventions/reuse-official-mechanisms.md
来源容器: expert-squad-default-routing
来源任务: 提案评审 review/report.md B1（第一轮 Blocker → 复审清零）
bug id: 无
id: plugin-config-page-no-auto-form
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 官方无 auto form 插件配置页

## 规则

- 插件配置页承载形态：自带 companion client 包注册 `settings.plugins.tab` render slot；section 只拥有导航与 tab chrome，页面内容由注册插件自带。
- `.volatile()` 字段只解决「配置持久化与热生效」，不生成任何 UI。
- 三重反证法（可复用的核销动作）：① 官方文档明文（README "no shipped client does so yet"）；② 官方配置页正门机制文档（plugin-manager README Configuration pages 节）；③ 被引「实证包」在 `node_modules/@deepseek-ai/` 全目录清单中不存在。

## 适用条件与边界

- 凡提案声称「官方已有 X 先例/自动机制、本方案零自绘」时适用——必须出包名 + 文件行号；引不存在的包名直接判 Blocker。
- 官方组件的组合/胶水（表单控件复用）仍属允许交付，只是「零 UI 交付」不成立，改动面表须如实列出 companion UI 行。
