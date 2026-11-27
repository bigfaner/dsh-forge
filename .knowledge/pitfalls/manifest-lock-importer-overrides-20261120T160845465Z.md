---
title: 依赖升位三方脱钩：manifest/lock importer/overrides 滞留
summary: >-
  全仓升位漏 overrides/lock 重解析致三方脱钩（manifest=新、lock importer 与
  overrides=旧），frozen-lockfile 红而测试全绿；修法=override 同笔收敛+lock 重生成，四方对齐判据
keywords:
  - pnpm-lock
  - overrides
  - frozen-lockfile
  - 依赖升位
  - importer
  - cordis
id: manifest-lock-importer-overrides
status: confirmed
version_ts: '2026-11-20T16:08:45.465Z'
updated: '2026-11-20T16:08:45.465Z'
type: pitfalls
candidate_of: boot-profile-renderer
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 依赖整代升位三方脱钩：manifest / lock importer / overrides

来源：input-history-migrate-and-upgrade / bug 1103261e（fixed @ 20cb175c），2026-11。

## 翻车形态

全仓统一升位提交同步了全部 package.json pin，但**漏改 pnpm-workspace.yaml overrides + 未触发 lock importer 重解析**——出现三方脱钩：manifest=4.1.0、lock importer 段仍 4.0.4、overrides 仍 4.0.4。`pnpm install --frozen-lockfile` 报 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`；node_modules/.pnpm 实装已是新版（锁面滞后非依赖漂移），构建测试全绿——**静默期极长**，直到机检或 frozen 安装才暴露。

## 判据与修法

- 修法必须是「override 同笔收敛 + pnpm install 重生成 lock」——只重生成 lock 不改 override 必然复发（override 是 importer 无法收敛的根因）；
- 一致性判据四方对齐：manifest pin = lock importer specifier/version = overrides = node_modules 实装（`node_modules/.pnpm` 单副本，无双实例分裂）；
- red 侧证法：`git show <commit>~1:pnpm-lock.yaml` 导出至 git 外临时区按旧 lock 复现 frozen 失败，与 green 输出对照归档——两侧文本必须可区分（同形即证据失效）。

## 预防

升位类提交的结构机检：manifest pin 变更必伴随 lock importer + overrides 三方一致断言（工单见派生提案 task-loop-evidence-ledger-hardening）。
