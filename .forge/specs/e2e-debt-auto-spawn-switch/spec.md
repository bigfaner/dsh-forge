# e2e 欠账任务自动派生改为默认关闭的插件配置开关

## 用户旅程

**根本需求界定**：task-loop 在 worker 以 `evidence_debt` 声明结算（实现 + 单测绿、缺真机 e2e 取证）时，当前无条件自动派生 `test-run` 型「e2e 补充验证」欠账任务。用户要求默认不自动添加；经裁决保留该能力但改为**插件 config 键控制，默认关**。

**意图推断**：enhancement——既有改进7 机制的触发面收窄为显式配置开启，非整体拆除。

**已裁决决策**（grilling 访谈实录）：

| 问题 | 裁决 |
|---|---|
| Q1 拆除范围 | 改为配置开关（保留自动派生能力，默认关） |
| Q2 欠账呈现 | 未开启时零播报（统一通知只发生在开启路径） |
| Q3 开关形态 | 插件 config 键，项目级（先例 `e2eBaselineGate` 同缝） |
| Q4 默认态 | 默认关 |
| Q5 播报语义 | 开关未开启时不播报欠账；开启时维持现行派生 + 通知 |
| Q6 tiers | pure-logic |

## 方案

- `ForgePluginConfig` 新增布尔键 `e2eDebtAutoSpawn`，**缺省 false**；经 preset yml plugin-forge 行 config 注入（与 `e2eBaselineGate` / `mode` 同装配缝，零新机械）。
- 开关透传链：`index.ts`（config 消费）→ `loop/driver.ts` → `dispatch-core`（`claimForDispatch` / `settleWorkerRun` 上下文）→ `createE2eDebtTask` 守卫。
- **false（缺省）**：success 结算携带 `evidenceDebt` 时零 `addTask`、结算通知零欠账播报——欠账事实仍留结算记录与 `evidenceDebtsTotal` 计数（记录侧不变）。
- **true**：维持现行行为——同容器自动派生 test-run 欠账任务（dependsOn 实现卡，fail-soft）+ 现行通知。
- `evidence_debt` 声明路径（`submit_task` 三参与 facets 结算门「真机证据或欠账二选一」）不动——缺省关闭下带 runtime facets 的任务仍可欠账结算，只是不再自动派生补验卡。

## 改动范围

file 粒度触点：

- `packages/plugin-forge/src/index.ts`——`ForgePluginConfig` 增 `e2eDebtAutoSpawn` 键，装配缝消费
- `packages/plugin-forge/src/loop/driver.ts`——开关透传至 dispatch-core 调用
- `packages/plugin-forge/src/dispatch-core/core.ts`——上下文增开关字段
- `packages/plugin-forge/src/dispatch-core/settle.ts`——`createE2eDebtTask` 调用点加守卫；关闭分支零派生零播报
- `packages/plugin-forge/src/dispatch-core/settle-e2e-debt.test.ts`——增开关两分支断言（开=派生+通知；关=零 addTask 零播报）
- `packages/plugin-forge/src/loop/driver.test.ts` / `plugin.test.ts`——透传与 config 消费断言随动
- `packages/plugin-forge/src/tools/submit-task.ts` 工具描述 + `tool-desc.test.ts`——「自动生成」文案改为「config 开关开启时自动生成」
- `packages/plugin-forge/skills/submit-task/SKILL.md`——同步开关语义
- `packages/plugin-forge/package.json`——minor bump（功能语义变更：缺省行为收窄）

复用核销：配置面复用 `ForgePluginConfig` / preset yml 插件行 config 装配缝（先例 `e2eBaselineGate`、`mode`），无自建配置机械；派生与 fail-soft 路径全量复用现行 `createE2eDebtTask`。

## tiers

`pure-logic`——纯逻辑分支收窄，单测基座承载（开关透传 / 开分支 / 关分支断言）。

## Goals / AC

### Goal 1：e2e 欠账自动派生由插件 config 键控制，缺省关闭

- AC1：`ForgePluginConfig` 新增布尔键 `e2eDebtAutoSpawn`，缺省 false，经 preset yml plugin-forge 行 config 注入生效
- AC2：`e2eDebtAutoSpawn` 缺省或为 false 时，success 结算携带 `evidenceDebt` 声明不派生任何任务，且结算通知不含欠账播报
- AC3：`e2eDebtAutoSpawn` 为 true 时，success 结算携带 `evidenceDebt` 声明自动生成同容器 test-run 欠账任务（dependsOn 实现卡，fail-soft），行为与通知与现行一致
- AC4：开关任意态下，`evidence_debt` 声明路径（`submit_task` 三参）与 `evidenceDebtsTotal` 计数语义不变——带 runtime facets 的任务缺真机取证仍可欠账结算
- AC5：`submit_task` 工具描述与 submit-task SKILL.md 文案反映「自动派生仅在 config 开关开启时发生」
