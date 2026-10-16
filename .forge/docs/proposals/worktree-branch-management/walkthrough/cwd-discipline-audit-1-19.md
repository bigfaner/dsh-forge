# 1.19 cwd 纪律逐调用点审计表 + 零 checkout 审计

任务：worktree-branch-management/1.19（切换分支风险确认框 + 零 checkout/cwd 三重纪律）。

## 一、命令 cwd 纪律逐调用点审计表

基准：仓库级操作 cwd=projectRoot；树级操作 cwd=目标 worktree 路径。全部调用点收口于
`apps/host/src/ipc/worktree-rpc.ts`（UI 不直接碰 git）与 `packages/plugins/git-worktree/src/worktree-ops.ts`（cwd 参数透传，自身无硬编码目录）。

| # | 调用点 | git 命令 | 语义级 | cwd 实参 | 判定 |
|---|--------|----------|--------|----------|------|
| 1 | `list` → `listWorktrees` | `worktree list --porcelain` | 仓库级 | `resolution.projectRoot` | ✓ |
| 2 | `create` → `createWorktree` | `check-ref-format` / `fetch --prune` / `worktree add -b` / `worktree list` | 仓库级 | `request.projectRoot` | ✓ |
| 3 | `remove` → `deleteWorktree` | `worktree list` / `worktree remove` | 仓库级 | `request.projectRoot` | ✓ |
| 4 | `aheadBehind` 清单定位 | `worktree list --porcelain` | 仓库级 | `request.projectRoot` | ✓ |
| 5 | `aheadBehind` 计数 | `rev-parse @{upstream}` / `rev-list --left-right --count` | **树级** | `request.path` | ✓（本次修正：原误用 projectRoot） |
| 6 | `branches` | `for-each-ref refs/heads` / `branch -r` / `config init.defaultBranch` | 仓库级 | `request.projectRoot` | ✓ |
| 7 | `checks` 脏计数 | `status --porcelain` | **树级** | `request.path` | ✓ |
| 8 | `checks` ahead/behind | `rev-list`（同 #5） | **树级** | `request.path` | ✓（本次修正：原误用 projectRoot） |
| 9 | `checks` 清单定位 / `resolveBranch` | `worktree list` | 仓库级 | projectRoot | ✓ |
| 10 | `defaultBranch` 检出分支 | `rev-parse --abbrev-ref HEAD` | 仓库级（主树当前检出分支语义） | projectRoot | ✓ |
| 11 | `sealStateOf` 在场性 | `worktree list`（listPresent） | 仓库级 | `resolution.projectRoot` | ✓ |

`worktree-ops.ts` 内 `runGitLoose` 全部透传调用方 cwd，无旁路硬编码目录；web 侧 `aheadBehind`
懒加载经 `forge:worktree/aheadBehind`（path = 行 worktree 路径）进 #5 通路，同守纪律。

## 二、零 checkout 审计（代码走查）

- **建树**：封闭写集唯一创建命令 = `git worktree add -b <新分支> <路径> <基准>`（worktree-ops.ts
  `createWorktree`）——新树在新路径内检出，主树 HEAD 不动。前置 `git fetch --prune` 仅刷新远端引用。
- **删除**：`git worktree remove`（确认回调门后）——不动主树分支。
- **会话挂靠**：`preseedWorktreeSession`（`persistence.create({cwd: worktreePath})`，SessionHeader.cwd
  定死）+ `controller.create({sessionId, cwd: worktreePath})`（官方 adopt/resume）——纯 meta.cwd 语义，
  零任何 checkout 调用；`withWorktreeCwd`（SessionStore.create 面）同口径。
- **hero chip 切换**：会话仅进入对应树 pwd（meta.cwd），判定/守护均为纯函数路径比对（model.ts
  `isCrossBranchRisk` / seal-guard `evaluateSeal` / `assertSessionCwdMatches`），无 git 写。
- 真机断言：e2e `worktree-risk-confirmation.spec.ts` 末段——建树+挂靠后主树 `rev-parse --abbrev-ref HEAD`
  恒 = `main`。

## 三、挂靠会话 cwd 强制（用户裁决 2026-10-16 二次强化）

- **建立面**（既有，审计确认覆盖）：预铸配方 `preseedWorktreeSession` cwd 头定死 + `sessionCreate`
  通路 `controller.create({sessionId, cwd: request.worktreePath})`——业务执行目录建会话即定死。
- **守护面**（本任务新增）：`readLatestAttach` 读得绑定即经 `assertSessionCwdMatches`（归一比对，
  seal-guard.ts）校验 `SessionHeader.cwd ≡ 绑定 worktreePath`；不一致抛 `SessionCwdMismatchError`
  显式报错——`sealStateOf` 对该错误不再 `.catch` 降级，经 RPC 错误面上抛 web，不留「绑定 A 树、
  实际跑在 B 树」的静默漂移。header cwd 缺席（非预铸配方的历史会话，无漂移证据可判）放行，
  守护只对可判定面生效（低风险假设，已声明）。
- **实测面**：e2e 真机 `forge:worktree/sessionCreate` → 落盘会话文件头 `SessionHeader.cwd` = worktree
  根；在该 cwd 下 `git rev-parse --show-toplevel`（pwd 语义面）= worktree 根。证据：
  `logs/worktree-branch-management/1.19/001-risk-confirm/`（截图 + spec 落盘断言）。

## 四、风险确认框（官方 RiskConfirmation 复用）

- `client/risk-confirmation.tsx`：官方 `RiskConfirmation` 薄封装（状态缝合——勾选知悉前确认钮
  不可用为官方内部语义，不传 disabled 防勾选框死锁；关闭复位勾选）。
- hero chip 改选：目标行分支 ≠ 主树当前检出分支（`isCrossBranchRisk` 纯函数，model.ts 单源）→
  先弹框；取消保持原选零编排；同分支重选不弹直接切换。
- 新建表单：基准分支 ≠ 主树当前检出分支 → 创建前同款框（`CreateWorktreeDialog` 新增 `mainBranch`
  入参，WorktreeFaces 从清单主行给定）；取消不进 git。
