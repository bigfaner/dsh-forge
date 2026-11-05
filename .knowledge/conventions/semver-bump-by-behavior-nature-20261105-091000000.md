---
title: 版本 bump 位以行为面性质定性
summary: 补丁式收口提交（如事后补 bump）不改变原改动的 semver 定性——按原行为面判：功能面变化（新增/收紧行为）取 minor，纯修复取 patch；以收口提交形态宽宥成 patch 是纪律漂移。
keywords: [semver, 版本 bump, 提交纪律]
type: conventions
status: unconfirmed
id: semver-bump-by-behavior-nature
version_ts: 2026-11-05T09:10:00.000Z
来源容器: knowledge-stage2-followups
来源任务: F4/F5 评审链
bug id: 无
---

# 版本 bump 位以行为面性质定性

deny 矩阵行为面变化（4691d3a2）事后补 bump 时走了 patch——两位评审分歧（architect 宽宥 vs code-reviewer 按 §5.2），终裁采 minor：**semver 定性看原始改动的行为面，不看补 bump 的提交形态**。

约定：补 bump 时回溯原行为面定性（功能升级/新增 → minor；修 bug → patch）；评审遇「补 bump」必查原提交性质而非只看眼前 diff。
