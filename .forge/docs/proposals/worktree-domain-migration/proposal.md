# 提案：worktree 域装配缝核迁插件包——host 回归纯 wiring

- slug：`worktree-domain-migration`
- 提出：2026-10-25（binding-derivation 评审 P-4 架构债裁决立项）
- 状态：accepted（本提案为纯 refactor，基线经评审实证，用户裁决直接立项）

## 1. 需求界定

AGENTS 1.3「装配缝归属插件域」：git-worktree 插件的编排逻辑与官方机械
缝合面应属插件包，宿主只做 wiring。现状 `apps/host/src/ipc/worktree-rpc.ts`
（647 行）持有域本体——`createWorktreeRpcService`（10 方法：list/create/
seal 推导/select/resolve、留痕惰性补写 memo、workspace 幂等创建、目录预
创建与 ACL、noGitCache）+ 6 个官方机械 Face + `interceptSessionSends`
（prompt/updateQueue wrap）——插件只能在 dsh-forge 宿主上工作，可移植性
承诺落空，且 binding-derivation 期间漂移仍在扩大。

根本需求：**域本体迁入 git-worktree 插件包，host 只剩注入与注册两个动作**。
非备选：继续在 host ipc 层加域逻辑（漂移扩大，否决）。

意图推断：refactor（零行为变化的结构迁移）。

## 2. 方案

```
packages/plugins/git-worktree/src/
  rpc-service.ts          ← createWorktreeRpcService + 6 Faces + 缓存/工具函数（自 host 迁入）
  session-send-wrap.ts    ← interceptSessionSends（prompt/updateQueue wrap 编排）
  rpc-service.test.ts     ← worktree-rpc.test.ts 域用例随迁

apps/host/src/ipc/worktree-rpc.ts   → 收敛为纯 wiring（registerWorktreeChannels + deps 组装），
                                      或并入 boot/child.ts 注入点后删除
apps/host/src/boot/child.ts         → servicesFace 取官方服务对象，注入插件导出的工厂
```

边界裁决：

- proxy 中继硬门（`forge:proxy/session-create` guardedCreate）留 host
  （移动端隧道 wiring 属跨进程汇聚职责），域动作经插件 service 调用；
- session/created 留痕监听：ctx.on 装配留 host，append 编排随插件域走；
- contracts 零触及（DTO/通道契约已共享单源）；
- 依赖方向红线：插件包禁止 import `apps/host/*`，官方服务一律经 Face 注入
  （现有 6 个 Face 即现成接缝）。

## 3. 改动影响范围

| 文件 | 动作 |
|---|---|
| `packages/plugins/git-worktree/src/rpc-service.ts` | 新增（域本体自 host 迁入） |
| `packages/plugins/git-worktree/src/session-send-wrap.ts` | 新增（wrap 编排迁入） |
| `packages/plugins/git-worktree/src/rpc-service.test.ts` | 新增（worktree-rpc.test.ts 域用例随迁） |
| `packages/plugins/git-worktree/src/index.ts` | 导出面扩展 |
| `packages/plugins/git-worktree/package.json` | 0.3.0 → 0.4.0（minor，随改动同 commit） |
| `apps/host/src/ipc/worktree-rpc.ts` | 收敛为纯 wiring 或删除并入 child.ts |
| `apps/host/src/boot/child.ts` | 注入点重构（官方服务对象 → 插件工厂 deps） |
| `apps/host/src/ipc/worktree-rpc.test.ts` | 随域用例迁移后删除/残留 wiring 用例 |

复用核销：官方机械消费面（sessionController / workspaceRegistry /
Session.append / persistence）全部经既有 Face 契约注入，零新机制；
零行为变化——迁移前后对外通道契约（contracts）逐字节不变。

## 4. 非目标

- 不改任何对外契约（通道名/DTO/错误码不变）；
- 不动 proxy 隧道域 wiring 与 forge-stream 镜像；
- 路径归一三份平行实现统一不进本提案（binding-derivation 已登记候选）。

## 5. 验收

- 插件包禁止 import `apps/host/*`（grep 零命中）；
- host ipc/worktree-rpc.ts ≤ 纯 wiring（无域逻辑：无缓存/无 memo/无官方调用编排）；
- 对外契约零变化：contracts 目录 git diff 为空；通道行为由既有单测 + e2e
  三 spec（binding-derivation 1.9）复跑全绿佐证；
- `npx vitest run` 插件包与 host 相关面全绿；pnpm lint:types / lint:ox 通过；
- git-worktree 版本 0.4.0 与迁移同 commit 落。
