# 全量吞没审计台账：`} catch {` 空吞二分（方案 4）

- 扫描对象：全仓 TypeScript 源码（packages + apps），worktree `diag-milestone-coverage` 检出。
- 扫描模式：`} catch {`（裸 catch、无绑定变量）。
- 裁决口径（提案裁决台账 2026-11-01）：**豁免** = 注释化 fail-soft 理由且影响面为零；**其余一律补点**（warn/debug 站点）。

## 结论

| 项 | 数 |
| --- | --- |
| 裸 catch 总数（TS） | **364** |
| 豁免（有注释化理由 / 测试夹具） | **364** |
| 需补点 | **0** |
| 未决项 | **0** |

全仓裸 catch 逐点核对后**全部构成豁免**，无补点项、无未决项。豁免依据分五族：

1. **注释化 fail-soft 缺席语义**：目录/文件/服务缺席 = 回落值承接（空集/undefined/false/默认值），行为零影响——占绝大多数。
2. **诊断面红线①不反压**：emit/append/relay/转发链自身 catch（发射失败 → console 兜底或计数器），诊断不静默、业务零反压；appender 计数另有周期自证输出。
3. **错误显式回传**：typed error / result envelope / `ok:false` / skipped 计数 / 回滚回显——非静默。
4. **客户端官方面防御读取**：`reflect.get` / 快照窄读 / DOM 判定，面漂移 = undefined 降级（宁可功能失灵不可炸壳）。
5. **测试夹具与构建配置**（13 处）：`*.test.ts` 12 处 + `apps/web/vite.config.ts` 1 处。

## 计数对账

- 提案登记时点采样 **206 处**；现 HEAD **364 处**（TS）。漂移 = 后续迭代新增 fail-soft 面（增量）与 1.6 补点任务把 warn 径改写为 `catch (cause)` + 发射（不再构成裸吞，减量）之净差。
- 另有 `plugin-forge/src/spawn/job-tree.ts:207,223` 两处 `} catch {` 位于内嵌 **PowerShell 脚本字符串**内（keeper 子进程侧兜底输出），非 TS catch、不构成吞没面，不计入 364。

## 点名四处文件域核对（与 1.6 补点任务结论一致）

提案点名的 20 处（4 文件域）逐点结论与 `1.6/001-swallow-audit/audit-conclusions.md` 一致；补点后 `catch (cause)` 带发射的点不再是裸吞，不出现在本台账。

| 文件域 | 1.6 结论 | 现状核验 |
| --- | --- | --- |
| `plugin-forge/loop/e2e-baseline.ts`（3 处） | 3/3 豁免 + debug emit | `:142` 已改 `catch (cause)` + debug emit `e2e-baseline`；`:223/:234` 保留裸 catch + debug emit（组杀回落单杀 / 进程已退零动作）——三处均豁免，一致 |
| `core/forge/workspace/discovery.ts`（3 处） | 3/3 豁免 + debug emit | `:115/:127/:141` 均已改 `catch (cause)` + debug emit `discovery`——不再裸吞，一致 |
| `core/forge/project-service.ts`（6 处） | 1 豁免 + 4 补 warn + 1 已闭环 | 提案点名行全部消失于裸吞清单（`:227` canonical 豁免、`:263/:287/:295/:437` recordKeyLog warn emit `project-reconcile`、relink/recreate 径 `:588/:646/:692/:798/:881/:912` 均带发射记账）——一致 |
| `git-worktree/rpc-service.ts`（7 处） | 5 豁免 + debug、2 补 warn | 7 处均改 `catch (cause)` + debug/warn emit（`worktree-git` debugDiag 缝 / `deps.warn` 缝）——不再裸吞，一致 |

## 逐点台账（按域 → 文件）

判定列全省略重复：**每行均为「豁免」**；理由列为该文件各行通用的注释化依据（个别文件内差异单列）。

### packages/core（36 处：源码 30 + 测试 6）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| `src/index.ts` | 96, 279 | 效度域取数「任何一步故障 = undefined」机制惰性（doc 注释）；`forgeExperts` reflect 探测异常 = undefined（后续 warn 留痕不静默） |
| `src/fs-ensure.ts` | 25 | chmod 不可用面（Windows/特殊 FS）零影响，mkdir 语义已达成 |
| `src/telemetry/diag-events.ts` | 58 | 发射失败 → console 兜底（诊断不静默） |
| `src/knowledge/index-service.ts` | 77, 112 | 静默交还 `scanKnowledgeDir` 统一收口；单文件读取失败容错跳过（skipped 计数回传） |
| `src/knowledge/browse-service.ts` | 156, 261 | query_json 本域写入面保证可解析（防御 null）；卡片文件外部删除 → 回退索引时间 |
| `src/forge/small-domains/bugs.ts` | 87 | git 可选依赖同路回退 null（注释化） |
| `src/forge/small-domains/docs.ts` | 32, 69 | realpath 缺席回退词法 resolve；悬空判定 = 文档不在场（占位面非错误） |
| `src/forge/settings/service.ts` | 46, 190 | canonical 逐级上溯 realpath 注释化；tmp 清理最佳努力不掩盖原始异常（原异常照抛） |
| `src/forge/workspace/derive-dir.ts` | 98 | tasksHome 缺席 = 正常新建面（空集） |
| `src/forge/workspace/identity-anchor.ts` | 84, 95 | git 只读 fail-soft null（能力位 false）；realpath 失败退解析结果 |
| `src/forge/workspace/worker-context.ts` | 49, 77 | 锚点段缺席 = 段省略；目录树不可读跳过（深度/条目双上限注释化） |
| `src/forge/workspace/events.ts` | 21, 35 | 桥推送静默降级（交互重取兜底）；订阅方异常隔离 |
| `src/forge/tasks/query.ts` | 194 | files_json 畸形 → `{}` 降级不炸读面（S3/R12 注释化） |
| `src/forge/tasks/detail.ts` | 50, 122 | 畸形 vars_json/负载 → 记录级降级，读面不中断 |
| `src/forge/tasks/evidence-pointer.ts` | 95, 108, 135 | 指针/效度戳缺席 = 机制不判；落戳 fail-soft 恒 false（绝不抛） |
| `src/forge/tasks/git-lookup.ts` | 83 | 注入面同步异常同路回退 fallback entry |
| `src/forge/tasks/list.ts` | 366 | 畸形 record_fields = 计 0（decodeRecordFiles 同口径） |
| `src/forge/small-domains/proposals.ts` | 376, 408 | 目录缺席 → 静默空结果；非 UTF-8 → 可选字段缺席行恒立 |
| 测试：`project-service.test` 472 · `service-assembly.test` 381 · `reconcile-queries.test` 35 · `scan.test` 50,54 · `migrations.lineage.test` 26 | — | 测试夹具 |

### packages/plugin-forge（70 处：源码 66 + 测试 4）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| `src/faces.ts` | 544 | emitForgeDiag 发射失败 → 按级 console 兜底（诊断不静默） |
| `src/events/bus.ts` | 46 | 订阅方异常隔离（发射永不拖垮工具执行闭包） |
| `src/events/sink.ts` | 53 | 目录解析失败仅丢该会话日志落位（注释化 fail-soft） |
| `src/events/log-listener.ts` | 81, 99, 107 | JSONL 唯一写者 fail-soft 降级；文件缺席 → 空集；坏行跳过 |
| `src/triage/triage.ts` | 51 | 官方面结构探测异常 = undefined（不可投影即不判） |
| `src/triage/decision.ts` | 51, 94 | JSON 回溯解析继续向前；解析失败 → TriageDecisionInvalidError 计处置失败（非静默） |
| `src/dispatch-core/assemble.ts` | 201 | 模型目录解析失败 = 不可知不判（注释化） |
| `src/dispatch-core/core.ts` | 452 | spawn 审计行 fail-soft（库写失败不外溢，UI 兜底径仍在） |
| `src/dispatch-core/settle.ts` | 56, 194 | git HEAD 故障 = undefined 跳过标记；dispose 收尾异常不并进已定失败面 |
| `src/agent/bug-mention-prestep.ts` | 161, 179, 260 | 项目枚举/台账单项目查询 fail-soft；展开故障 = 原文放行 |
| `src/progress/index.ts` | 201 | 无活根静默跳过（append 面内部另有告警） |
| `src/tools/format.ts` | 109 | 事件发射异常不吞失败面（failure 照常返回） |
| `src/tools/dispatch-task.ts` | 239 | 池快照读故障 → 零值 + `readFailed` 标注（不误导模型） |
| `src/tools/session.ts` | 110, 149 | bindingsFile fail-soft 空表降级；snapshotEvents 异常 = undefined 回落出生头 |
| `src/tools/submit-task.ts` | 428 | 效度落戳故障不阻断结算（core 侧 fail-soft 单源） |
| `src/commands/run-dag-tasks.ts` | 444 | 新会话判定抛错 fail-soft → 最保守路径（激活+followup） |
| `src/loop/driver.ts` | 455, 547, 1105, 1319, 1363, 1670, 2888 | 阈值键缺省生效；在场判定读故障 = false；链深度不可得 = undefined；进度/台账发射零循环正确性依赖；叙述故障 fail-soft（挂起事实已落登记）；池快照零值兜底 |
| `src/loop/escalation.ts` | 300 | resolveAgent 失败 = 无 agent 问询（fail-soft 同径，问询非循环正确性依赖） |
| `src/loop/e2e-baseline.ts` | 223, 234 | **豁免补点（本提案 1.6）**：组杀失败回落单杀 / 进程已退零动作——裸 catch 体内带 debug emit `e2e-baseline` |
| `src/notify/channel.ts` | 47 | 叙述静默降级（SC7——仅看板+问询仍可达） |
| `src/notify/incident-log.ts` | 81, 112 | 序号从 1 起（目录缺席）；全链 fail-soft 落盘缺席不拖垮叙述/循环 |
| `src/spawn/job-tree.ts` | 239, 526, 639, 643 | PATH 探测下一候选；队列目录清理不碍回收；单目录清扫失败不影响守卫装配；基址缺席 = 无遗留可扫 |
| `src/spawn/in-process-driver.ts` | 151, 207 | 已处置子代理取消无操作；dispose 失败就地吞、catalog 错误照旧上抛（官方同语义） |
| `src/index.ts` | 126, 135, 154, 162, 265, 273, 305, 310, 322, 333, 347, 354, 364, 443, 460, 492, 498, 522, 583, 602, 644, 672, 707, 726, 730 | 可选服务防御读取族（forgeSettings/experts/llm/jobs/agents/sessionController/userQuestions/forgeFeatures/sessionProjections/commands/reflect.probe）：缺席/异常/非函数面 = 形态兼容降级，关键位均有 warn 留痕或回执指引（AGENTS 1.6 每调现查）；git 探测/预热失败 = 缺省段/回落 fail-soft |
| 测试：`sink.test` 19 · `e2e-baseline.test` 178 · `job-tree.test` 30 · `triage`（无） | — | 测试夹具 |

### packages/plugin-forge-spec / packages/knowledge（各 1 处）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| `plugin-forge-spec/src/tools/session.ts` | 104 | bindingsFile fail-soft 空表（回落静态表，注释化） |
| `knowledge/src/tools/session.ts` | 73 | 同上（同构实现） |

### packages/plugins（87 处：源码 86 + 测试 1）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| expert-squad `src-client/panel/model-catalog.ts` | 53, 78 | reflect 惰性读取 fail-soft；目录调用拒绝 = resolve(undefined) |
| expert-squad `src-client/panel/config-jump.ts` | 31 | 导航面缺席 = 不装配 |
| expert-squad `src-client/index.ts` | 76, 97 | 官方面消费切片：缺席/漂移 = undefined（阶段化失败降级引导） |
| expert-squad `src/store/watch.ts` | 205, 290 | 锚爬升守卫（warnOnce 留痕 + fs/observed 通道兜底）；旧 watcher 关闭失败不阻塞重挂 |
| expert-squad `src/store/scan.ts` | 94, 117, 127, 218 | 存在性探测 false；`.git` 缺席 = ws 本身（容忍注释化）；解析失败回退 workspace；mtime 失败纪元兜底 |
| expert-squad `src/state.ts` | 78 | canonical 化失败 = 记录必然不存在，按启用降级（bug 44e70a5f 注释化） |
| expert-squad `src/index.ts` | 178 | 可选服务守卫外惰性取（清扫留档注释化——cordis 4.0.4 无可选 inject） |
| quote-reference `src/client/quote-source.ts` | 253, 269 | 序列化永不抛错阻断发送（摘要/最小块兜底） |
| quote-reference `src/client/index.ts` | 44, 55, 65, 71, 96, 114, 187 | cordis 缺席服务读取 fail-soft；快照/插入面漂移 = undefined；聚焦失败回落 false |
| input-history `src/client/index.ts` | 51, 67, 116, 156, 172, 186, 192, 205 | 会话窄面/草稿缝 fail-soft；置稿失败不外溢（翻阅态自洽重启）；键位接线失败不外溢；list 订阅缺席 = 仅初挂（接线失败另有 console.error 降级留痕） |
| input-history `src/client/event-source.ts` | 29, 43, 48, 64 | 官方窗口快照/退订器形状校验 fail-soft（dispose 语义恒安全）；binding 消费空态 |
| input-history `src/client/composer-keys.ts` | 27, 52, 67, 97, 141, 151, 222 | 官方面探测/DOM 漂移守卫：读不到一律不拦键（宁可历史失灵不可吞菜单导航）；吞键/撤订失败行为与未接线一致；caret 读失败 = 非零不触发行首门 |
| super-composer `src/client/index.ts` | 64, 74, 80, 128, 164, 182, 215, 225, 254, 283, 312 | 服务读取/provide/退全屏/聚焦/重绑/扇出/补挂全缝 fail-soft（官方面漂移只降本面） |
| super-composer `src/client/fullscreen.ts` | 56 | 非法选择器该条不参与判定，不炸感知面 |
| super-composer `src/client/document-activity.ts` | 59 | 官方面漂移 = 降级不收窄 |
| super-composer `src/client/data-face.ts` | 153, 180, 333, 345, 387, 399, 421, 437, 447, 478, 501, 515, 523, 541, 548, 558, 571, 583, 594, 606, 622, 633, 649, 660, 667 | 数据面契约：服务缺席/会话未在留/面漂移 = 投影空态 + 操作 no-op（不抛，组装注释化）；订阅失败下一轮重试 |
| git-worktree `src/index.ts` | 152, 202 | 注入缝缺席 = 独立模式不抛断宿主；disposer 注销失败不抛 |
| git-worktree `src/host-assembly.ts` | 121, 145 | 拦截撤销失败不阻关停链（幂等 fail-soft） |
| git-worktree `src/git-presence.ts` | 39 | git 在场检测本身 fail-soft（注释化，不抛断宿主） |
| md-mermaid `src/web/enhancer.ts` | 152, 193 | parse 确认失败回退代码块；单块异常降级官方代码块现状 |
| 测试：expert-squad `tests/assemble.test.ts` 117 | — | 测试夹具 |

### apps/host（87 处：源码 86 + 测试 1）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| `src/main.ts` | 47 | 便携 data 探测失败 = 保持缺省 userData（不阻启动） |
| `src/boot/api-loopback-guard.ts` | 29, 44 | 畸形 Host fail-closed 从严 / 面判定 false（注释化纯函数口径） |
| `src/boot/bridge.ts` | 474, 852, 900, 930 | argv 形状非法 = undefined（子入口 fatal 上报）；IPC 降级面亦不可达 → 静默（disconnect 兜底）；URL 脱敏解析失败占位；路径映射非法 = undefined（服务侧 403/404） |
| `src/boot/child.ts` | 118, 137, 216, 287, 296, 339, 379, 407, 419, 427, 437, 446, 457, 480, 503, 555, 577, 596, 612, 626, 634, 655, 807, 814, 921, 967, 1180, 1202, 1275, 1280 | 可选服务惰性取法（具名属性 + 存在性检查，缺席 = undefined 降级）；诊断 emit 缝红线①（异常不反压业务链）；流扇出单连接失败不反压；绑定读失败 → 全量刷新现状；/pair 缝注册失败 → 配对面降级 UI 空态；撤销/停机失败不阻关停链 |
| `src/boot/file-list.ts` | 40 | 不可读子目录跳过（候选面不阻） |
| `src/boot/forge-stream.ts` | 45, 87, 173 | 命中判定 URL 异常 false；心跳写失败关连接；退订失败不阻关停链 |
| `src/boot/pairing.ts` | 146, 152 | body 形态解析失败 = 空 PIN（配对拒绝面） |
| `src/boot/proxy-channels.ts` | 339 | worktree 读法失败 = 零行降级（归组仍成立） |
| `src/boot/psk-gate.ts` | 55, 166, 185, 201, 255, 264, 302, 319, 329 | 存储缺位/IO 失败 = 门未配置 fail-soft（装配面 diag 显形）；全部失败路径归一 401（唯一 owner 非静默）；宽限钥重试；空表/空账本起算；持久化失败不阻门 |
| `src/boot/psk.ts` | 185 | 验签异常 = false |
| `src/boot/read-cursor-store.ts` | 24, 33 | 空表起算；持久化失败不阻调用面（未读仅 UX） |
| `src/boot/remote-http-rpc.ts` | 30, 230 | 命中判定异常 false；畸形 body = 400 + diag 留痕（协议层失败非静默） |
| `src/boot/run.ts` | 245, 257, 360, 366, 607 | 订阅方异常隔离；sink 异常不反压管道（红线②）；回显失败静默；IPC send 失败回调留痕 + false |
| `src/profile/safe-mode.ts` | 49 | 读得同内容跳过语义：缺席/不可读 → 落写 |
| `src/telemetry/appender.ts` | 67, 174, 234, 262, 294, 299, 313, 326 | 红线①②③注释化：写失败/超界 → 内存计数（writeFailures/queueDropped/maintenanceSkipped，另有周期自证输出）；崩溃路径兜底钩不允许可达异常 |
| `src/telemetry/child-relay.ts` | 25, 64 | relay 失败静默（诊断面不反压——红线①同构）；畸形行 = undefined 落回 harness.log 链 |
| `src/telemetry/console-forward.ts` | 70, 82 | 转发链异常不反压 renderer；摘订阅失败装配面容错 |
| `src/telemetry/gateway-fold.ts` | 102 | 撤销失败不阻关停链 |
| `src/telemetry/host-wiring.ts` | 40, 50 | 目录落地失败不阻 boot（appender 计数承接）；诊断面异常不反压业务 |
| `src/window/web-document.ts` | 100, 258 | 解码失败 = 400；URL 解析失败 = undefined（非同源不分流） |
| `src/tunnel/index.ts` | 230 | 订阅方异常隔离 |
| `src/ipc/electron-bindings.ts` | 82 | 打开面 fail-soft：目录不可建静默（永不炸宿主流程） |
| `src/ipc/harness-channel.ts` | 62 | 日志面缺席不阻断动作（fail-soft 注释化） |
| `src/ipc/preload-api.ts` | 41 | trace_id 生成异常 → 时间基 fallback |
| `src/ipc/rpc-envelope.ts` | 47 | 埋点失败不破 RPC 信封（红线①） |
| 测试：`delegate-visibility-smoke.test` 87 | — | 测试夹具 |

### apps/web（42 处：源码 41 + 构建配置 1）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| `src/client-plugin/plugin.ts` | 342, 374, 398, 442, 461, 495, 531, 1217, 1234, 1486, 1523, 1583, 1601, 2015, 2575 | 账本快照窄读族（行缺席/漂移/异常 = undefined，调用方回退显示 sessionId）；refresh 兜底；openResource/openSession 无在场面瞬态不外溢；注册被拒 fail-soft 不炸 apply；reflect 惰性读取降级 |
| `src/client-plugin/open-session.ts` | 118, 129, 137, 144, 316, 372, 392, 402, 411 | composer face 解析/插入/还焦 fail-soft；还焦失败不回滚（插入已落）；快照面漂移 = 不可核验即放行（fail-open 官方原流） |
| `src/client-plugin/chip-restore.ts` | 39, 71, 92, 98, 134 | 单轮重建逐段 fail-soft（未落即停不重试）；订阅缺席 no-op |
| `src/client-plugin/bug-source.ts` | 309, 416, 424 | 台账查询失败 = 空候选；serialize 降级链带 console.warn 三段取证（非静默） |
| `src/client-plugin/connection-lost-banner.ts` | 24 | cordis 缺席解析抛错形态 = 零安装 |
| `src/rpc/events.ts` | 60 | 监听方异常隔离 |
| `src/views/knowledge/use-knowledge-browse.ts` | 98 | 项目元数据 fail-soft（浏览主数据不因此失败） |
| `src/views/session/forge-event-data.ts` | 137, 149 | 畸形时间戳 = 空串收口 |
| `src/views/overview/overview-data.ts` | 72, 265 | 派生路径/文档根缺席 = null/undefined（不阻断头部装载） |
| `src/views/overview/drawer/detail-model.ts` | 182, 212 | 畸形 JSON → 换行列表回退/空（不炸渲染） |
| `vite.config.ts` | 69 | 构建配置夹具 |

### apps/mobile（40 处）

| 文件 | 行号 | 理由 |
| --- | --- | --- |
| `src/main.ts` | 508, 594, 616, 855 | 清单锚缺席 = hero 降级；grouped 不可达 = 标题事件面回退（诚实降级）；心跳失败 ok:false；落地信标 fire-and-forget 失败静默（零状态触碰） |
| `src/core/api.ts` | 60 | 网络异常 → typed DisconnectedError（显式回传） |
| `src/core/rpc.ts` | 46 | 网络/401 → `ok:false disconnected` 信封（显式回传） |
| `src/core/sse.ts` | 66 | 畸形帧 = null（bad 帧 fail-soft 忽略，错误路径只认 onError） |
| `src/core/forge-stream-source.ts` | 70, 91 | 帧解码失败 = null（信封/验签失败统一丢弃） |
| `src/core/tunnel.ts` | 55 | 探测不可达 = tunnel/unreachable（分型结论非静默） |
| `src/core/tunnel-transport.ts` | 122, 157 | 协议错误分类回调 `onProtocolError` 后抛（显式回传） |
| `src/core/static-verify.ts` | 111 | 基线损坏 = undefined（重录径） |
| `src/core/log-sync.ts` | 47 | 历史拉取失败保持旧快照（下轮重试） |
| `src/core/psk-crypto.ts` | 211, 241 | Ed25519 能力检测 false；验签异常 false |
| `src/widgets/tunnel-panel.ts` | 71, 81, 91, 101, 185 | 非密材料缓存读/写/清静默降级（零安全面，注释化） |
| `src/widgets/msg-cards.ts` | 75, 585 | 参数非 JSON 回退原文；复制失败 resolve(false) |
| `src/views/settings.ts` | 161, 170, 177 | 选档失败回滚显示；目录/投影拉取失败保留旧数据（面板可用） |
| `src/views/models.ts` | 199, 209, 224, 270, 280, 290, 528 | 最近使用/暂存档读写静默降级（存储不可用环境注释化）；投影缺席回退部署默认 |
| `src/views/hero.ts` | 271, 299, 338 | 默认档/预设下发失败不阻断进入会话（诚实降级）；roster 不可达回退内置清单 |
| `src/views/drawer.ts` | 224, 233, 594 | 折叠清单损坏 = 空表；写失败静默；心跳失败保持隧道域位（失败连击阈值防闪） |
| `src/views/progress.ts` | 228 | 断连/键缺席 = 诚实空态（轮询自愈） |

## 台账口径备注

- 「豁免」不等于零诊断：诊断面自身（红线①族）、补 debug 后保留裸 catch 体（e2e-baseline:223/234）、serialize 降级取证（bug-source）等豁免点均有既有留痕承接，符合 AGENTS §7「不以 fail-soft 为由静默失败」。
- 行号为当前检出快照的行号；后续迭代行号漂移时以「文件 + 上下文语义」为锚重新对位。
