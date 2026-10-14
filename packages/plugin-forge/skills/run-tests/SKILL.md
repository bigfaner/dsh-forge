---
name: run-tests
description: 面向 `test-run` 任务的表面级测试编排——识别 surface，按序执行其 just 配方（dev、probe、逐旅程 test、teardown），并如实上报实测结果；绝不伪造结果，失败一律以 blocked 结算。
---

# 运行测试（Run Tests）

**核心原则**：这是一个编排器——识别 surface、按序执行其 just 配方、如实上报实测结果。surface 解析、服务生命周期、结果解析与上报都在这里完成——仅此而已。修复、重写测试、下判定属于别处（发起任务与 fix 链）。

**按需加载**：本技能的目录条目驻留在每个 worker 中，但其内容只在 `test-run` 任务真正执行测试时才应加载——非测试任务从不加载它。如果你手上没有 test-run 任务却在读这份文档，请把它放回去。

<HARD-GATE>
- 不修改测试脚本内容。
- 不跳过失败的测试，也不把失败报成通过——跑了什么就报什么。
- 不在执行过程中"修好"测试让它通过。测试脚本的 bug 可以上报；为了强行通过而改动断言或逻辑即属伪造。
- 同一编排周期内，probe 失败后不重试 probe、不重启 dev（任务层做出修复决定后的新一次调用属于新周期）。
- 以任务身份运行时（`type: test-run`）：任何失败都以 `submitTask result=blocked` 结算，并在 reason 中写明失败的旅程与用例——绝不带着已知失败提交 `success`。表面级失败不在此处内联修复；修复决定属于发起任务。
</HARD-GATE>

## 何时使用

- 认领了一个 `test-run` 任务（为某个容器做表面级执行），或
- 用户要求运行测试。

当 surface 没有测试配方、或没有可运行的旅程脚本时，明确声明后跳过——不要改跑别的。

## 判断点（按顺序）

1. **识别 surface**——任务简报 `SURFACE` 行（`key (type)` 形态）就取用；否则读 justfile 的 surface 分组。标量 surface 使用裸配方（`dev`、`probe`、`test`、`teardown`）；具名 surface 给每个配方加 `<surface-key>-` 前缀。两个来源都无法识别是**阻断性**错误，不可重试：连同恢复线索（任务上下文、justfile、surface 配置）一并上报并停止。
2. **发现旅程**——`tests/<journey>/`（单 surface）或 `tests/<surfaceKey>/<journey>/`（多 surface）。未发现任何旅程 → 上报旅程测试需要生成脚本并停止（阻断）。以任务身份被调用且未限定旅程范围 → 运行全部已发现的旅程。
3. **检查环境**——配方及其依赖存在且可运行。不就绪 → 以**可重试**中止（环境可被修复后重新调用本技能）；只上报诊断信息与修复建议——不自动修。
4. **执行序列**——完整生命周期 surface（web/api/mobile）：`dev` 一次 → `probe`（有界重试，约 3 次）→ 逐旅程 `just <prefix>test <journey>` → `teardown` 一次。简化 surface（cli/tui）：逐旅程循环 → `teardown`。每个旅程完成即记录其结果。teardown 是**强制的——即使前面步骤失败也必须执行**。
5. **上报**——每个旅程的合计（passed/failed/skipped）、每条失败附错误摘录作为证据、以及实际执行的序列。结果输出缺失或为空 → 如实说明并附运行器控制台输出；不得编造报告。

## 结算（以任务身份运行时）

按 submit-task 纪律结算：

- 全绿 → `submitTask result=success`，报告作为 summary。
- 任何失败 → `submitTask result=blocked`，reason 写明失败的旅程与用例；随后可按 fix 链协议派生修复任务（正本在 run-tasks 中）。

这里绝不允许为强行通过而编辑测试脚本——因此此处没有任何可供提交的改动。
