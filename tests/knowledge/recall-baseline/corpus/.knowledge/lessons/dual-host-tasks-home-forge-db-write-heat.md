---
title: 双宿主双库排查口径——tasksHome 三处分布，forge.db 写入热度判活跃库
summary: >-
  本仓常态双宿主并存（dev：进程 dsh-forge-dev、junction 装载 main dist；安装版：进程 dsh-forge、静态
  profile 检出）；tasksHome 三处分布（安装版 forge-workspaces / dev userdata.dev 测试库 /
  AppData\Roaming 历史位）。排查落位先辨宿主形态，活跃库以 forge.db 写入热度反查，不凭目录存在或历史时间线推断。
keywords:
  - 双宿主
  - tasksHome
  - forge.db
  - 写入热度
  - 落位排查
  - userdata.dev
domainPath: .knowledge/lessons/
来源容器: prompt-scoping-and-desc-trim
来源任务: T3 死锁排查弯路记录（postmortem §排查弯路）
bug id: 无
id: dual-host-tasks-home-forge-db-write-heat
status: unconfirmed
type: facts
version_ts: '2026-11-05T00:00:00.000Z'
---

# 双宿主双库排查口径

## 事实

- 双宿主并存：dev 形态（进程 `dsh-forge-dev`，junction → main dist，重启即载新检出）与安装版（进程 `dsh-forge`，静态 profile 检出，修复需另行同步该检出才生效）。
- tasksHome 三处分布：

| 位置 | 性质 |
|---|---|
| `D:\software\dsh-forge\data\forge-workspaces` | 安装版宿主库 |
| `apps/host/userdata.dev\forge-workspaces` | dev 测试宿主库（e2e 卷宗为正常产物，非脏残留） |
| `AppData\Roaming\dsh-forge` | 历史位（现行活跃库不在此） |

## 判别方法

- 活跃库判据 = `forge.db` 写入热度反查：哪个库的 forge.db 有近期写入，当前会话就在哪个库；目录存在 ≠ 活跃。
- 宿主形态先辨（进程名区分），再定库；两步都不省。

## 弯路判例（均已付出成本）

- `AppData\Roaming` 搜 task_logs 扑空——tasksHome 实在安装版库。
- 沿用 dev 宿主时间线推断本会话宿主形态——实际全程在安装版。
- `userdata.dev` 卷宗先误判「退役库/脏残留」，后澄清为测试宿主库正常产物，两次判断撤回。

## 适用条件

- 排查会话 / 任务库 / logs 落位问题时。

## 反例边界

- forge.db 写入热度是判据位；静态历史库不因存在而活跃，也不能据「某轮曾在该库见卷宗」推断当前活跃。

## 来源锚点

- `proposals/prompt-scoping-and-desc-trim/postmortem-t3-recurrence-deadlock.md` §关键事实链、§排查弯路。
