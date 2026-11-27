---
title: "预设装配约定"
domains: [preset, profile, boot-overlay, bindings, hero]
---

# 预设装配约定

> 宿主 profile 预设装配形态：双预设底稿、boot overlay 物化纪律、行所有权分叉、镜像行契约 pin。

## 装配与物化

### TECH-preset-001: 预设装配形态（boot overlay 物化 + 行所有权分叉）

**Requirement**: `apps/host/src/profile/presets/{cordis,expedition,blitz}.patch.yml` 三底稿——cordis = registry default 覆写（expedition）；预设行 = 上游 standard 全量镜像（**config 全集**——缺必填 config → schema 拒 → 整预设 broken 不上菜单，spike 教训）+ customSkillDirs 技能目录占位符（expert-squad / knowledge 技能目录——renderBootOverlay 物化为当形态绝对路径）+ persona（只谈作风不谈角色与工具禁令）；物化 = renderBootOverlay 每启注行、customSkillDirs 与平台门行（`!!js` disabled 表达式）解析为当形态**绝对路径/具体布尔**（`!!js` 表达式全形态死刑——物化输出零表达式残留；packaged = resources 物化路径、dev = repo 路径）；契约 pin = 两预设 standard 基础行 ↔ 上游 standard.patch.yml 机械 diff 一致（G1-19）；行所有权分叉 = 预设声明行 boot 每启覆盖（产品工件，用户不可经 UI 改组合）/ ui-settings 开关行首启预置一次性（PROFILE_TEMPLATE + materialize 增量补行 id 键控已存在不覆盖，此后归用户运行时——两径不混）。
**历史注**: M3–M5 期预设曾携带 plugin-forge / plugin-forge-spec 增量行与 `{{plugin-forge-bindings}}` 占位符（行内行须携带与全局行同值 config 的单源纪律——fix-1/drift #9）；旧包退役后该两行与占位符已随预设底稿一并退场。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-004（tech-design §Interface 5·图 1·§边界与依赖变化 3 / apps/host/src/profile/{presets,materialize,template}.ts）+ plugins-remediation-m1-legacy-retirement 阶段 B（预设组合 = `plugins/forge` 聚合包及成员；旧双包行与技能目录占位符退场）
