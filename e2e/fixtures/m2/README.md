# M2 录制夹具（5.2 回放消费面）

`dogfood-dispatch-chain.jsonl` —— SC-M2 派发链 dogfood 录制（5.1 JSONL v1 格式；三源合并 =
forge.db 审计追加序 + 会话文件 dispatchPrompt 全文 + 主侧 tasks-changed 事件记账）。
**当前载荷 = M3 形态重录（2026-10-08，5.3 drift #1/#3 收口）**——addTask source 容器双轨 /
TaskSnapshot source+mode（featureId 退役）/ 简报全文源 = worker 会话首条 user/message
（dispatchTask 零进 dispatcher 上下文）；verb 载荷绑定录制期 projectId，回放消费面经同机构造
hand 夹具（b5-anchors 头注）。

## 运行记录（2026-10-08 · M3 形态重录——当前夹具）

- **生产者**：`e2e/specs/m2/dogfood-sc-m2.spec.ts`（dispatcher prompt = run-tasks 技能
  dispatchTask 循环；3.1 中断 = harness 以派发会话身份预领[零执行零结算]——确定性注入，
  模型依从面退役）。
- **收敛**：全任务终态 192s（套件 3.4m）；verb=14 observed=14 event=15；审计链 = 7 claim
  （3.1 预领 + 重入、3.2 harness）+ 6 submit（含 blocked→fix）+ 1 addTask（fix 链——本轮由
  dispatcher 按 run-tasks 技能 fix 链协议承接，与 worker 顺手建两径均可断言）。
- **断言全绿**：AC1–AC4 全过（M2 5.4 判据零改动——drift #1/#3 收口不改判据）。

## 运行记录（2026-10-07 · 首录——M2 形态历史）

- **生产者**：`e2e/specs/m2/dogfood-sc-m2.spec.ts`（真实模型 dogfood——Hard Rule：唯一真实模型依赖面）。
- **模型面**：zai-coding-cn / glm-5.3-flash（`e2e/support/dogfood.ts` 缺省；凭据经隔离 DSH_HOME 播种）。
- **场景**：受控初态四任务直种（相位号 localId——1.1 成功径 / 2.1 fix 链 / 3.1 中断恢复 / 3.2 harness 中途结算占位）。
- **收敛**：全任务终态 444s（套件 7.6m）；verb=14 observed=14 event=15；审计链 = 7 claim（含 reclaimed 重入与 harness 领取）+ 6 submit（含 blocked→fix）+ 1 addTask（fix 链单事务）。
- **断言全绿**：AC1 一条不间断（claim digest / 派发≠执行会话 / gate·files·commit 真实 git）；AC2 fix 链（blocked reason → add+auto-block 同事务相邻 → fix 完成 → auto-restore 边不删 → 二轮成功）；AC3 中断恢复（首领与重入之间零 submit / reclaimed from-to 空 / digest 新值 / 3.2 结算落窗内）；AC4 夹具完整性（claim 全文 ≥200、reclaimed observed、restored 清单、事件全量）。

## 环境备忘（S8 口径 + 本次三处运行期坑）

1. **真实 node 路径绕 harness node shim（S8 spike 实证）**：harness 会话的 `node`/`pnpm` 若为
   `…\dsh-desktop\harness\.desktop-bin\*.cmd` shim，其 `node.cmd` 会 `set ELECTRON_RUN_AS_NODE=1` ——
   继承该变量的 electron 以 Node 模式启动，playwright 报 `bad option: --remote-debugging-port`。
   规避 = 用真实 node 直调 playwright CLI（`& 'D:\developer\nodejs\node.exe' …\playwright\cli.js test -c …`）；
   本仓 e2e 会话 PATH 首位即真实 node（`which node` 自证）时无需额外动作。
2. **firstWindow 30s 紧预算**：`bootDshHost`（child spawn + profile 装配）先于首窗，内存受限环境可越限——
   `launchHost({ timeouts: { firstWindow: 120_000, … } })`（本 spec 已放宽；其余 specs 缺省不变）。
3. **DTO 显式 undefined 值炸 tool 输出**：agent tool 返回体经 dsh harness lossless JSON 校验，任何属性
   显式 undefined 即整结果被拒（「value is not lossless JSON」）——core `toTaskSnapshot`/`toTaskRecordEntry`
   已改「缺省=键缺席」形态（query.test.ts AC-lossless 锚）。同型 `?? undefined` 仍在 features/proposals
   小域 builder（RPC 面 OK；proposals 两 tool 真实模型调用前须同样收口）。
4. **夹具 justfile 钉 powershell**：just 缺省经 msys sh.exe 执行配方，受限 agent 会话可撞沙箱命名对象
   边界（`NtCreateDirectoryObject 0xC0000022`，会话级非确定）——`set shell := ["powershell", "-NoProfile", "-Command"]`
   消除该向量（git.exe 实测六会话稳）。
5. **重跑**：`DSH_FORGE_E2E_SKIP_WEB_BUILD=1 pnpm exec playwright test -c e2e/playwright.config.ts m2/dogfood-sc-m2`
   （前置 `pnpm -C apps/web build:vite` + host `tsc -b`；跑前 tasklist 查 electron 残留——单实例纪律）。
6. **走查期产品缺陷（重录首跑实证，5.3 收口）**：dispatchPrompt 任务规格缺席（worker 三路无定义
   可读 → 全员 blocked）——任务规格内嵌修复与 flash 模型依从性备忘详见
   `e2e/fixtures/m3/README.md`（同门记录）。
