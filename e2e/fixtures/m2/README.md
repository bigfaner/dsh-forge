# M2 录制夹具（5.2 回放消费面）

`dogfood-dispatch-chain.jsonl` —— SC-M2 派发链 dogfood 首录（5.1 JSONL v1 格式；三源合并 =
forge.db 审计追加序 + 会话文件 dispatchPrompt 全文 + 主侧 tasks-changed 事件记账）。

## 运行记录（2026-10-07）

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
