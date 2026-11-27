---
title: expert-squad experts 服务 cwd 锚：桌面宿主 project 层失效与 worktree/user 层路径事实
summary: >-
  expert-squad experts 服务锚 process.cwd()：DSH Desktop 宿主（cwd=应用目录）下 project 层恒
  null；worktree .dsh 不被扫描（解析回主检出根）；user 层=harness\experts（不带
  .dsh）。专家分发载体须走插件内置层。
keywords:
  - expert-squad
  - experts服务
  - process.cwd
  - 桌面宿主
  - project层
  - worktree
  - user层
  - DSH_HOME
  - 热刷新
id: expert-squad-experts-cwd-project-worktree-user
status: confirmed
version_ts: '2026-11-22T18:55:22.708Z'
updated: '2026-11-22T18:55:22.708Z'
type: pitfalls
procedure: true
candidate_of: forge
confirmed_at: '2026-11-23T16:17:59.175Z'
---
## 事实（源码定谳）

- expert-squad `experts` 服务与 tool 面共用 cwd registry：`toolRegistry = await registryFor(process.cwd())`（host/index.ts）。注释自认假设「dsh-forge 宿主 = 单工作区进程」。
- DSH Desktop 宿主 process.cwd() = 应用安装目录 → project 层（findProjectRoot 向上找 .git）解析 null → **project 层在桌面宿主结构性失效**；user 层 = $DSH_HOME/experts（注意：DSH_HOME=harness 时是 `harness\experts`，不带 `.dsh` 段）。
- worktree 内 `.dsh/experts` 永不被扫描：resolveProjectRootFor 对 worktree（.git 为文件）解析回主检出根——裁决「专家档案落主检出，不随 worktree 生灭」。
- 桌面宿主 watcher 热刷新（chokidar 通道）疑似不可靠：boot 后新建目录/复制文件后未观察到换代生效（diag 面不可见无法定谳到环节）；delegate_expert 在该宿主对任何专家崩 `Cannot read properties of undefined (reading 'maxDepth')`（含未动过的内置档案，独立缺陷未定位）。

## 规避

- 不要用 project/user 层做专家引导或分发载体——插件内置层（experts/ + registerRoot）不依赖 cwd 解析，是唯一跨宿主形态稳定的层（expert-builtin-redistribution 的正解）。
- 桌面宿主上验专家池：改档案后重启进程比依赖热刷新可靠。
- 诊断 experts 服务问题时先确认宿主形态（web/desktop）——同一插件行为面不同。

## 来源

容器 expert-builtin-redistribution t-ac2 处置五轮探测（2026-11-23）。
