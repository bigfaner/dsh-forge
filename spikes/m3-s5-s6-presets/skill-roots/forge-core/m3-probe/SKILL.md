---
name: m3-probe
description: "M3 spike 技能（forge-core 根，rank 300）：用于验证 customSkillDirs 目录发现与跨根 rank 决胜。加载即证明 forge-core 技能根可达。"
---

# m3-probe（forge-core 版）

这是 M3 S6 spike 的探针技能，位于 forge-core 技能根（customSkillDirs，rank 300）。

- 如果你读到本文：说明 customSkillDirs（custom 根）发现链生效。
- 本技能与 user 根（rank 400）存在同名技能 `m3-probe`——按 rank 决胜（300 < 400），本版本应胜出。
- 本技能没有任何实际功能；被要求加载它时，回复：`M3-PROBE-LOADED forge-core`。
