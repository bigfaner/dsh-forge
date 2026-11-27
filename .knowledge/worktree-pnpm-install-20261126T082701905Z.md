---
title: 仓库 worktree 内禁止 pnpm install；「已是最新」是假阳性，恢复须整体重建依赖目录
summary: >-
  不要在仓库 worktree 内执行 pnpm install，会被上层 pnpm-workspace.yaml 接管并污染根锁文件与依赖目录。恢复时
  pnpm install --frozen-lockfile 报「已是最新」不可信——它不检查包是否在位，测试与 lint
  可能已是空壳。唯一可靠办法是删掉整个 node_modules 按锁文件重建，并以工具能真跑为验收。
keywords:
  - pnpm-install
  - worktree
  - pnpm-workspace
  - node_modules
  - frozen-lockfile
  - 依赖污染
  - ' Already up to date'
id: worktree-pnpm-install
status: confirmed
version_ts: '2026-11-26T08:27:01.905Z'
updated: '2026-11-26T08:27:01.905Z'
type: pitfalls
candidate_of: forge
confirmed_at: '2026-11-27T16:09:03.019Z'
---
## 结论

**不要在仓库的 worktree 里执行 `pnpm install`（哪怕加了 `--node-linker=hoisted`）。** 它会被上层的 `pnpm-workspace.yaml` 接管，把依赖装进仓根的 `node_modules`，并改写根锁文件。要给子目录的包做安装，先复制到仓库之外的中立目录。

## 真正危险的是恢复过程

`pnpm install --frozen-lockfile` 报「Already up to date」且 exit 0，**不可信**：

- 它只比对锁文件副本，不检查包是否在位。`--force` 在「已是最新」时同样是空操作。
- 污染会把某些包摊平成顶层实体目录；随后的安装把顶层换成指回虚拟目录的链接，而虚拟目录里是空壳。**测试与 lint 工具从此启动不了**，但命令全部报成功。
- 局部修补（删空壳目录再装）只对个别包有效，其余一律被「已是最新」挡回。

## 正确的恢复与验证

1. 还原锁文件（`git checkout -- pnpm-lock.yaml`）。
2. **删掉整个 `node_modules` 再按锁文件重建**——这是唯一可靠的办法。
3. 以「受影响的工具能真跑」为验收：测试跑一个目录、lint 跑一个文件、各包类型检查过。不要以安装命令的退出码为准。

## 判别污染

- `node_modules/.modules.yaml` 的 `prunedAt` 没有更新到当天，说明清理没有发生。
- 顶层出现大量同一秒级时间戳的实体目录。
- 依赖目录布局与 `.modules.yaml` 声明的不一致（声明 isolated，顶层却有数百个实体目录）。

## 溯源

- 来源容器：forge-dirs-unification
- 来源任务：5.5（取证任务在 worktree 内准备 bundle 时触发）
- 证据：`.forge/probes/forge-dirs-unification/4.2-web-r2/README.md` 的「环境污染申报」；依赖目录整体重建的处置记录
