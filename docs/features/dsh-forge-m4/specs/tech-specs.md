---
feature: "dsh-forge-m4"
generated: "2026-10-01"
status: draft
---

# Technical Specifications: dsh-forge-m4(项目中心工作台)

> 提取源:design/tech-design.md(2026-09-28,裁决 T1-T7)+ tasks/records/1-4.summary + fix-1~fix-4 + run-test。非交互模式:CROSS 项自动集成(任务 consolidate-specs.md 指令)。
> 既有登记:TECH-ui-reuse-003(上游客户端包组件面不可直接导入)已于 M4 design 期入库 —— 本次不重复提取,仅在其所属文件追加执行期增量。

## 注入与预合成

### TECH-001: 追加行两行化与 hash oracle 口径

**Requirement**: 内核 presynth appendix 由一行归因扩展为**两行(归因行 + 命名行)**;ATTRIBUTION_MARKER/NAMING_MARKER 同源定义于 templates.ts 单一构造点(hash oracle 导入消费);e2e oracle 第三查升级 = 剥预合成前缀后 `\n\n` + **恰好两行 + 逐行前缀对拍**(失败码 appendix-not-two-lines,对前缀损坏与尾部增删均敏感);prompt_hash 口径不变 = sha256(预合成内容 + 追加行全文),dispatch 表关联字段零改动;追加行不在 Go 对拍集内(forge-cli 模板基线零影响)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 7;records 2.8
**Target 注记**: 修订 TECH-host-006(M4 修订块;「恰好一行追加」表述已过时)。

## IPC 面

### TECH-002: 动词面 v3 扩面 + 壳层 window 动词组

**Requirement**: workbench 白名单通道 51 → **62**(1.3 +5:probe/rename/archive/restore/list;3.2 +4:retryProjection/getProjectionStatus/submitWorkspaceSnapshot/reportProjectionOutcome;4.1 +2:getProjectUiState/setProjectUiState),main+preload 双份同源常量 + 漂移测试(deep-equal + 计数 + 追加式段序)延续;新增**非 workbench 前缀** `dsh-forge:window-*` 壳层动词组(open-detached/get-role/recall 恰三 invoke 通道 + window-changed push 通道不可 invoke;preload `dshForge.window` 面 + deep-equal drift 锁);事件 v3 扩展(projection_push_required/projection_updated/project_list_changed)走既有批量通道;bridge presence check = 全员可调才算在场(旧 preload 配新 client = 判缺席降级,跨宿 additive)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 1/§Interface 5;records 1.3、3.2、4.1、4.2
**Target 注记**: 修订 TECH-electron-ipc-002(通道数 51 → 62 + window 前缀动词组)。

## UI 集成

### TECH-003: 视图键族收缩与启动首屏归一

**Requirement**: `workbench/tasks|features|proposals[:slug]` 视图键退役;WorkbenchTabKey 收缩单成员 `'workbench/overview'` 逃生门(retire-in-place:快照保留字段 + 既有 hydrate 守卫安全归一,零迁移零复活;VIEW_MOUNT_TABLE 无死键);panellist「项目」行 = **null 寻址**(id: null,selectPanel(null) = 原生 conversation = 启动首屏;boot 归一 normalizeBootDefaultView 于 apply 而非改视图键机器,M2 AC 原样保留);拆出窗口 = DETACHED_PANEL_ID 新 keyed main panel 经 window-role boot 路由(不经视图键机器);退役宿主测试 test.fixme 原地挂起(断言零删改 + 迁移清单行号 + 恢复指针)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Integration 6;records 1.6、1.7、1.8、4.3
**Target 注记**: 修订 TECH-ui-reuse-002(其「workbench/overview|tasks|features」示例集已被收缩)。

### TECH-004: 上游 UI 槽位消费纪律(分型/priority/结构孪生)

**Requirement**: 槽位语义**分型** —— single 槽 = 最低优先级遮蔽渲染(第二注册整体替换原生组件,而原生组件不导出 = Hard Rule 禁止的包装/重挂载形态),**增量注入必须找 list 槽**(先例:conversation.input.dock、conversation.session.header.utilities、sidebar.right.tab.menu.item、sidebar.right.pane.tab.title);替换渲染走 **priority 机制**(forge -100 = lowest renders;原 occupant 保持注册为崩溃/卸载降级回退 abdicate);**unlinked peer 结构孪生**:SlotMap 声明/资源地址构造器本地镜像,owner 收窄为所读子集(未来上游合并时重复成员 = 显式编译错漂移警报而非静默),格式逐字节对拍 vendored 源 + 测试锁死;运行时全程 guarded,缺席整族静默不注册;右栏 tab 族经**两段式公开面**注册(stage one ctx 句柄 + stage two keyed 声明合并),原生不变量(空栏播种/关闭保护)经 extension band 保活而非复制;C9 几何边界:公共 ISidebarRight 无 resize 动词、库存无 pane 结构 → forge 分隔条 = 比例态权威控件(role=separator + 30-70 钳制 + 键盘模型,置 pane 体左缘内侧不遮原生 divider),pane 增删全走原生公共动词(openTab/openResource preferNewPane,原生 per-pane 页唯一性天然幂等去重),如需上游 resize seam 走 vendored 升级显式适配。
**Scope**: [CROSS]
**Source**: records 1.6、2.2、2.7、3.5、4.4;design/tech-design.md §Integration 1/3/5
**Target 注记**: 新增 docs/conventions/ui-reuse.md TECH-ui-reuse-004。

### TECH-005: 双宿主组件纪律

**Requirement**: 宿主上下文一律 **props 化**(单一联合类型如 'window'|'pane' + 默认值兜底既有行为,组件内零宿主探测);宿主几何映射**单源**(无环共享家常量:dock 宽/inset/覆盖层锚定同源取值;pane 内禁 vw/vh,改板盒锚定 absolute + calc(100%-N));零缩水以**默认形态 verbatim 断言锁证**;模态弹窗族窗口级自洽不随宿主穿透;项目绑定纯 props(拆出窗口钉来源项目,不读全局激活指针)。
**Scope**: [CROSS]
**Source**: records 2.1、4.3
**Target 注记**: 新增 docs/conventions/ui-reuse.md TECH-ui-reuse-005。

## 上游数据面

### TECH-006: 上游数据面读写双缝 + relay 重试单源

**Requirement**: 写走 **raw remote**(`ctx.get('remote.<ns>')` 生成远端命名空间;RemoteResult 判别联合,错误码精确可读零字符串解析),读走**客户端服务面**(如 ctx.workspaces.list follow 流物化源)—— 读写双缝各自取上游公共面,relay 不复用 UI 服务乐观合并;**duck-typed 通道结构孪生**(重声明而非类型导入,形状以 vendored types 为准,零 any 穿透;vendored 事实适配点显式注记模块头,漂移经 vendored 升级显式适配);relay 在场判据 = **既有事件订阅登记非空**(零新裸通道);缺席重试一次(500ms 竞态窗)后 degraded,**plan 保留禁静默丢弃**(期望状态在库,任何时刻幂等重推);装载后重放仅限「plan 从未被消费」的通道缺席语义(op 失败型 degraded 是用户重试面);**重试策略单源在内核**(relay 侧不建本地重试策略);执行后快照**本地合并先行** outcome 上报(写不经客户端乐观合并则必须自补合并,否则 outcome-ok 以陈旧快照写占位哨兵);快照 phase=pending / 从未建立不上报(空 ≠ 未知,局部快照会被读作「注册表仅此」);vendored 事实适配三处(create 只收 {path} 无 title → ensure 的 title 收敛 = create-后条件 rename;delete 对缺席目标拒绝 → relay 折成功承载幂等;insertBefore 应答完整序)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 2;records 3.3、3.4
**Target 注记**: 新增 docs/conventions/host-integration.md TECH-host-007。

## 数据内核

### TECH-007: schema v3 增量迁移实践

**Requirement**: v3 段 = projects ALTER ×10 + project_ui_state + workspace_projection + 2 索引(14 语句漂移对账);`{version:3}` 自有事务 + **事务内 TS 回填**(best-effort 归一化/docs_placement 映射 in_repo→repo-existing、external→custom(授权在案)或 app('legacy' = 迁移前值冻结)/sort_order←created_at;折叠碰撞 UPDATE 违例整段回滚显式失败);迁移器契约扩展 = SchemaMigration.up + **MigrationContext(docsRoot)**(db.ts 自 db 放置单源推导);CHECK 静态词表延续(projection_state 4 值/docs_placement 5 值);过渡性本地实现收编纪律(1.1 归一化副本在 1.2 单源落地后立即 import 收编,纯重排行为不变);三新域(projects-identity/projection/ui-state)沿用 repo+service 域模块模式。
**Scope**: [CROSS]
**Source**: records 1.1、1.2、3.1、4.1
**Target 注记**: 修订 TECH-data-kernel-001(v3 实践注记)+ TECH-data-kernel-006(M4 沿用确认注记)。

### TECH-008: 项目域 UI 状态 blob 纪律

**Requirement**: ProjectLayout v1 唯一内核权威(layout-schema.ts);sanitize 白名单**纯函数永不抛错** —— 严格未知键拒绝(顶层/嵌套每层)、**值域 vs 钳制分治**(sidebar 宽 264-420 越界 = 违规重置;rightbar widthPct 30-70 = 修复型夹紧仍合法)、topic 界长 512、detached target 恰一形态;违规/损坏 JSON → 默认 + ERR_LAYOUT_INVALID 结构化 log(**不弹错不拒动词面**,唯一 reject 面 = ERR_PROJECT_NOT_FOUND);服务端二次校验(客户端 debounce / 内核同步校验落库,两半分属);**stored 行存在信号**(无行 = 默认 + false;违规重置行仍 true —— 行在即记忆语义在;client 桥孪生为可选 additive);迟到写双保险(引擎 forget disarm + 内核拒绝);TabKind canonical = 内核、client 保留表结构孪生 + drift 断言锁同序同集(插件不可依赖 app)。
**Scope**: [CROSS]
**Source**: records 4.1、4.5、fix-2
**Target 注记**: 新增 docs/conventions/data-kernel.md TECH-data-kernel-007。

## 壳层窗口

### TECH-009: 壳层多窗口工程

**Requirement**: 窗口注册表(主窗 + detached 集;读侧一律 destroyed 活性过滤)+ WindowRole 判别联合经 preload verb 握手 —— **零 URL 面**(resolveWindowRole 输入仅 webContents 身份,「无从读取」落实禁 URL hash;漂移载荷降级 main,渲染层永不因载荷漂移崩溃);detached = 同源 SPA 重载 + 同 SHELL_WEB_PREFERENCES(contextIsolation/sandbox)+ will-navigate 锁 `dsh-app:`;每窗事件 fan-out(逐存活 webContents 直发,destroyed 自动退订)+ carriage/WS 改写逐窗注册(**改输入不改判定**:mainWebContentsId → shellWebContentsIds 存活集,主窗行为逐字不变有专项测试,主窗 createWindow byte-stable);OS 关闭 ≡ recall 由**单一汇流构造保证**('close' 几何记忆 → 'closed' registry 唯一移除口 + detached-closed 恰好一次,recall 不做独立清理路径);标题归主进程(page-title-updated 守卫:preventDefault 挡下渲染层申请 + 经 titleOf 事件时点重算重申,归档追加分即时合并;仅 detached 径,M1 主窗零触碰);windows/ 域模块**零 electron import**(DI seam:DetachedHostWindowFactory 宿主窗口最小面,vitest 直入);删除联动 = **动词前落标**(markRemoved 前置于 removeProject,规避 500ms 批推晚于 detached-closed 的竞态);壳→workbench 可选 hook 注入(recallProjectWindows/markDetachedWindowsArchived,services 装配在窗口面缺席时动词不受阻);boot 路由:hostless(无 dshForge)main() 同步执行(既有 boot 契约逐字保持)+ 真壳恰一次 getRole IPC 往返(WeakMap 按 face 记忆化)+ dispose 后到达的角色不装配(无僵尸 seat)+ detached 世界零 seat 双注册(apply 路由只装单视图,由构造保证)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 5;records 4.2、4.3、fix-3
**Target 注记**: 新文件 docs/conventions/shell-windows.md TECH-window-001。

## 测试

### TECH-010: e2e 纪律 M4 扩面

**Requirement**: 在既有 e2e 纪律基线上:**实况断言 = 原生 durable 面直读**($DSH_HOME/storages/workspace.json 宿主单写者原子重写:global.workspaceIds 序 + tables.workspaces 账,与 follow 流同源;零 forge 侧状态行断言);比对基线**收窄到投影面**(上游动词全部写径),宿主自留位(updatedAt/会话归属 churn)不入比对防误报;**故障注入 = env + 控制文件缝**(DSH_FORGE_PROJECTION_FAULTS 随探测重读;未设置 = 生产行为不变;不为测试改产品控制流 —— 渲染侧不可达即以直驱回填动词替代,注错词表留扩展位);e2e 语料**预启动经 REAL vendored persistence 种盘**(runtime 注入错过一次性 bootstrap;zstd 与 host 口径一致;journal↔artifact↔UI 三方对拍;能力核对先于实现);多窗口 helper(主窗定位 = renderer 标签排除法,getAllWindows()[0] 序非稳定;窗口计数 = 主进程 BrowserWindow.getAllWindows() 权威面,隐藏 ≠ 关闭;退出漏斗 = 窗口计数归零 + 主 pid 退出 + Playwright 句柄面归零,错误路径 finally 亦兜);**构建新鲜度**:座位缺席 + sc1/sc2 连锁失败先查 dist/lib mtime vs 提交时间线,e2e 前重建三件套(apps/desktop build + build:plugins + stage:plugin-tarballs);断言零删改 + test.fixme 台账(挂起 ≠ 删除,断言 + 迁移指针 + 复核注释);交互失稳升级 fix task 承接根因(>10 轮同类尝试阈值),不作断言收缩换绿;flake 双证(隔离重跑 + 串行小批复证);测量卫生(靴间 DELETE FROM project_ui_state 防布局记忆 replay 毒化窗口;预种 turnStart 闭 turn 对语料过会话 chrome hideChrome 门);时序纪律(故障在场静置 >500ms 让重试定时腿确定性收口;漂移注入前置投影面静默门 —— 活动行数稳定 + 全 healthy)。
**Scope**: [CROSS]
**Source**: records 3.6、3.7、4.6、4.7、fix-1
**Target 注记**: 修订 TECH-testing-001(M4 扩面块)。

## 路线图记账

### TECH-011: CLI/CC 插件收口顺延修订

**Requirement**: CC 插件与 forge 仓 CLI 发布收口原记「归 M4」→ M4 已重定题为项目中心 IA(路线图 2026-09-24 修订),收口归 **M6**;20 技能归宿 → M6 收口期;quality-gate/cleanup/worktree/verify-task-done 四 CLI 动词 GUI 归宿 → M5/M6;影子 git + runtime_root ①② → 存储实现里程碑。
**Scope**: [CROSS]
**Source**: proposals/dsh-forge-m4/proposal.md 定向说明;regression-inventory.md §四 E
**Target 注记**: 修订 TECH-product-arch-004(其「归 M4」表述已过时,保留 ID)。

## 特定于本 feature 的实现细节(LOCAL)

### TECH-012: M4 组件/座位实现细节

**Rule**: C7 六态状态机、doc-tabs 注册表(params 键控去重)、overview-model 纯派生、DETACHED_PANEL_ID、呈现再断言梯子、degraded-replay bounded retry 等组件级实现 —— 留 feature 文档(records 可溯),不入项目级约定。
**Scope**: [LOCAL]
**Source**: records 1.5、2.4、2.3、4.3、4.6、run-test

### TECH-013: SC 断言口径与 fixme 台账

**Rule**: SC1-SC7 断言口径(实况 registry 全等最强形/静态台账二次断言/七行活面走查)与 62 fixme 台账为 M4 验收资产,留 feature(regression-inventory.md 为权威)。
**Scope**: [LOCAL]
**Source**: regression-inventory.md;records 4.7
