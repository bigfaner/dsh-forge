---
title: 配置持久化取证用「刷新 + 重启双存活」行为判据
summary: >-
  验证配置写径是否真正持久（非纯前端态）时，以行为判据收口：页面刷新后重开详情值保留（排除前端内存态）+ dev
  全量重启后值仍保留（跨进程持久）——双存活即判持久成立，无需逐位定位存储载体文件；如实备注未定位的落盘位置即可。走查实改的配置值取证后经 UI 还原。
keywords:
  - 持久化取证
  - 双存活判据
  - configForms
  - 真机走查
  - 环境还原
domainPath: .knowledge/conventions/
来源容器: builtin-plugin-item-presentation
来源任务: 1.10（判据产生于本容器真机走查 batch-1，conclusion.md §4）
bug id: 无
id: persistence-evidence-restart-refresh-survival
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/equivalent-evidence-over-visual-artifact.md
---

# 配置持久化取证用「刷新 + 重启双存活」行为判据

## 规则

验证配置写入持久性的取证序列：

1. **实改**：经 UI 实际变更目标字段，变更即回显；
2. **刷新存活**：`location.reload()` 后重开详情，新值保留——排除纯前端态；
3. **重启存活**：dev 宿主全量重启后重开详情，新值仍保留——跨进程持久成立，且同时证明「保存无需重启生效」；
4. **如实备注**：存储载体未逐位定位时（如 settings JSON 不在预期 userData 路径），以双存活行为判据为准并明写未审计范围，不假装已核销落盘文件；
5. **现场还原**：取证后经 UI 改回原值并核对回显。

## 实证

builtin-plugin-item-presentation batch-1（2026-11-02）：Provider zai-coding-cn→deepseek-official、Model glm-5.3-flash→deepseek-v4-pro 实改后刷新与 dev 重启双存活（截图 06a/06b/07）；`forge-settings.json` 未变、dev userData 未见明文 JSON 承载——持久载体在 host 侧存储内未逐一审计，以行为判据收口；走查后已还原原值。

## 边界

- 双存活判据证明「行为持久」，不证明「落盘格式正确/可迁移」——涉及迁移、备份、多 profile 的验收仍需定位实际载体。
- 等价于既有「等效证据口径」（equivalent-evidence-over-visual-artifact）的延伸：机械可验证的行为断言优先于载体考古。
