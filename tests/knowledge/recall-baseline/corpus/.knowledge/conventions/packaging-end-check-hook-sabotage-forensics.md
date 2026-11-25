---
title: 打包链末端自动校验挂点 + 破坏注入三步取证法
summary: >-
  在封包命令成功末端自动跑关键文件 --check（失败报缺失清单 + 特征串 + exit
  1），使「封包成功」不再等于「可交付」；验证拦截有效性用破坏注入→拦截→恢复三步取证：删一个 requiredKeyFiles
  文件重跑，确认封包照常成功但末端红 + exit 1，再恢复现场。
keywords:
  - 打包
  - dist
  - 关键文件校验
  - fail-loud
  - 破坏注入
  - 取证
domainPath: conventions
status: unconfirmed
source_container: packaging-guard-hardening
source_task: packaging-guard-hardening/1.5
id: packaging-end-check-hook-sabotage-forensics
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 打包末端校验挂点与破坏取证

## 适用条件

- 封包工具（electron-builder 等）成功 ≠ 安装包完整——staging/app 关键文件可能缺席。
- 需要证明「守卫真的拦得住」，而非只看绿灯自证。

## 做法

1. **末端自动校验挂点**：封包脚本成功后自动执行同口径关键文件校验（`assemble --check`）；失败输出缺失清单 + 特征串（`PACKAGING_CHECK_FAILED`）+ exit 1，通过输出 `PACKAGING_CHECK_OK`。
2. **破坏注入三步取证**：
   - 注入：删一个关键文件（如 `release/staging/icon.png`）；
   - 拦截：重跑全链，断言封包照常成功但末端 `CHECK FAILED` + exit 1（退出码落盘留证）；
   - 恢复：`pnpm dist:stage` 重建 staging 树，exit 0 收尾。
3. 全链取证日志（成功 + 破坏 + 恢复）归档 walkthrough 目录留盘。

## 反例边界

- 只适用于可确定性重建的 staging/产物树；不可重建的现场先备份再破坏。
- 校验口径必须与封包同一来源（同 --check 函数），双口径等于没守。

## 来源

- `scripts/dist-win.mjs` 末端校验挂点；取证 `packaging-guard-hardening/walkthrough/1.5-dist-win-check-hook/`（dist-win-full.log / dist-win-sabotage.log / exit-code.txt / restore-stage.log）。
