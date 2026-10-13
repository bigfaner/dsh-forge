# 真实模型人工清单（去模型化边界——worker-exec-evidence-replay SC5）

自动化套件零真实模型调用（SC4）。知识召回等语义类验证与录制生产者按需人工运行，
不进任何自动提交门。统一门控：`DSH_FORGE_DOGFOOD_RECORD=1`（未置位时这些 spec
在收集面留痕 skip，不发起任何模型调用）。

## 人工验证清单

| 项 | 载体 | 触发命令（前置：`pnpm -C apps/web build:vite` + host `tsc -b`） | 何时跑 |
|---|---|---|---|
| SC-M2 派发链重录（录制生产者） | `e2e/specs/m2/dogfood-sc-m2.spec.ts` | `DSH_FORGE_DOGFOOD_RECORD=1 pnpm exec playwright test -c e2e/playwright.config.ts m2/dogfood-sc-m2` | 夹具漂移/协议演进时随跑重录（产出 `e2e/fixtures/m2/dogfood-dispatch-chain.jsonl`） |
| SC-M3 自举走查（真实 dispatchTask 四分支） | `e2e/specs/m3/dogfood-sc-m3.spec.ts` | `DSH_FORGE_DOGFOOD_RECORD=1 pnpm exec playwright test -c e2e/playwright.config.ts m3/dogfood-sc-m3` | M 级协议演进抽验；B/D 层回放化承接后退役 |
| 会话工作台冒烟（真实往返 UI 走查） | `e2e/specs/p1mvp/session-workbench.spec.ts` 冒烟 | `DSH_FORGE_DOGFOOD_RECORD=1 pnpm exec playwright test -c e2e/playwright.config.ts p1mvp/session-workbench` | 会话 UI 大版本抽验；转录播种回放面承接后退役 |
| 知识召回语义（flywheel / krf） | `e2e/specs/flywheel.spec.ts`、`e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts` | 同上替换路径（flywheel 单套件：`… flywheel`；krf：`… p1mvp/knowledge-recall-flywheel`） | 语义回归人工抽验（**永久人工面**——不自动化，提案边界裁决） |

凭据前置：`~/.dsh/.credentials.yaml` 在场（隔离 DSH_HOME 播种，模型 = `e2e/support/dogfood.ts` 缺省低成本面）。

## 提交门核对（零真实模型项——2026-10-12 审计）

- **提交门**（`package.json`）：`lint`（ox/imports/tokens/selftest/tsc -b/test-types 六段）
  + `test`（vitest 全量）——无 e2e、无模型面。`test:e2e` 不在提交门。
- **自动 e2e 套件**（`pnpm test:e2e` 缺省运行面）：全部真实模型 spec 均带
  `DSH_FORGE_DOGFOOD_RECORD !== '1'` 留痕 skip 门——`m2/dogfood-sc-m2`（录制生产者）、
  `m3/dogfood-sc-m3`、`p1mvp/session-workbench` 冒烟、`flywheel.spec`、
  `p1mvp/knowledge-recall-flywheel`（含 Step2b/2c/4d 三 dogfood 子测试）。
  回放消费面（`dogfood-sc-m2-replay`、`session-workbench-replay`、`b5-anchors` 等）零模型。
- **核对结论**：提交门与自动套件清单内**零真实模型项**；唯一真实模型入口 = 本清单显式门控。

## 环境备忘（沿 e2e/fixtures/m3/README.md 同形制）

1. **真实 node 路径绕 harness node shim**：harness 会话的 `node`/`pnpm` 若为
   `…\.desktop-bin\*.cmd` shim，其 `node.cmd` 会 `set ELECTRON_RUN_AS_NODE=1`，playwright
   报 `bad option: --remote-debugging-port`——用真实 node 直调 playwright CLI。
2. **flash 模型对多分支指令依从不稳**：条件分支依从率 ~50-70%——人工走查按清单命令逐套件
   跑，不依赖模型对剧本的依从；链未出现时同题重发 ≤2 次（krf 观察窗契约）。
3. **长跑前置**：跑前查 commit charge（<10GB 时 vite/electron 随机崩）+ tasklist 查 electron
   残留（单实例纪律）+ `DSH_FORGE_E2E_SKIP_WEB_BUILD=1`（构建前置已另行完成时）。
