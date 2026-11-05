---
title: 范围外基线红如实上报不夹带修复
summary: >-
  质量门实测发现与本任务无关的既有红（他容器漂移）时，正道是结构化落盘（改动面清单 + 门实测 + 范围外红如实记录）并在 summary
  上报、建议跟进容器，不顺手修、不谎报门禁通过。
keywords:
  - 范围外
  - 基线红
  - 门禁
  - 如实上报
  - 不夹带修复
domainPath: .knowledge/lessons/
来源容器: blocked-verdict-restore-primitive
来源任务: 1.4（gates.md 判例）；沉淀于 1.7
bug id: 无
id: out-of-scope-baseline-red-report-dont-fix
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 范围外基线红如实上报不夹带修复

## 判例

- 1.4 质量门实测发现 HEAD b98c8f53 基线上 `apps/host/src/boot/bridge.test.ts` 两处既有红（PROPOSALS_SERVICE_METHODS 缺 listDerivedProposals pin）——属他容器漂移，非本特性引入。
- 处置：gates.md 结构化落盘（改动面清单 + 六项门实测 + 范围外红如实上报），提交面零夹带；风险提示写进 summary（全局门 `pnpm lint` 收口验收时会被此红挡住，建议他容器跟进收口）。

## 教训

1. 门禁实测的红先做归属判定（本任务引入 vs 基线漂移），归属决定处置路径：本任务引入→当场修；基线漂移→如实上报不顺手修。
2. 「顺手修范围外问题」会污染提交逻辑单元、扩大回归面，且掩盖了漂移本身作为独立跟进项的存在。
3. 如实上报不等于放松门禁声明：gate 布尔按实测填，范围外红单列说明，不混入本任务的门禁结论。

## 出处

- `logs/blocked-verdict-restore-primitive/1.4/` gates.md；retro-first-pass.md §4/§5。
