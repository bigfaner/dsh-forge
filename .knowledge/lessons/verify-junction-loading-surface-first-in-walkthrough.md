---
title: 真机走查第一步核销插件装载面（junction Target）
summary: >-
  dev 宿主真机取证开跑前，先核销插件实际装载通道——`Get-Item` 看 junction 的 Target
  指向哪个检出；workspace-artifact-governance 1.4 第一轮因 junction 指向 main 旧检出（0.12.2
  无新指令）中途连环被打断，被迫切换 worktree 自持宿主，多耗半轮。AGENTS §2 junction 判例在走查场景的应用前置化。
keywords:
  - junction
  - 装载面
  - dev 宿主
  - 走查
  - 取证前置
domainPath: .knowledge/lessons/
来源容器: workspace-artifact-governance
来源任务: 1.4（真机走查，第一轮 blocked）
bug id: 无
id: verify-junction-loading-surface-first-in-walkthrough
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 真机走查第一步核销插件装载面（junction Target）

## 规则

凡任务交付物需经 dev 宿主真机验证，取证程序第一步 = 装载面核销，再开跑取证：

1. 确认宿主经哪个 junction 装载该插件（`apps/host/node_modules/@dsh-forge/<pkg>` 或 `profile.dev` 两条通道都查）；
2. `Get-Item <junction>` 看 Target——junction 绑目录不绑分支，指向旧检出/旧 worktree 不报错；
3. 版本不含交付物时：临时改指本 worktree 检出，**取证完成后必须还原**并在走查 README 留痕。

## 实证

1.4 第一轮：junction 指 main 检出（0.12.2），palette 无新指令；改指 worktree 后 main 检出宿主仍注册失效（另一回归面），最终以 worktree 自持 dev 宿主（profile.dev 就地 link 0.14.1）完成取证。两处装载面问题均非插件代码缺陷——不核销装载面就会把环境问题误当交付缺陷排查。

## 反例边界

- 不经宿主装载面的验证（单测、纯构建）无需此步。
- AGENTS §2 判例（junction 残留致「UI 不变」）是该规则的运行期症状面；本判例把核销从「出症状后诊断」前置为「取证前检查」。
