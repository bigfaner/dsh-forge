# Architecture Decisions

| Date | Feature | Decision | Rationale | Source |
|------|---------|----------|-----------|--------|
| 2026-09-20 | dsh-forge-m1 | 本仓采用 pnpm workspace(apps/ + packages/)布局 | 为 M2+ 一切皆插件预留包边界,对齐上游工程形态 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | Electron 壳路线整体继承上游 apps/desktop,不自选替代框架 | 上游生产实现背书协议缝;替代路线等于重造 dsh | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-21 | ui-plugin-foundation | 两级插件模型:forge 核心 = 必备插件(内置 bundle 分发、不可禁用、仅作者维护),原「可启停/禁用回归纯壳」语义收缩至第三方插件 | forge 核心为差异化价值必备,不可被用户摘除;扩展性经自有槽位向第三方开放 | proposals/ui-plugin-foundation/proposal.md §Proposed Solution;conventions/product-architecture.md TECH-001 |
| 2026-09-21 | ui-plugin-foundation | 产品数据内核(SQLite:任务索引/项目↔会话挂接/任务 CRUD 数据 API)进 Electron 壳,方向声明,M2/M3 落地 | M2 看板首屏与状态回流的文件扫描成本、挂接关系结构化存储;产品壳自主选择(偏离官方极小 API 面模式) | 同上 §Assumptions Challenged;dsh-forge-m2 prd DF005 |
| 2026-09-21 | ui-plugin-foundation | forge CLI 退役:过渡 = 插件宿主半身 spawn CLI(标准 rpc);终点 = 应用 API(Electron 数据内核)+ dsh tool,CLI 不保留 | 形态终态对齐应用化;任务调度插件化、可替换、不动数据内核 | 同上 §Proposed Solution 架构约束 4 |
| 2026-09-21 | ui-plugin-foundation | ui-plugin-foundation 工程基座(配置化 + spike + 模板 + 断言)独立立项,硬前置 dsh-forge-m2 UI 插件任务;插件清单迁出壳代码为产品级配置(唯一事实源) | 工程决策前置收敛 M2 关键路径;版本对齐纪律先于第一个自有插件;消灭「清单焊死壳代码」 | 同上 §Urgency/§In Scope;features/dsh-forge-m2 manifest Dependencies |
| 2026-09-22 | dsh-forge-m2 | SQLite 内核 M2 全落:node:sqlite 内建,自有 SoT 与派生快照分区,快照可重建 | 首屏/回流走快照免整树扫描;零原生重编译,对齐 2026-09-21 方向声明 | dsh-forge-m2/design/tech-design.md §Overview/§Data Models |
| 2026-09-22 | dsh-forge-m2 | 必备插件不可禁用 = 双层防护:清单 mandatory 只读分区 + 覆盖文件仅纳第三方 + 守卫 | 打包后 resources 只读,运行时态必在 userData;纵深防御保 SC6 | dsh-forge-m2/design/tech-design.md §Interface 4 |
| 2026-09-22 | dsh-forge-m2 | 工作台渲染载体 = forge 核心插件注入上游 GUI,导航槽位优先,插件内 rail 降级 | 与上游 UI 融合且保 G6 零壳代码改动;两形态行为契约一致 | dsh-forge-m2/design/tech-design.md §Overview D3 |
| 2026-09-22 | dsh-forge-m2 | 数据面分工:主数据走 Electron 内核 IPC,forge CLI 执行面走插件 host 半身 | 对齐「过渡 = 插件宿主半身 spawn CLI」与数据内核入壳两既定方向 | dsh-forge-m2/design/tech-design.md §Architecture |
| 2026-09-22 | dsh-forge-m2 | DF003 感知 = fs.watch 递归 + 400ms debounce + 2s 轮询兜底;来源序 actor→挂接推断 | ≤5s 时效内零新增依赖;forge 不改时推断兜底不阻塞 | dsh-forge-m2/design/tech-design.md §Interface 3 |
| 2026-09-23 | dsh-forge-m3 | SoT 分治:任务结构化状态以 SQLite 为权威(单写者 = 内核),`tasks/index.json` 一次性显式迁移后终态淘汰;任务/记录 md 与阶段资产留文件不入库,随文档根(默认仓外,仓内兼容) | 根除 index.json 多写者风险(SC8 spike §4 旧写者静默丢未知字段);文档 git 评审面保底;拒绝「全量入库」(评审断裂/迁移面翻倍)与「全量留文件」(多写者永续)两端 | proposals/dsh-forge-m3/proposal.md §Proposed Solution 架构约束、§Assumptions Challenged;features/dsh-forge-m3 prd/prd-spec.md §阶段资产与文档根数据模型 |
| 2026-09-23 | dsh-forge-m3 | 任务状态机载体 = TS 原生移植入内核(7 态状态机 + 依赖解析),配 Go 对拍器保证行为等价 | 零原生重编译、三平台与零 npm 依赖纪律;弃 Go 嵌入库与 CLI 包裹(SC1) | dsh-forge-m3/design/tech-design.md §Overview 裁决 T1 |
| 2026-09-23 | dsh-forge-m3 | dsh tool→内核通道 = renderer 桥接:host cordis rpc → client 半身 tool 桥 → 既有 IPC 白名单 | 零新增监听面;动词面封闭;桥不可用重试一次后明确提示(禁静默) | 同上 §Interface 2 裁决 T2 |
| 2026-09-23 | dsh-forge-m3 | 已迁移项目外部写 = watcher 检出后幂等自动重摄入 + 项目/feature 偏离标记,不阻断外部会话 | SQLite 保持权威一致、偏离可观察;弃「仅告警不摄入」(持续分叉) | 同上 §Interface 4 裁决 T3 |
| 2026-09-23 | dsh-forge-m3 | systemPrompt 预合成归内核(三要素确定性组装 + prompt_hash 落库),host 半身仅持 subagent 创建 | 三要素数据(偏好/阶段资产)在内核,单查询可断言;host 合成则双查询且断言弱 | 同上 §Interface 3/§Appendix |
| 2026-09-28 | dsh-forge-m4 | 工作台承载 = 原生 home 增强层:conversation 面板 + 左栏 sidebar.workspaces 座位注入 + 原生 rightbar 挂 forge tabs | 会话视图零重挂载、启动首屏天然成立(默认面板)、分屏用原生 pane;弃 forge 主面板自建容器 | dsh-forge-m4/design/tech-design.md §Overview 裁决 T1 |
| 2026-10-02 | dsh-forge-p1-mvp | 数据内核合一为 core(forge 域 + 知识域双模块,对外双服务 forgeProjects/forgeKnowledge,单 SQLite 句柄),knowledge 仅存 dsh 插件;沉淀分离降为模块级禁令 | L1「sqlite 句柄唯一持有」与独立知识包写库互斥;包级分离属预设,提炼判据触发时再机械抽包 | dsh-forge-p1-mvp/design/tech-design.md §Architecture |
| 2026-10-02 | dsh-forge-p1-mvp | 五工件定名 apps/{host,web} + packages/{contracts,core,knowledge};子模块基础/业务二分 + 依赖铁律 + 修改落点速查 | 业界常规命名通俗(state-layer 行话/plugin-knowledge 冗长);总纲「应用状态层」保留为概念术语;二分防业务混基础与改错地方 | dsh-forge-p1-mvp/design/tech-design.md §Monorepo |
