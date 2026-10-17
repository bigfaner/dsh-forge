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

## R7 `/` 与 `@` 触发面能力核查（2026-10-17，源码实证）

**结论：两类触发数据移动端全可达（官方远程面齐备）；不可复用的只是官方 React 交互件。**

- **`/` 指令目录**：`dsh-commands` 的 `CommandRuntime` **extends `TypertRemoteService`**——指令注册表本身远程可调（typert = `/api/rpc` 同协议族）；桌面浏览器实现（`dsh-client-ui-commands` 的 `CommandUiRuntime`）即经 catalog RPC 联 host。slash 仲裁在 interactive UI adapter 层（`session.prompt` 无仲裁——`dsh-api-session-controller` 零 command 引用；官方手机页 70KB 无指令面）。手机端落法 = 履行同一 UI-adapter 契约（`/` 前缀解析 → 官方指令执行远程面；未命中回退字面消息）；执行 RPC 端点/载荷批次①录制钉死。
- **`@` mention**：触发契约公开——`dsh-client-ui-input-trigger`：`TriggerChar = '/'|'@'`、位置 leading/inline、guard 三档（plain/claimed/frozen，claimed 时 `/` 抑制 `@` 仍活）、`detectTrigger` 语法文档化（URL 斜杠词边界等）。候选三类（图标 token 实证 `file|folder|session`）：file/folder 数据 = `dsh-api-workspace-files` 自带 `typert.remote-client`（list/stat + changes 订阅流）；session 数据 = `session.list`。
- **范围结论**：mention 渲染（消息流 `@xxx` 高亮）已含于投影；`@` 触发弹层不在 PRD/mockup 范围——数据面已证可达，未来加 = 纯 UI 工作零 host 改动。

## R8 官方手机页内嵌 markdown 实现（2026-10-17 新发现，修正 R2/复用审计）

官方手机页 `renderBlock` 直接消费自带的 **`markdown(text)` + `inlineMarkdown(...)`** 函数（vanilla 自绘轻量实现，非外部库；`.markdown`/`.thinking-body.markdown` 样式族配套）——**此前「官方无 vanilla md、须自写」的审计结论有漏**。修正：

- **md 渲染 = 实现照搬、样式以原型为准（用户裁决 2026-10-17：UI&UX 以 mobile-ui-mockup-final.html 为准）**：照搬官方手机页 `markdown()`/`inlineMarkdown()` 的**渲染语义**（标签白名单、块级结构、inline 规则——复用官方机械），**视觉样式取我们原型的 DESIGN.md 令牌集**（行内码/代码块底、链接色、暗色锚、表格居中、横滚/缩放增强——不照抄官方 CSS 值）；
- thinking 折叠卡结构同源实证：官方页 summary = `activity-leading/title/dot/summary/chevron`——与 mockup `.think` 结构一致；
- 全屏阅读页（reader）复用同一实现（mermaid 增强器仍走 `@dsh-forge/md-mermaid` 动态 import）。

## R9 余项核实结论（2026-10-17 全部完成：dsh 源码 + 仓内代码 + 会话数据）

| # | 项 | 结论（证据） |
|---|---|---|
| 1 | 指令执行 RPC 面 | ✅ **typert 服务命名空间 = `commands`**，远程方法 = **`list`**（目录）+ **`execute`**（`@Remote` 装饰实证，dsh-commands lib/index.js：`constructor(ctx,"commands")`）。手机端 UI-adapter 仲裁调用此面；wire 方法全名以批次①录制复核 |
| 2 | ask 题型载荷 | ✅ 官方页 `renderQuestionComposer` 实证：`pendingQuestion = {rpcId, questions:[{id, header?, question, detail?(md 渲染), options?:[{label, description?, recommended?}], multiSelect?}]}`——**题型判别 = `multiSelect`**；**other = 每题附带的 customAnswer 自由文本域**（`questionCustom`，非选项成员）；提交 = `{id, selected:[label…], custom}`（+skipped）；校验 = selected 空且 custom 空才拒绝。另有 recommended 徽标与 previous/skip/continue 按钮族 |
| 3 | one-shot catalog | ✅ 会话数据实证（30802 行扫描）：`{childId, childCreatedAt, mode:'one-shot', label:'移动端对话UI&UX专家重设计'}`——与 continuable 同形，**label 在 one-shot 亦有值**；continuable 事件 10 条 |
| 4 | storage 挂载在场性 | ✅ **`dsh-base` bundle cordis.patch.yml 显式挂载三行**：`storage`（hub）/ `storage-json`（**config.root 已指 `dshHomePath('storages')`**）/ `storage-domain`（域 facility）。我们 host profile.dev bundles 含 dsh-base → **存储缝已挂载到位，无需补挂**；host profile.dev pnpm-lock 已含 dsh-storage-domain@0.2.0-rc.2（传递依赖已装） |
| 5 | 配对域 session.list 可见范围 | ✅ 官方口径 = **全量可见会话**：`ApiSessionList.list` 文档「Read every visible attached and persisted Session」，无 per-connection 过滤参数；官方手机页配对后 `rpc('session.list',{})` 即渲染全量列表——受限视图与桌面同域可见 |
| 6 | tool/result.meta | ✅ 会话数据实证 **2600 条**：载荷 = 工具私有 JSON（read：`{path,offset,lines,totalLines,lang}`；fs-search：`{shape,files,truncated,total}`）——通道确证可用；deliverable 类工具的具体 meta 形状批次③随文档卡探针核对 |

## R10 自审补充（2026-10-17 模糊点清零）

- **F1 unread 口径统一**：= host append 监听按**可见事件白名单**（投影 A/B 档类型）维护的计数器；非 `tailSeq−lastReadSeq` 事件差（含 turn/step 机械事件会虚大）。重放重建 = 按 seq 范围数可见事件。
- **F2 多 run chips 数据源**：progress 返回的 tasks 按 `source_slug` 分组派生（loops 撤销后的替代口径）。
- **F3 循环卡色条映射**：kind（dispatch 蓝/followup 浅蓝/state 灰/done 绿）↔ `forge/progress.verb` 值集映射，批次③实现时从 `loop/driver.ts` 取 verb 全集对齐（实证仅见 claim）。
- **F5 派发寻址（用户裁决 2026-10-17·甲）**：dispatch 指令发用户当前浏览会话——零映射需求（同源独占守卫防重复）；不建专用 dispatch 会话映射。
- **F4 唯一剩余实现级未知**：typert `commands` 服务（list/execute）的 **wire 暴露形态**——能否经 `/api/rpc {method:"commands.list"}` 直调未实证（官方手机页只用 session.* 族 JSON 面）——批次①录制桌面浏览器调指令的真实请求钉死（任务 1.1 AC 已含）。

## R11 探针钉死（2026-10-17 connection 探针全绿——`/api/rpc` 假设证伪后的传输面重钉）

| # | 项 | 结论（证据：connection-probe 绿跑 + 官方源码核销） |
|---|---|---|
| 1 | `/api/rpc` 信封通道 | ❌ **不存在**：本 host 配对 origin 对 `/api/rpc` 返回 404 "not found"；全部官方包 dist/lib 零命中。原 R9#5「官方手机页 rpc('session.list')」的真实通道 = **官方 client-connection 传输面**（下条），非 `{method,payload}` 信封 |
| 2 | 官方传输面（真实形状） | ✅ host webserver 同源挂载：单呼 = `POST /api/<service>/<method>`（信封 `{type:"client-request",rpcId,method,payload}` → `{type:"server-response",rpcId,result:{ok,value\|error}}`）；事件流 = `WS /api/remote.mux` 逻辑流复用（`$events` generation 源）。client 半 = `installConnection`（`@deepseek-ai/dsh-client-connection`），desktop 壳经 custom scheme 转发同组协议 |
| 3 | 组合缺口（必须补） | ❌→✅ **dsh-base 出厂只挂 `typert-gateway`，`api-session-controller` / `api-workspace-controller` 缺席**（`/api/session/list` 405 实证）——profile patch 插两行启用行 + profile deps 即点亮（探针已入 dev 形态；打包模板 template.ts 同源跟进） |
| 4 | `/remote/` 挂载适配（已落地 commit `7921232d`） | ✅ 三缝：index 经 `renderIndexInjections` 注入官方行（facade + 组合脚本 + `__DSH_BOOT__`；tapIndex 弹射跳过——弹射终点即本页）；`/remote/plugins/*` 302 → 官方 `/plugins` 组合路由；`/remote/api/*` 307 → 官方 `/api` 通道（client http transport 发文档相对 URL；302 会降级 POST） |
| 5 | client 半装载（mobile 页） | ✅ 最小路径实证：facade queue 模式下 app 组合 factory 入 `pendingQueue`（boot 只预载不执行）——按需补加载组合 `<script>` 后从队列直取 `@deepseek-ai/dsh-client-connection` factory 物化（bundle 自包含）；`installConnection` 缺省 web transport 同源直连 |
| 6 | 认证 | ✅ 配对链 302→302→303 铸官方 `dsh-auth-*` cookie（BrowserAuth，绑定 authority）；`_request` 上下文域由官方 typert client 运行时注入——手搓 payload 到不了（`gateway/arguments-invalid` 实证），**session.prompt 等业务单呼必须经官方 client 运行时** |
| 7 | 架构裁决 | ~~方案 B（官方协议）~~ **R12 已改向**（见下） |

## R12 最终裁决（2026-10-17：`/api` 官方 RPC 面整体放弃——安全裁决）

| # | 项 | 结论 |
|---|---|---|
| 1 | 裁决 | **mobile 不使用 `/api` 官方 RPC 面**（含 LAN）：不在组合启用官方 api 控制器（组合行撤销）、mobile 不 boot 官方 client 运行时。配对后手机可触达面 = forge allowlist 窄清单——**攻击面收窄即安全收益** |
| 2 | 数据通道（唯一） | `POST /remote/__rpc` 单通道 + PSK v3 安全层（tunnel-psk.md）：`forge:proxy/*`（官方能力 in-process 代理——同 ctx 直调 sessionController/typert 服务类方法，参数校验 = contracts DTO zod，`_request` 问题不存在）+ `forge:remote/*`（forge 原生） |
| 3 | 流式（唯一） | 加密 SSE `GET /remote/forge-stream`（forge 侧订阅 host 事件镜像：api-session/*、approval、任务进度逐帧 AEAD 推送）——LAN/隧道同通道，隧道恢复推送能力 |
| 4 | 用户的疑问收敛 | ①`_request` 问题随「不经 typert 网关」消失；②`session/follow` 流由 forge-stream 镜像等价承载；③官方 client-connection 的 client 半**不再引入 mobile**（handle/退避等能力由自研 stream.ts 轮询+SSE 重连承担——v1 设计残留复用）；④`dsh-client-connection` 在 mobile 的角色退为「协议形状参照 + 静态签名验证对端」 |
| 5 | 由此作废 | 1.29 旧口径（官方 client 引导）、fix-3 旧目标（boot 核销）、1.11 typert 化、todo #74 现行推进（typert 化转 shelved 远期——若未来桌面统一协议可重启）、R11 #5/#6/#7 中与 typert/client-boot 相关的结论 |
| 6 | PSK v3 不受影响 | tunnel-psk.md v3 全部有效（PSK/PIN-KDF/签名/逐渠道规范/forge-stream/静态签名）——它本来就设计在 `__rpc` 通道上 |