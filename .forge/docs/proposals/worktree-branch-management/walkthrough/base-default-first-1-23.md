# 1.23 基准分支默认选中 = 排序首项（真机走查）

- 裁决：新建表单基准分支默认选中 `sortBaseBranchOptions(...)` 排序后首项，默认与排序同源单点；不再单独取 defaultBranch。
- fixture：`init.defaultBranch=trunk` + 本地 main/master/trunk/develop/zeta；排序首项 = main。
- 取证：e2e `e2e/specs/worktree-base-branch-order.spec.ts`（1 passed, 31.7s）。
- 证据目录：`forge logs /worktree-branch-management/1.23/001-base-default-first/`
  - `base-branch-default.json` → `{"default": "main"}`（触发器文案 = 排序首项）
  - `base-branch-order.json` → `["main","master","trunk","develop","zeta"]`
  - `defaults-rpc.json` → defaultBranch = trunk（1.13 校验链产出，仍作排序身份位）
