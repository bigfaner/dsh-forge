# Windows commit 内存耗尽：诊断与防复发

> 适用范围：本机（Windows 桌面宿主）及所有 dsh-forge 派发 worker 的原生进程崩溃判读。
> 建立时点：2026-10-16，bug 3e0426a0 排查中实证（fix-3 build 崩溃 / runner 崩溃 / vitest 崩溃三案同根）。

## 现象与判读

**任何进程**的原生内存分配失败（症状族：exit code `3221226505`（0xC0000409）、`CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`（堆远未达上限时）、PowerShell `0x800705AF`、模块自动加载失败、`Windows Job runner exited … before proving its managed range empty`）——**先查 commit charge，再定位具体进程**：

```powershell
$os = Get-CimInstance Win32_OperatingSystem
"Commit: $([math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1KB)) MB / Limit: $([math]::Round($os.TotalVirtualMemorySize/1KB)) MB"
```

Commit ≥ 95% limit ⇒ 判定为环境级资源耗尽：崩溃点落在哪个进程（vite/PowerShell/vitest/tsc）**纯看运气**，不是该进程自身的缺陷。此时对该进程做任何「配方/配置/代码」排查都是误诊。

## 已实证的泄漏源：派发 worker 的 watch 子进程

worker 会话结束（含 interrupted）后，其启动的 `--watch` 形态子进程存活并持续占用 commit：

- `vite build --watch`（实测 2.1GB）
- `tsc -b --watch`（实测 1.4GB）

识别与清理：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='tsc.exe'" |
  Where-Object { $_.CommandLine -match '--watch' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 防复发（分层）

| 层 | 措施 | 状态 |
|---|---|---|
| 纪律（即刻生效） | 任务执行/质量门一律 run-once 命令，**禁用 `--watch` 形态**；worker 简报携带本条 | 本规范即正本 |
| 弹性（系统设置） | pagefile 由固定 4.8GB 改为系统管理或扩大上限（如初始 8GB / 上限 32GB）——commit limit 获得缓冲，单泄漏不再瞬间全局崩 | 暂缓（用户裁决 2026-10-16：记录不实施） |
| 根治（工程改进） | 派发 worker 进程树挂 Windows Job Object（`KILL_ON_JOB_CLOSE`）——worker 无论正常结算还是中断，整树随之回收 | 已入 `dispatch-loop-hardening` 提案改进 4（用户裁决 2026-10-16：进提案） |
| 可观测 | 原生崩溃报错文案提示检查 commit charge（宿主面改进，待立项） | 待立项 |

## 判例记录

- 2026-10-16：`pnpm -C apps/web build:vite` 3 连崩（0xC0000409，dist 清残）被派发为 fix-3「构建配方脆弱性修复」——实证为 commit 触顶误诊，构建配方无病；清两个孤儿 watch 后 commit 由 36.7 降至 32.9 GB。fix-3 随之改向（环境验收替代配方修复）。
