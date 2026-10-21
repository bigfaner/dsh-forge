# 前置核销 #2：真机 wrap 探针报告（sessions 可写 + wrap 生效 + createFailed toast 链）

- 日期：2026-10-17（真机端到端取证——外部依赖装配面结算门，非 fake）
- 环境：dev electron 真机、隔离 userData、注册真实 git 项目（临时 `git init` 仓库，`forge:projects/register` 直注）。

## 方法（探针不落源码）

对构建产物 `apps/web/dist/forge-client.js` 打**临时补丁**：在插件 apply 帧 `l=s.get(`sessions`)` 处包一层捕获器，将 apply 期到手的 `sessions` 服务实例暴露为 `__DSH_PROBE__.sessions`。补丁只落产物、探针后逐字节恢复原产物（备份留档 `logs/.../002-real-wrap/forge-client.js.bak`），不进 git。此后在页面同 realm 对该实例做属性替换 wrap——**安装点即未来 `installSessionCreateWrap` 的真实安装点（插件 apply 期）**。

## 取证结果（三轮全绿，末轮留痕 `logs/.../002-real-wrap/wrap-probe-result.json`）

**E1 实例可写性**：

- 到手实例 `constructor.name === "ClientSessions"`（dsh-api-session-controller 正主，`rootCtx.reflect.provide("sessions")` 的单例）；
- `Object.isFrozen === false`；`create` 在原型（实例无 own `create`——属性替换以 own property 影子遮蔽原型方法，官方调用期查找全命中）；
- 实例可写探针（own property 写/删）通过。

**E2 wrap 生效（官方入口真机命中）**：

- 页面同 realm 对实例装记录型 wrap（属性替换 + 透传 original）；
- 官方 `session.new` 快捷键（Ctrl+Alt+N，`installWorkspaceShortcuts` 注册）触发官方 `startSession → openWorkspace → connectWorkspace → reuseOrCreateBlank` 链；
- **wrapper 被命中**：记录到 1 次调用，opts = `{workspaceId, sessionId}`（既有 blank 采纳——reuseBlank 带 sessionId 的 adopt 径真实形态，与 #3 裁决的直通对象一致）；original 透传成功，工作台进入 session 相位，分支 chip（`master · dsh-sbg-gitproj-*`）呈现。

**E3 create 失败 → 官方 createFailed toast 链**：

- wrap 改为拒绝（返回 `Promise.reject(new Error('probe-sbg-create-fail'))`），再触发官方入口；
- 官方 `openWorkspace` catch → `notify({kind:"createFailed", message: creationFailureMessage(error)})` → 官方 Toast 呈现，DOM/截图双取证：**「新建会话失败：probe-sbg-create-fail」**（截图 `logs/.../002-real-wrap/e3-createFailed-toast.png`）。

**E4 dispose 恢复**：`s.create = original` 后引用同一性成立——属性替换缝的装卸对称（host `interceptRequiredBinding` 同配方）真机可逆。

## 语义结论（供 #5 映射裁决引用）

- `creationFailureMessage`（client.js:1008-1012）：Host 拒绝态（`SessionCreateError`）→ `"{code}: {message}"`；其他失败 → `error.message` 原样；
- toast 文案 = 官方词典 `toast.createFailed`：zh「新建会话失败：{message}」/ en「New session failed: {message}」——**错误语义映射零新增词汇，全走官方现成链**。

## 判定

**PASS——sessions 实例可写、apply 期属性替换 wrap 对官方一切 create 调用面生效、create 失败走官方 createFailed toast 链，全部真机端到端取证达成。** 外部依赖装配面结算门（用户裁决 2026-10-15）通过，fake 契约测试不算交付的缺口关闭。
