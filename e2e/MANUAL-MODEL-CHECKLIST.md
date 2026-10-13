# 真实模型人工清单（去模型化边界——worker-exec-evidence-replay SC5）

自动化套件零真实模型调用（SC4）。知识召回等语义类验证与录制生产者按需人工运行，
不进任何自动提交门。统一门控：`DSH_FORGE_DOGFOOD_RECORD=1`。

| 项 | 载体 | 触发命令（前置：`pnpm -C apps/web build:vite` + host `tsc -b`） | 何时跑 |
|---|---|---|---|
| SC-M2 派发链重录（录制生产者） | `e2e/specs/m2/dogfood-sc-m2.spec.ts` | `DSH_FORGE_DOGFOOD_RECORD=1 pnpm exec playwright test -c e2e/playwright.config.ts m2/dogfood-sc-m2` | 夹具漂移/协议演进时随跑重录（产出 `e2e/fixtures/m2/dogfood-dispatch-chain.jsonl`） |
| SC-M3 自举走查（真实 dispatchTask 四分支） | `e2e/specs/m3/dogfood-sc-m3.spec.ts` | `DSH_FORGE_DOGFOOD_RECORD=1 pnpm exec playwright test -c e2e/playwright.config.ts m3/dogfood-sc-m3` | M 级协议演进抽验；B/D 层回放化承接后退役 |
| 会话工作台冒烟（真实往返 UI 走查） | `e2e/specs/p1mvp/session-workbench.spec.ts` 冒烟 | `DSH_FORGE_DOGFOOD_RECORD=1 pnpm exec playwright test -c e2e/playwright.config.ts p1mvp/session-workbench` | 会话 UI 大版本抽验；转录播种回放面承接后退役 |
| 知识召回语义（flywheel / krf） | `e2e/specs/flywheel.spec.ts`、`e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts` | 同上替换路径 | 语义回归人工抽验（永久人工面——不自动化，提案边界裁决） |

凭据前置：`~/.dsh/.credentials.yaml` 在场（隔离 DSH_HOME 播种，模型 = `e2e/support/dogfood.ts` 缺省低成本面）。
