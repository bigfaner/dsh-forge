---
title: specs 替代 proposals：forge 文档落点口径
summary: >-
  proposal 域已下线、由 specs 替代（用户裁定 2026-11-25）：Spec 文档与任务结算回收的 worker 报告同根落
  .forge/specs/——文档在 .forge/specs/{slug}/spec.md，回收报告在
  .forge/specs/<slug>/issues/<localId>/（不是 .forge/docs/specs/）；T3 排查建模报告落
  .forge/probes/<bugId>/ 单轨（目录键 project.probes_dir，2026-11-27 由
  .forge/docs/probes/ 迁入 .forge 正式分区）。新代码不再引入 proposals/ 路径，残留按 bug 登记。
keywords:
  - specs
  - proposals
  - proposal域退役
  - 目录约定
  - forge
  - task-loop
  - lib-path
  - probes
id: specs-proposals-forge
status: confirmed
version_ts: '2026-11-27T02:22:03.276Z'
updated: '2026-11-27T02:22:03.276Z'
type: conventions
procedure: true
supersedes: '2026-11-25T15:45:28.777Z'
confirmed_at: '2026-11-27T16:09:03.019Z'
---
# 约定

**proposal 域已下线，由 specs 替代。** 用户裁定（2026-11-25，容器 bug-fix-batch-1116 复盘期；落点经用户二次更正确认）：今后凡原本落在 proposal 口径下的位置，一律改用 specs。

## 已确定的落点

| 用途 | 落点 | 说明 |
|---|---|---|
| Spec 文档 | `.forge/specs/{slug}/spec.md` | Spec 管线的文档登记位；slug 是 spec 的 slug |
| 任务结算回收的 worker 报告 | `.forge/specs/<slug>/issues/<localId>/` | 与 Spec 文档同根 `.forge/specs/`；`<slug>` 是任务容器 slug。原为 `.forge/docs/proposals/<slug>/issues/<localId>/`。**不是** `.forge/docs/specs/` |
| T3 复发拦截的排查建模报告 | `.forge/probes/<bugId>/` | 单轨，顶层非递归 `.md`；不属于 specs 替代范围。目录键 `project.probes_dir`（经 forge_dirs 查询）；2026-11-27 由 `.forge/docs/probes/` 迁入 `.forge` 正式分区，investigate-bug 技能与 claim 探测同径 |
| Spike（探索验证的结论与脚本） | `.forge/spikes/<主题>/` | 目录键 `project.spikes_dir`；原在工作区根 `spikes/`（2026-11-27 起统一入 `.forge`） |

## 适用规则

- 新写或修改路径、注释、指引文案、测试 fixture 时，不再引入 `proposals/` 路径。
- 发现残留的 `proposals/` 路径，按 bug 登记，不就地顺手改（落点语义可能需单独裁定）。
- 陈述「已退役」的否定句（如 `not.toContain("proposals/")` 守卫）不属于残留，保留。
- 路径派生优先复用 `@dsh-forge/lib-path` 现成函数；注意 `workspaceDocsRoot(ws)` 返回 `<ws>/.forge/docs`，不能直接充当 `.forge/specs` 或 `.forge/probes` 的根——probes 根 = `forgeDirOfWorkspace(ws)` + `probes` 段。
- `packages/plugin-forge` 是旧宿主代码，仍存在 proposals 残留；是否清理由用户单独裁定，不在本约定自动覆盖范围。

## 溯源

来源容器：bug-fix-batch-1116；bug id：8dcbe845-dd7c-4299-99d4-2401525191f5（结算回收钩子落点改 `.forge/specs`）；相关已修：a2a5621e-c0ac-42e8-88df-416dac74f392（investigate-bug 技能）、6cc4ec2a-f357-4795-9992-d54a800faf87（claim.ts 注释）。probes/spikes 迁入 `.forge`：用户裁定 2026-11-27（目录键归属重构）。
