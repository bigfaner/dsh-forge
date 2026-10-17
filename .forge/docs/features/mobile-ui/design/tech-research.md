---
created: 2026-10-17
probe-source: .forge/docs/probes/official-mobile-page.js.txt
---

# 技术调研：mobile-ui 相关技术要点

## R1 官方手机页实现实证（AD-2 条件项钉死）

来源：本机官方安装物 `D:\software\DSH Desktop\resources\app.asar` 内 `renderMobilePage`（70KB 单文件页，提取件见 probe-source）。**这是批次①「SSE 抓样」的前置答案——端点形状已钉死，批次①首任务降为回放录制**。

### R1.1 流通道（SSE）

```js
new EventSource('/api/session/stream?sessionId=' + encodeURIComponent(sessionId))
```

- **两个命名事件**，非默认 message：
  - `snapshot`：`frame = {records, projections}` → 全量应用（applyHistory），`streamRevision += 1`
  - `event`：`frame.event || frame` → **增量**；`type` 小写化后与 **`'assistant/chunk'`** 比较（瞬态类型在流上的真名是 `assistant/chunk`，非 client-store 内部名 `live-chunk`）；非 chunk 事件触发 `interaction.pending` 同步（150ms 防抖）
- `onerror` → `streamConnected=false` + `schedulePoll()`（降级轮询）
- 会话切换 `closeSessionStream()` 硬关闭 + 乐观消息重置

### R1.2 RPC 面

`POST /api/rpc {method, payload}` → `{ok, error?}`；`401`/fetch 异常 → `disconnected` 错误（驱动覆盖层）。实际使用的方法集（正本清单）：

`session.list / session.models / session.selectModel / session.create / session.history / session.prompt / session.cancel`、`interaction.pending / interaction.answer / interaction.cancel`、`workspace.list`、`agentPreset.list / agentPreset.select`

### R1.3 轮询与生命周期常量（官方实测值，直接照抄）

| 常量 | 值 | 语义 |
|---|---|---|
| `HISTORY_POLL_ACTIVE_MS` | 250 | 流活跃时历史轮询间隔 |
| `HISTORY_POLL_IDLE_MS` | 750 | 空闲起点（= 提案的 750ms 退避起点） |
| `HISTORY_POLL_IDLE_CAP_MS` | 5000 | 退避封顶（= 提案的 5s 封顶） |
| `PENDING_SYNC_DEBOUNCE_MS` | 150 | pending 交互同步防抖 |

- `visibilitychange`：隐藏 → 停轮询；回前台 → `loadHistory(false)` + `checkConnection()`（**官方同款前台判活，评审建议项照此落地**）。
- 渲染合帧：`requestAnimationFrame` 队列（`queueStreamRender`），`fullPaint` vs `patchLastStreamMessage`（**「末条补丁」正本即此**）。
- 心跳：`/api/status`（`cache:'no-store'`）→ 状态灯 + `tunnelExpiresAt` 隧道到期警告条。
- 键盘视口：`visualViewport` → `--app-height` + 聚焦时 `scrollIntoView`（移动端软键盘适配正本）。

### R1.4 对设计的修正

- tech-design「消息 wire 契约」节：流上瞬态类型按官方流命名 **`assistant/chunk`**（帧内 `type`），`live-chunk` 仅为 client-store 内部判别名——手机端照官方流口径消费。
- 轮询常量改为官方三值（250/750/5000），替换原「750ms→5s」的单段描述。

## R2 esbuild 单文件内联

esbuild 原生无 html 入口：方案 = `esbuild.mjs` 以 `--bundle --format=iife` 产 JS（CSS import 产独立 css 或 `--loader:.css=text` 内联），再读 html 模板把 `<script>`/`<style>` 内联写出单文件 `dist/index.html`（几十行脚本，无需第三方插件）。产物单文件使 `/remote/` 静态服务只剩一个文件，host 既有 MIME/404/no-store 全兼容（可行性评审已证 child.ts:483-573）。

## R3 Playwright Chrome 设备模拟

`test.use({ ...devices['iPhone 13'] })` / project `use: { ...devices['Pixel 7'] }`——视口/触摸/UA/DPR 一次到位；SSE 回放用 `page.route` + 定时事件序列注入（R1 的帧形状即回放脚本格式）。`visibilitychange` 判活旅程可在模拟器中通过 `page.evaluate` 派发。

## R4 dsh-storage-domain（AD-7 已实证，汇总）

`defineDomain`/`domainTable`（zod `valueSchema`）+ `KvTable.get/put/update`（单域写链原子）+ `domain/changed` 事件 + JSON backend（dsh-home storages/*.json 即产物）——read-state 域表零基础设施新增。

## R5 多帧 zstd（wire-samples 前置）

官方 `session.v4.jsonl.zstd` = 拼接独立帧；Node `zstdDecompressSync` 只解首帧，需 magic（28 B5 2F FD）扫描 + 逐帧解压（探针 `extract-wire-samples.mjs` 已落地此法）。

## R6 dsh-storage* 三包能力与边界（类型正本全文读毕）

### R6.1 `@deepseek-ai/dsh-storage`——hub 层（`ctx.storage`）

**能力**：
- 命名 backend 注册表：`backend.register(name, backend)`（注册为 effect，disposer 仅摘名不 close——关闭归属主插件）、`get(name)`、`names()`；多 backend 并存，谁服务谁由消费方配置（域层路由表），**hub 无全局路由**。
- 数据形态挂载：`StorageForms` 声明合并 + `mount(form, facility)` / `form(name)`——域层把 `domain` 形态挂进来后即可 `ctx.storage.domain` 访问。
- Backend 契约：`StorageBackend { kv?: KvFacet, close() }`——backend 拥有一个介质（文件树根/数据库文件），facets 可选缺席（`form-not-mounted`/`facet-unsupported` fail-loud）。
- `KvFacet.open(descriptor) → KvUnit`；descriptor = `{name(须合 UNIT_NAME_RE), version, tables, hasGlobal, layout?: 'single'|'per-record', compatibleVersions?}`；同名单元重复 open 未关 = 调用方 bug。
- `KvUnit`：`loadAll / putRecord / deleteRecord / backupRecord? / setGlobal / close`；version-mismatch / malformed-medium 拒绝；值 = 不透明 JSON。
- 错误码契约：`backend-not-found / form-not-mounted / duplicate-backend / duplicate-mount / version-mismatch / malformed-medium / closed`。

**边界**：
- hub 自身**零 IO**——backend 拥介质，语义归数据形态层。
- 值无 schema、无事件、无域意义。
- **单元不串行化并发写**——写序归调用方（域层每单元一条写链）；单元只保证单调用原子且 resolve 后持久（crash 后重开可见）。
- 注册销毁不关 backend（属主插件负责）。

### R6.2 `@deepseek-ai/dsh-storage-domain`——域层（`ctx.storage.domain` / `ctx.storageDomain`）

**能力**：
- 声明：`defineDomain(spec)` / `domainTable(schema)` / `descriptorOf(spec)`。spec = `{name, version, layout?, compatibleVersions?, invalidRecords?: 'backup-and-skip', global?: {schema, initial}, tables: {名: {valueSchema(zod), __key?}}}`；模块加载期 fail-loud 校验（域名/表名合 UNIT_NAME_RE、version 非负整数、**global schema 不得接受 null**——null 是「未写」哨兵，可空 global 会在重开时静默回退 initial）。
- `open(spec)`：单开（`already-open` + 保留名防并发开）→ 路由解析（Config `backend` 默认 + `routes` 按域覆盖）→ kv facet 检查 → 开单元 → **全量 zod 校验**（`invalid-record` 带 table/key 定位；`backup-and-skip` 仅 per-record 可用，global 恒拒绝）→ 构造 Domain。
- `Domain`：`global {get, set}` + `table(name) → KvTable {get, entries, keys, size, put, delete, update(key, fn)}`。**`update` = 写链上的原子 read-modify-write**（fn 见排队时点现值，并发不交错）。
- 写序：每域一条写链；写 = 排队 → backend 持久 → 改内存 → 发 `domain/changed`（`{domain, table, key, operation:'put'|'deleted', value?}`——**无旧值**，diffing 消费者自存前快照；按写序送达；观测者抛错不回滚已提交写）。
- 读：同步走权威内存态。
- `close()`：拒新写 → 排干已排队（事件仍发）→ 关单元 → 释放域名；幂等；facility unmount 时 `closeAll()` 兜底。
- invariant companion：`domain/changed` 事件必须等于发射时内存态的机械校验。
- 错误：`already-open / facet-unsupported / invalid-record / missing-key / closed`；backend 错误透传 StorageError 不重包。

**边界**：
- **consumer 永不直触 backend**——域层是唯一实现，依赖它即可。
- 无跨域事务、无查询语言、无索引——查询 = 内存 `entries()` 同步快照遍历。
- 单域单写链 = **单进程写者假设**（跨进程写无仲裁）。
- 无内建迁移引擎——版本按 layout 策略：`single` 精确版本（不符拒开）；`per-record` 兼容版本集内读、写恒新版本、集外文档**丢弃记录**（不迁移）。
- 事件不携旧值；跨进程推送（RPC frames）官方注明「later phase」，当前仅进程内 cordis 事件。

### R6.3 `@deepseek-ai/dsh-storage-json`——`json` backend

**能力**：
- 注册 backend `json`；`Config.root` **故意无默认**（防 cwd 散落文件）——组装层显式声明位置。
- **single 布局**：`<root>/<unit>.json` 一文档（pretty-printed、插入序稳定、人类可读——这是该 backend 的存在理由）；内存态权威，每次写整文档原子重发布。
- **per-record 布局**：`<root>/<unit>/<table>/<key>.json` + `global.json`；**目录即状态**（单元无内存态，`loadAll` 重读树，每写 = 一次原子文件操作）；`backupRecord` → `<key>.json.bak.<YYYYMMDDHHmm>`（同分钟同键覆盖）；坏/陈旧/集外版本文档 = **缺席**（一坏不 brick 单元）；遗留 single 文件一次性 bootstrap（任何新文档路径出现即抑制）。
- 原子协议：同目录 temp → fsync → `rename()`（Windows = `MoveFileExW(REPLACE_EXISTING)`）→ POSIX 目录 fsync——**last-write-wins 单写者语义**（与 session-log 的 link()+unlink() no-clobber 协议刻意不同：单元文件每进程恰一写者）。

**边界**：
- 只服务 kv facet。
- single 布局每写全文档重写——大/稀疏记录用 per-record（写单记录不动其余，版本检查也按记录粒度）。
- per-record 键即路径段：必须 `[a-zA-Z0-9_-]+`，不安全键写时拒绝。
- 无查询、无通知（通知在域层）、无跨进程仲裁。

### R6.4 对 read-state 的实现精化

| 决策点 | 结论 | 依据 |
|---|---|---|
| layout | **`single`**（默认） | 行数 = 活跃会话数（≤几十），单文档重写成本可忽略；per-record 是 projection-cache 级大/稀疏场景的方案 |
| 单调守卫 | **`KvTable.update()` 原子 RMW 实现**（fn 内 `lastReadSeq = max(current, newSeq)`），而非通道层校验 | update 在域写链排队槽位看现值，天然免疫并发交错——比薄方法手工校验更稳 |
| schema | zod：`{last_read_seq: z.number().int().nonnegative()}` | 持久边界校验；global 不用（表形态足够） |
| 载体挂载 | host 依赖增补三包（0.2.0-rc.2 同轨）→ 挂 storage-json（root = dsh-home storages）+ storage-domain → 核实官方组合是否已挂（官方 dsh-schedule/projection-cache 已在消费） | AD-7 三步 |
| 域损坏口径 | open 时 zod 校验拒绝（默认行为，权威数据姿态）；游标丢失即 unread seq 重放自愈 | read-state 是可重建派生态 |
