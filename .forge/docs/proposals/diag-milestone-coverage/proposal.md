# 提案：诊断埋点覆盖补齐（成功里程碑 info / fail-soft 吞没点核对 / 可查性面）

> 飞轮派生：parent = diag-face-consolidation（该提案完成通道统一后本提案才有意义——补点落进统一域）。
> 缺口事实源：ops-observer 全面梳理报告（2026-11-01）。

## 背景

diag-face-consolidation 完成后，存量诊断站点进统一 `diag/log` 域，但覆盖面缺口仍在：

- **成功里程碑缺 info**：settle 成功侧（review-wave 标记落成 `dispatch-core/settle.ts:114-149`）
  只有失败 warn；run-dag-tasks 派发成功无 info（仅失败 warn `:480-542`）；
  expert-squad `setEnabled` 成功落盘无 info（仅失败 `index.ts:365`）。
- **fail-soft 吞没点覆盖不成对**：`plugin-forge/loop/e2e-baseline.ts:141,210,213`、
  `core/forge/workspace/discovery.ts:106,115,126`、`core/forge/project-service.ts:250,582,637,781,860,891`、
  `git-worktree/rpc-service.ts:170,210,314,396,493,513,579`——吞没处无对应 warn 站点
  或 emit 缝未核实接线。
- **可查性**：diag JSONL（`{userData}/logs/app-*.jsonl`）无等价于 harness.log
  showLog 的「一键打开」面（harness-channel.ts:9,47 先例）。
- **自证**：appender counters（丢弃/写失败，appender.ts:122,139）只在内存，无周期
  自证输出。
- **job-tree 引导期缝时序缺口**：worker 引导期失败走 console 兜底（经 child-stdio
  落盘），typed `event=job-tree-queue` 行该场景不可达（diag-face-consolidation T6
  取证发现，源 `spawn/job-tree.ts` sink 接线时序）。
- **expert-squad onError 分级**：watch 异常经 `onError: (error) => diag("warn", …)`
  映射 level=warn——错误径降级，需复核分级口径（源 `expert-squad/src/index.ts` 装配处）。

## 方案

1. **成功里程碑 info 补点**：settle 完成、dispatch 行提交成功、expert-squad
   setEnabled 落盘成功——各补一条 info 埋点（event 功能域前缀，payload 携带
   slug/localId 等可得字段）。
2. **吞没点逐点核对与分级补点**：上述四处点名清单逐点核对——有注释化 fail-soft
   理由且影响面为零的记豁免并**补 debug 级 emit**（不静默）；其余补 warn 站点。
   debug 级按日志级别按需开启（默认关闭，诊断时打开）。
3. **debug 级别支持**：`DiagLevel` 扩 `debug`（contracts 单源），diag 发射面与
   appender 增按级别过滤开关（默认 info 起，debug 按需开启）。
4. **全量吞没审计**：206 处 `} catch {` 空吞按包扫描，产出「豁免（有理由）/补点」
   二分台账，落 `proposals/diag-milestone-coverage/audit.md`。
5. **diag JSONL 打开面**：复用 harness.log showLog 同缝（harness-channel +
   preload-api 先例），与 harness.log 同位入口指向 logs 目录。
6. **appender counters 周期自证**：定时（如每 5 分钟或退出时）把 writeFailures /
   queueDropped 计数以 info 落 diag 域（仅非零时发，控噪）。
7. **job-tree 引导期可达性**：核对 sink 接线时序，使 worker 引导期失败也能发 typed
   diag 行（或记录 console 兜底为终态豁免口径）。
8. **expert-squad onError 分级复核**：watch 异常径定级（warn → error 或维持并记豁免）。

## 改动影响范围

| 触点 | 改动 |
| --- | --- |
| `packages/plugin-forge/src/dispatch-core/settle.ts` | 成功侧 info 埋点 |
| `packages/plugin-forge/src/commands/run-dag-tasks.ts` | 派发成功 info 埋点 |
| `packages/plugins/expert-squad/src/index.ts` | setEnabled 成功 info 埋点 |
| `packages/plugin-forge/src/loop/e2e-baseline.ts`、`packages/core/src/forge/workspace/discovery.ts`、`project-service.ts`、`packages/plugins/git-worktree/src/rpc-service.ts` | 吞没点逐点核对 + 豁免点补 debug / 其余补 warn |
| `packages/contracts/src/diag.ts`、diag 发射面（core/plugin-forge/插件兜底） | `DiagLevel` 扩 `debug` |
| `apps/host/src/telemetry/appender.ts` | 级别过滤开关（默认 info 起）+ counters 周期自证 |
| 全包 catch 扫描 | 审计台账（文档产物） |
| `apps/host`（harness-channel / preload-api） | diag 日志打开面（harness.log 同位入口） |
| `packages/plugin-forge/src/spawn/job-tree.ts` | 引导期 typed 事件可达性核对 |
| `packages/plugins/expert-squad/src/index.ts`（装配处 onError） | watch 异常分级复核 |

复用核销：全部走 `diag/log` 统一域 + 类型化 emit（diag-face-consolidation 落地
的类型单源）；打开面复用 harness-channel showLog 同缝先例。零新机制。

## 验收

1. 三个成功里程碑在 dev 实机可从 `{userData}/logs/app-*.jsonl` 回放 info 行。
2. 点名吞没清单逐点有结论（豁免点带 debug emit、其余补 warn），audit.md 台账落档。
3. 诊断日志打开面在 dev 实机可用（打开即见 app-*.jsonl 所在目录/文件）。
4. counters 非零时可从 diag 域观察到自证行。
5. debug 级别门：默认关闭时 debug 行不落盘，开启后豁免点 debug 行可回放。
6. `pnpm lint:types` 通过；定向测试全绿；插件版本随改动 bump。

## 指标对比附录

| 指标 | 基线（注册时点采样） | 目标 |
| --- | --- | --- |
| 成功里程碑 info 埋点（settle/dispatch/setEnabled） | 0 | 3 |
| 点名吞没点未决数 | 20 处（4 文件域） | 0（豁免带 debug 或补点） |
| debug 级别支持（DiagLevel / 级别门） | 无 | 有（默认关，按需开） |
| diag JSONL 打开面 | 无 | 有 |
| counters 自证输出 | 无 | 非零即报 |

## 待用户裁决清单（裁决台账）

| 裁决点 | 裁决 |
| --- | --- |
| 提案设立 | 用户裁决设立（2026-11-01，问「覆盖全面了吗」后） |
| 吞没点逐点豁免口径 | 注释理由 + 零影响即豁免，但豁免点仍补 debug 级 emit（按日志级别按需开启，默认关闭）；其余一律补 warn（2026-11-01 两轮裁决） |
| 打开面入口位置 | harness.log 同位入口（2026-11-01）：复用 showLog 同缝同位置，与既有「打开日志」心智一致，不设第二入口 |

## 意图推断

enhancement——可观测性覆盖面补齐（新增埋点与查询便利面），不改变业务行为。
执行时序：待 parent（diag-face-consolidation）落地后启动。
