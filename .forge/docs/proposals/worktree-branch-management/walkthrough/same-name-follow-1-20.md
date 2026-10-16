# 1.20 真机走查：worktree 名默认与分支同名跟随（三输入保留，可覆盖）

任务：worktree-branch-management/1.20。e2e 载体：`e2e/specs/worktree-same-name-follow.spec.ts`
（真 git 仓夹具：主树检出 main；真机 electron + 官方 primitives 实装）。

## 走查结论（全数通过）

| AC | 走查面 | 实测结果 |
|----|--------|----------|
| 同名默认跟随（三输入保留） | 分支输入 `topic-a` → worktree 名输入框 | 值 = `topic-a`（同名跟随）；分支改 `topic-b` → 输入框同步 `topic-b` |
| 手改后脱离跟随 | worktree 名手改 `my-lab` → 分支改 `topic-c` | 输入框保持 `my-lab`（以用户值为准）；截图 `detached-after-manual-edit.png` |
| 清回同名恢复跟随 | worktree 名改回 `topic-c` → 分支改 `topic-d` | 输入框跟随至 `topic-d`；截图 `resume-follow-on-same-name.png` |
| 同名默认下创建路径 | 分支 `topic-create`（跟随值同名）→ 创建 | 清单出现 `topic-create`，路径尾段 = `/topic-create`（= 所配目录/worktree 名；装配面派生不变） |

## 判定单源

跟随/脱离判定纯函数 `isWorktreeNameFollowing(branch, worktreeName, touched)` 进
`packages/plugins/git-worktree/src/client/model.ts`：未手改 → 跟随；手改 → 用户值；手改值与
分支同名（trim 口径）→ 恢复跟随。分支变化经 `changeBranch`（跟随态复位手改标记）。

证据留盘：`logs/worktree-branch-management/1.20/001-same-name-follow/`（不进 git）。
