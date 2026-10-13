---
name: gen-test-scripts
description: 从 Contract 规格生成可执行测试脚本——逐 Journey 测试文件带 @feature 标签，每 Outcome 一个测试外加一条 happy-path 冒烟测试，按表面数量分区输出。
---

# 生成测试脚本（gen-test-scripts）

测试按 Journey 生成，不按接口类型。每步的 Contract 定义断言；语义描述符在此落成
具体匹配器，并以事实表为据。

## 前置条件

| 工件 | 缺失时 |
|---|---|
| `testing/<journey>/contracts/` 内 ≥1 份 Contract 文件 | 先跑 `gen-contracts` |
| Contract 评审报告 `testing/<journey>/.eval-contract-report.md` 全部达标 | 先跑 `eval --type contract` —— **阻塞项** |

## State-Layer Discipline (boundary)

测试脚本是仓库代码工件——**不**经 `upsertFeatureDoc` 注册，**不是**任务行。其管线
位置由 `test-gen-scripts` / `test-run` 任务类型承载。

## 输出目录

- **多表面项目（≥2 表面）**：`tests/<surfaceKey>/<journey>/`
- **单表面项目**：`tests/<journey>/`（无 surface-key 层）

`<surfaceKey>` 是用户自定义键（如 `backend`），**绝不是**类型（`api`）。无暂存区——
测试直接落最终位置；生命周期基于标签。

## 工作流

1. **装载约定（表面优先）**——逐探测表面读
   `docs/conventions/testing/{surface}/core.md`；不装载旧式扁平框架优先文件（标记
   待再生）。从 `core.md` 读断言偏好表解析目标框架；否则从既有测试文件探测；仍含糊
   → 问（交互式）或从简报 + 事实表推导并记录选择（任务语境）。绝不静默取缺省。
2. **代码侦察**——刷新事实表（`.forge/fact-table.json`）：框架模式（runner、imports、
   build tags）与领域地面真值（入口、处理器、配置）。逐条语义描述符对照事实解析并
   引用来源。
3. **逐 Journey 路由决策**——有 Contract → Contract 路径。无 Contract → 报错：
   先跑 `gen-contracts`（与前置表一致）。
4. **锚点交叉校验**（Contract 路径）——把 Contract frontmatter 锚点与事实表对照；
   手册是权威：手册与锚点一致而代码不同 → 代码 bug 报告；手册与锚点不同 → 提议
   锚点修复（展示 diff）——交互式语境获明确批准才写入；派发语境 diff 呈报于任务
   输出，写入留给人工或 fix 链。无手册 → 降级模式，用事实表推断并附
   提示。绝不自动裁决低置信或无法核验的匹配——呈报。输出表面覆盖报告。
5. **生成测试**——每 Contract 步一份测试文件，每 Outcome 一个测试函数：按 Contract
   断言 Output（已解析匹配器）与 State 变化；带回链 Contract 的溯源注释；经临时
   目录/框架等价物隔离。装载该表面类型的逐类型生成规则（来自测试约定）；共享原则
   恒适用：隔离、确定性、超时保护、幂等、资源清理。每个测试自持其世界——不依赖
   真实仓库状态、git 状态或工作区注册表。
   - **@feature 标签强制**在每份生成文件上，用约定的标签语法；缺 Tags 节 → 问
     格式（或从简报的约定引用）。
   - **测试类型命名**按表面：cli/tui/api → "functional" 术语；web/mobile →
     "e2e"；标签 `@cli-functional` / `@tui-functional` / `@api-functional` /
     `@web-e2e` / `@mobile-e2e`。绝不把非 web/mobile 测试标成 "e2e"。
   - **Journey 冒烟测试**——每 Journey 恰一条：完整 happy path 依序执行，状态逐步
     传递，断言 success-Outcome 输出，跨全部步骤校验不变式。仅 happy path。
   - **无硬编码密钥**——敏感字段用环境变量占位。
   - 每次调用一条 Journey；多条 Journey 顺序处理。
6. **编译门**——逐框架做语法/import 校验（`gofmt -e` / `node --check` /
   `tsc --noEmit` / `py_compile`），再跑仓库编译配方（如 `just compile`）或框架
   等价物。失败回喂错误重新生成——每文件至多 1 次自动重试（语法）/ 3 次（编译）。
   耗尽 → 文件标 `// GEN-FAILED: <summary>` 并继续；gen-failed 文件留检，绝不删除。
7. **覆盖自检**——逐表面类型：数 Journey（读 `testing/*/journey.md` frontmatter）
   对照已生成的测试脚本集。任一缺口 → 带缺口清单报
   FAIL；绝不带缺口静默继续。
