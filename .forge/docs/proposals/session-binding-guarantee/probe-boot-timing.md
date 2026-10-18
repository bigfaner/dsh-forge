# 前置核销 #1：boot 时序探针报告（wrap 安装 vs 官方首个 create）

- 日期：2026-10-17（真机取证，dev electron + 隔离 userData）
- 判定对象：forge 插件 apply 期（`plugin.ts` `clientCtx.get('sessions')` 同点位，即 `installSessionCreateWrap` 未来安装点）与官方 boot 自动流首个 `sessions.create`（restoreSelection 链）的先后。

## 方法

1. 真机启动（`launchElectron` 形态：`DSH_FORGE_DEV_PROFILE=dev` + 隔离 `DSH_FORGE_USER_DATA`，与 e2e 就绪链同纪律）。
2. `addInitScript` 挂 `window.fetch` 记录器（全量留痕 `POST`/URL/body 头 400 字节，页内时钟 `Date.now()`）。
3. **reload 重放 boot**——与冷 boot 走同一条页面 boot 链（injections → 模块装载 → 插件 apply → watchNavigation reconcile → restoreSelection）。
4. 基准时刻 = `__DSH_FORGE_CLIENT__.activatedAt`（插件 apply 期 `Date.now()`，与 wrap 安装点同一 apply 帧）。

## 取证结果

两轮独立 boot 重放（进程内两个 boot 帧），覆盖 restoreSelection 两条 create 径：

| 帧 | 基准（apply 期 activatedAt） | 首个 `session/create` RPC | 时差 | 径（body 判读） |
|---|---|---|---|---|
| 重放 A | 1792250191229 | 1792250191331 | **apply 早 +102ms** | `{workspaceId}` 纯新建（reuseOrCreateBlank 无既有 blank → `create({workspaceId})`） |
| 重放 B | 1792250261533 | 1792250261642 | **apply 早 +109ms** | 同上 |
| 重放 C（清存储变体） | 1792250262577 | 1792250262672 | **apply 早 +95ms** | `{workspaceId, sessionId}` reuseBlank 采纳径 |

原始留痕：`logs/session-binding-guarantee/1.1/001-boot-timing/boot-timing-result.json`（full RPC log + analysis）。

## 源码锚（官方包核销）

- `dsh-client-ui-workspace/lib/client.js:894-924` `watchNavigation`：restoreSelection 只在 `workspaces.list` 与 `sessions.list` 双快照 `phase === "ready"` 后触发一次（订阅 reconcile）——boot create 属快照就绪后的异步流，不与插件 apply 竞争同一同步帧。
- `client.js:808/812/818`：boot 链 create 全部经 `this.sessions.create(...)` **调用期属性查找**（`reuseOrCreateBlank` / `reuseBlank`）——apply 期已完成属性替换即可全命中。
- `client.js:925-948` `restoreSelection`：saved 采纳（replaceMain）/ reuseBlank / connectWorkspace 三径，均晚于双快照 ready。

## 判定

**PASS——apply 期安装的 wrap 恒先于官方 boot 首个 create 就位（实测余量 +95~+109ms）。** 三条路径互证：

1. apply 等 `sessions` inject face 在场才跑（安装点与服务可用点同步，无反向窗口）；
2. restoreSelection create 属双快照 ready 后异步流，实测恒晚于 apply 帧百毫秒刻度；
3. 即便发生意外逃逸，逃逸会话由 host guard 首条消息重路由兜底（正确性层，体验损失非正确性损失）——用户动作触发的 create（workspace pick / New Session）余量更大（激活百毫秒 vs 交互秒级）。

前置核销 #1 闭环。
