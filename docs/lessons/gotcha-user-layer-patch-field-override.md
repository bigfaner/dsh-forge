---
created: "2026-09-28"
tags: [architecture, testing]
---

# 用户层 patch 行的字段级覆盖陷阱:技能面在组合树里静默失踪

## Problem

M3 交付(15 项 forge 技能经 customSkillDirs 承载)后实机启动,会话输入框 `/` 弹出的技能列表只有 office-docx/pptx/xlsx 三项,15 项 forge 技能全部缺席。而 boot 同步一切"成功":`SKILL_DIRS_SYNCED` 日志正常,用户层 `cordis.patch.yml` 落笔正确,技能根 15 个目录 + 清单 hash 全部在场——所有文件层证据都是绿的,没有任何告警。

## Root Cause

因果链至少四层:

1. **表层**:skill-filesystem provider 没有挂载,技能注册表里没有它本应贡献的 15 项。
2. **中层**:宿主组合树中该行最终为 `disabled: true`。`dsh-web-app` bundle 的 `cordis.patch.yml` 对 `id: skill-filesystem` 打了 `disabled: true`(web 面默认禁本地文件系统扫描);桌面宿主的 profile bundles(dsh-base → dsh-web-app → 插件)同样吃进了这层 patch。
3. **深层语义**:cordis loader 的 patch 算法(`applyEntryPatches`,vendored `vendor/include/src/index.ts`)对 patch 条目做**顶层字段整体赋值、只覆盖显式携带的键**(`target[key] = value`)。5.7 写入的用户层受管行只携带 `config.customSkillDirs`,不携带 `disabled: false`——因此永远翻转不了上游层已写入的禁用。行存在 ≠ 行生效。
4. **为什么测试没抓到**:e2e 的 `assertSkillsResolve` 只验到文件层(patch 落笔 + SKILL.md 能被 vendored yaml 解析);fixture 世界自建 profile,未按生产 bundle 清单组合真实 patch 层——`dsh-web-app` 的禁用 patch 从未参与 fixture 组合。**活宿主的最终组合结果从未被任何测试看见。**

## Solution

`packages/plugins/forge-workbench/src/host/skill-dirs/sync.ts`:受管行自带 `disabled: false`——

- 创建路径:`managedRowBlock` 在 `id` 与 `config` 之间固定写入 `disabled: false`;
- 修复路径:`ensureRowEnabled` 对既有受管行做启用保障(缺失则紧随行内首个实体行插入、值非 false 则原位改写;插入位点必须在行键级别,绝不能落在 `config:` 与其子键之间——会截断嵌套块);
- 变更汇入漂移检测(`enableChanges` 进各返回路径的 `changes`,触发 repaired 重写与 marker 刷新);
- 新增回归测试:disabled: true 的受管行被翻转回 false。

## Reusable Pattern

1. **给 cordis 组合写用户层/overlay patch 行之前,先离线复算真实层文件的最终组合**:base `cordis.yml` + 按 profile `dsh.profile.bundles` 顺序逐 bundle 的 `cordis.patch.yml` + 用户层 + overlays,用 vendored include 的 `applyEntryPatches` 本尊拍平,检查目标行的**最终形态**(disabled/name/config 全字段)。上游层可能早已对同 id 行改过其他字段;"我写了这一行"证明不了"这一行以我期望的形态生效"。
2. **凡断言"X 已生效"的 e2e,必须有至少一条腿验到活宿主消费面**(组合树快照 / 注册表 / UI 呈现)。文件存在性断言(`assertSkillsResolve` 那种)只能证明落笔,证明不了挂载。
3. **provider 被组合层禁用是静默类故障**:不产生 `ERR_SKILL_DIR_SYNC`(同步本身没失败),loader 的 per-entry warn 也只进宿主进程日志、不进壳日志——离线复算是唯一可靠诊断面。

## Example

离线复算核心(完整脚本见 `tmp/compose-check.mjs`):

```js
const include = await import(pathToFileURL(VENDORED_INCLUDE_LIB).href)
const base = yaml.load(readFileSync(`${PROFILE}/cordis.yml`, 'utf8'), { schema: include.entryListSchema })
const layers = [dshBasePatch, dshWebAppPatch, pluginPatch, userPatch] // boot 层序
  .map(text => yaml.load(text, { schema: include.entryListSchema }))
const composed = include.applyEntryPatches(base, layers.flat(), warnSink)
// 检查 composed 中目标行的 disabled / config 最终值
```

## Related Files

- `packages/plugins/forge-workbench/src/host/skill-dirs/sync.ts` — 受管行写入(修复所在)
- `packages/plugins/forge-workbench/tests/skill-dirs-sync.spec.ts` — 回归测试(禁用行翻转)
- `packages/desktop-host-vendor/vendored/packages/bundle/web-app/cordis.patch.yml` — 禁用源头(`id: skill-filesystem` → `disabled: true`)
- `packages/desktop-host-vendor/vendored/vendor/include/src/index.ts` — `applyEntryPatches` patch 语义权威
- `tests/e2e/specs/session-native-ops-skill-addressing/step-4-skill-flat-addressing.spec.ts` — 只验文件层的缝隙所在

## References

- `docs/features/dsh-forge-m3/tasks/records/5.7-customskilldirs-sync.md` — 机制交付记录(AC1 后半"会话内寻址"当时被归给 e2e 腿,而 e2e 腿只到文件层)
