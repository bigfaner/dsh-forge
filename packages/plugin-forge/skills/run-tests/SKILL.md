---
name: run-tests
description: 面向 `test-run` 任务的表面级测试编排——识别 surface，按序执行工作区测试编排（dev、probe、逐旅程 test、teardown），并如实上报实测结果；绝不伪造结果，失败一律以 blocked 结算。
---

# 运行测试（Run Tests）

**核心原则**：这是一个编排器——识别 surface、按序执行工作区测试编排、如实上报实测结果。surface 解析、服务生命周期、结果解析与上报都在这里完成——仅此而已。修复、重写测试、下判定属于别处（发起任务与 fix 链）。

**按需加载**：这份文档只在执行 `test-run` 任务时适用——手上没有 test-run 任务却在读它，就把它放回去。

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

1. **识别 surface**——按测试表面判定纪律从仓库自身事实判定（正本：`docs/conventions/testing-surfaces.md`——判定来源按序探测、绝不猜）。全部来源零命中或互相矛盾且不可裁决 → **阻断性**错误，不可重试：连同探测证据一并上报并停止——不要自行编派 surface。
2. **发现旅程**——`tests/<journey>/`（单 surface）或 `tests/<surfaceKey>/<journey>/`（多 surface）；工具链不设 tests/ 目录时以工作区实际测试树为准（如 Playwright `testDir` 下的 journey spec）。未发现任何旅程 → 上报旅程测试需要生成脚本并停止（阻断）。以任务身份被调用且未限定旅程范围 → 运行全部已发现的旅程。
3. **检查环境**——测试命令及其依赖存在且可运行。不就绪 → 以**可重试**中止（环境可被修复后重新调用本技能）；只上报诊断信息与修复建议——不自动修。
4. **执行序列**——完整生命周期 surface（web/api/mobile）：dev 一次 → probe（有界重试，约 3 次）→ 逐旅程以 **run-once** 测试命令执行（命令按工作区实际工具链取用，如 `npx playwright test <journey>` / `npx vitest run <journey>`；一律 run-once，禁 `--watch` 形态）→ teardown 一次。简化 surface（cli/tui）：逐旅程循环 → teardown。每个旅程完成即记录其结果。teardown 是**强制的——即使前面步骤失败也必须执行**。
5. **上报**——每个旅程的合计（passed/failed/skipped）、每条失败附错误摘录作为证据、以及实际执行的序列。结果输出缺失或为空 → 如实说明并附运行器控制台输出；不得编造报告。

## 结算（以任务身份运行时）

按 submit-task 纪律结算：

- 全绿 → `submitTask result=success`，报告作为 summary。
- 任何失败 → `submitTask result=blocked`，reason 写明失败的旅程与用例；随后由主会话/循环处置层按 fix 链协议派生修复任务（协议正本：`docs/business-rules/task-pipeline.md` BIZ-task-003/014 + 处置注入模板 `src/triage/prompt.ts`）。

这里绝不允许为强行通过而编辑测试脚本——因此此处没有任何可供提交的改动。
