# app-observability 测试树

旅程叙事（gen-journeys 产出，gen-contracts / gen-test-scripts 的输入）：

| journey | risk | 覆盖验收 | golden path |
|---|---|---|---|
| [packaged-error-four-route-capture](packaged-error-four-route-capture/journey.md) | High | 验收 1（四路注错取证）+ 6（IPC 埋点） | ✓ |
| [prompt-send-trace-id-full-chain](prompt-send-trace-id-full-chain/journey.md) | Medium | 验收 7（trace_id 全链） | |
| [gateway-fold-stack-preservation](gateway-fold-stack-preservation/journey.md) | Medium | 验收 2（折叠落栈） | |
| [log-retention-lifecycle](log-retention-lifecycle/journey.md) | High | 验收 3（滚动/清理/截断/降级） | |

表面声明：`surface_types: ["web"]`、`surface_keys: ["host"]`（宿主桌面应用 UI 面——派发任务语境推导，与仓内既有 journey 表面口径一致）。

取证纪律：四条旅程均为真实多进程/真实文件系统取证（run-tests 纪律），各 journey.md 内已逐条声明不可 fake 的边界。

## 既有漂移排除声明（本提案外基线红灯，不纳入本验收断言）

以下 5 条为本地复核在案的既有漂移（2026-10-18/19 会话绑定排查期间复核），先于本提案存在、与本提案改动面无因果，**旅程断言与验收编排均不纳入**：

1. scaffold ×3（既有基线红灯 ×3 条）
2. plugin-forge/loop e2e-baseline ×2（既有基线红灯 ×2 条）

任何 journeys 下游（contracts / test scripts / run-tests）不得为消除上述红灯而修改断言或被测代码。
