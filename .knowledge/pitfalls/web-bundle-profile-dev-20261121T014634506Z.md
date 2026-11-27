---
title: 插件迁移接线按装载路径裁剪：web bundle 发载包无 profile.dev 工序
summary: >-
  经 apps/web bundle 发载的插件无 profile.dev link/junction，迁移时照抄宿主 profile
  装载先例即幻影工序——按 link 行/junction 存在性核销装载路径后裁剪接线清单。
keywords:
  - 迁移
  - profile.dev
  - junction
  - 幻影工序
  - web-bundle
  - 装载路径
  - workspace
  - lockfile
id: web-bundle-profile-dev
status: confirmed
version_ts: '2026-11-21T01:46:34.506Z'
updated: '2026-11-21T01:46:34.506Z'
type: conventions
candidate_of: boot-profile-renderer
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 插件装载路径判据：web bundle 发载 vs 宿主 profile 装载

迁移插件目录（packages/plugins/* → 根级 plugins/*）时，profile.dev 接线工序（link 行 + junction 改指 + profile.dev lockfile 重锁）**只适用于经宿主 profile 装载的包**；经 apps/web bundle 发送的包（如 super-composer）在 profile.dev/package.json 无 link 行、node_modules 下无 junction——照抄先例（knowledge 迁移批 209c29db）即产生幻影工序，验收条目（junction 回显）不可达成。

**判据（动手前核销）**：`Select-String <pkg> apps/host/profile.dev/package.json` 有无 link 行 + `Test-Path apps/host/profile.dev/node_modules/@dsh-forge/<pkg>`——两者皆无 = web bundle 发载路径，profile.dev 零改动即预期态（`git diff apps/host/profile.dev/` 为空作 AC），仅根 lockfile 重锁。

**引申**：迁移先例配方须按装载路径裁剪，不能整组照抄；每个「零改动核销痕」都是防幻影工序的留痕位。
