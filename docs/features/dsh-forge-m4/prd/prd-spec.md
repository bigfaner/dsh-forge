---
feature: "dsh-forge-m4"
status: Draft
db-schema: "yes"
created: "2026-09-24"
---

# dsh-forge M4 — 项目中心工作台(IA 基石)· PRD Spec

> 权威链:`docs/proposals/dsh-forge-m4/proposal.md`(范围与验收唯一权威,2026-09-24 修订版)→ 本 PRD(需求定形)。路线图语境:M5 = 任务调度补全,M6 = 质量与收口,M7 = 模式化管线。硬前置:dsh-forge-m3 完成(本 PRD 属提案允许的提前并行纸面工作)。

<!-- Override: Security review enabled by signal "权限/IPC 安全"(投影写入通道权限面) -->
<!-- Override: Performance baseline enabled by signal "性能预算/首屏 ≤2s" -->

## Background

### Why (Reason)

项目是用户围绕开展工作的中心,但应用 UI 没有「项目」这个一等载体:dsh 原生会话列表按 workspace/未分组散置,forge 看板/提案板是独立平铺视图,M3 起过程文档默认仓外;代码会话、worktree 状态、看板、提案、文档分居多处,人与 agent 都无法快速识别「这个项目有什么」。两套项目体系(dsh workspaceRegistry × dsh-forge SQLite 注册表)并存互不感知。后续一切能力(M5 bug/todo 看板、M7 管线视图、知识区)都以项目页为挂载点——IA 是承重层,必须先定形。

### What (Target)

M4 = **「项目中心工作台」**:信息架构全面重构为项目中心。项目 = **代码区 + forge 文件区 + 知识区(后续引入,仅扩展位)** 三区容器;五项交付:①项目一级导航重组 ②三区容器项目页(含 subagent 归拢、feature 阶段感知)③workspaceRegistry 单向投影 ④项目内分屏/多窗口 ⑤任务↔会话绑定反查。

### PRD 期裁决(2026-09-23/24,用户显式选择)

1. **归档投影处置**:归档项目 → dsh 侧 workspace **保留**,会话**仍按项目分组**;forge 侧项目会话列表不再展示(移入归档分区)。删除项目 → 移除 workspace(会话按 dsh 语义退未分组)。语义:归档 ≠ 删除。
2. **subagent 挂接机制**:**血缘推断**(任务 → active 挂接顶层会话 → 血缘树内 `origin=subagent` 会话 = 执行会话),不落库;派发 prompt **约定执行 subagent 以任务标识(id + title)命名**(可读性 + 双重校验,非绑定权威)。M5 备注:若引入一话多任务管线,M5 派发协议重构时补回写(任务级精度)。
3. **「正在执行的任务」判定**:`status=in_progress` **且存在 active 挂接** → 执行中(突出展示,可点击打开 subagent 会话);`in_progress` 无 active 挂接 → 常规展示 + 「未挂接会话」标注。
4. **Phase 划分**:四阶段(P1 导航+项目页骨架 → P2 forge 文件区收纳+任务↔会话反查+回归盘点 → P3 单向投影 → P4 分屏/多窗口+全量验收),每 phase 设 gate。

### Who (Users)

- **编排者(人)**:单人产品线作者,围绕项目开展编排、发起与观察;要求项目相关内容汇总一处、快速识别。
- **执行 agent**:会话内执行任务的主体(forge:task-executor 等),其顶层会话与 subagent 会话需被项目/任务维度识别(操作主体模型:agent 写、人编排观察)。

## Goals

| Goal | Metric | Notes |
|------|--------|-------|
| 项目成为 IA 一级载体 | 孤儿视图 0 个(e2e 断言) | 全部视图以项目为一级组织 |
| 项目内容汇总一处 | 三区容器页承载全部项目资产(断言) | 知识区零空占位 |
| 两侧项目归属一致 | 投影同名同序;派发会话归组正确(断言) | 单向投影,失败降级不阻断 |
| 任务↔会话互达 | 任务→会话打开 = 1 次点击(SC7/SC8 e2e) | 含 subagent 会话 |
| 既有功能零缩水 | e2e 回归全绿;功能删除 0 | 迁移清单全量盘点 |
| 性能不劣化 | 项目工作台首屏 ≤2s(500 任务规模);视图切换不劣于重构前 | 性能断言 |

## Scope

### In Scope

- [ ] 项目一级导航重组:全部视图以项目为一级组织;项目列表入口;孤儿视图清零;单向一次切换(无长期双轨)。
- [ ] 三区容器项目页:代码区(会话列表/worktree/工作区状态;subagent 归拢)、forge 文件区(feature 组织、提案板、管线入口收纳,功能面零缩水)、知识区扩展位(无空占位)。
- [ ] 任务↔会话绑定反查:任务维度标识绑定会话(含执行 subagent),任务→会话打开(顶层走 session-focus、subagent 走 SubagentAddress);subagent 会话视图展示任务元数据。
- [ ] feature 组织与阶段感知:任务面板从属于 feature;feature 视图按阶段展示重点信息,执行阶段突出正在执行的任务(点击打开其 subagent 会话)。
- [ ] workspaceRegistry 单向投影:注册/改名/归档/删除同步(同名同序)、派发会话归组、dsh 侧手改不回流仅提示、投影失败降级不阻断。
- [ ] 项目内分屏与多窗口布局,布局状态随项目记忆。
- [ ] 三区位置文件选择器(注册向导/项目设置)与校验规则。
- [ ] IA 回归盘点:既有 e2e 规格迁移清单与零缩水验收。

### Out of Scope

- SDD 模式体系(SDD / Quick SDD preset)与 GUI 原生管线视图(→ M7;管线入口本里程碑仅为导航占位)。
- 事件驱动对账、bug 看板与自动上报、todo 便签板(→ M5)。
- 知识库与知识区 UI/数据模型(后续里程碑;仅 IA 扩展位,不提供知识区选择器)。
- 对抗式评估器、Quality Gate UI、CC 插件与 forge 仓 CLI 发布收口(→ M6)。
- 测试用例管理;人侧任务写 UI;多仓协调(条目 16)、多端协同(条目 21);wiki 对接。
- 双向 workspace 同步;修改 dsh 上游仓库(零侵入约束)。
- subagent 挂接的派发回写机制(→ M5 备注备查,本里程碑血缘推断)。

## Flow Description

### Business Flow Description

**主流程**:启动 → 项目列表页(无项目 → 注册向导空态)→ 打开项目 → 项目工作台(代码区 | forge 文件区 | 知识区扩展位)→ forge 文件区以 feature 为组织中心 → feature 视图按阶段呈现重点信息 → 执行阶段突出「正在执行的任务」→ 点击执行中任务 → 血缘推断解析 subagent 会话 → 打开 subagent 会话(任务元数据可见)。

**注册/三区选择流**:注册向导经文件选择器选定代码区(必填,存在目录)与 forge 文件区(必填,默认承接 M3 文档根)→ 路径校验(存在性/可写性/跨项目唯一)→ 非法路径即时提示、留在向导修正 → 合法 → 注册项目 + 投影写入 workspaceRegistry。(2026-09-26 修订:注册 = 添加项目确认卡,唯一必答代码区;见必答③注记与 UF7。)

**投影生命周期流**:注册 → workspace 新增(同名);改名 → workspace 同步改名;归档 → workspace 保留、forge 侧移入归档分区;删除 → workspace 移除(会话退未分组)。dsh 侧手改 workspace → forge 侧不回流,启动/刷新对账呈现偏差提示(仅提示)。

**降级流**:投影写入失败/workspace 不可写 → 降级为无投影继续运行,注册不阻断,提示可手动重试;恢复后重试投影成功即两侧一致。

### Business Flow Diagram

```mermaid
flowchart TD
    Start([启动应用]) --> PList[项目列表页]
    PList --> HasProj{有项目?}
    HasProj -->|否| Wizard[注册向导:三区位置文件选择器]
    HasProj -->|是| OpenProj[打开项目 → 项目工作台]
    Wizard --> Valid{路径校验合法?}
    Valid -->|非法| Err[即时提示,留在向导修正] --> Wizard
    Valid -->|合法| Reg[注册项目]
    Reg --> Proj[投影写入 workspaceRegistry]
    Proj --> ProjOK{投影成功?}
    ProjOK -->|失败| Degrade[降级:无投影继续 + 可重试提示] --> OpenProj
    ProjOK -->|成功| OpenProj
    OpenProj --> WB[三区容器:代码区 | forge 文件区 | 知识区扩展位]
    WB --> ExecFocus[feature 执行态聚焦]
    ExecFocus --> ExecTask{存在执行中任务?<br/>in_progress + active 挂接}
    ExecTask -->|有| Click[点击执行中任务]
    ExecTask -->|无| NoExec[常规任务面板<br/>in_progress 未挂接者标注]
    Click --> Infer[血缘推断:active 顶层会话 → subagent 后代]
    Infer --> SubOK{命中执行 subagent?}
    SubOK -->|是| OpenSub[打开 subagent 会话<br/>任务元数据可见]
    SubOK -->|否| OpenTop[打开顶层派发会话]
    WB --> DevChk{dsh 侧手改 workspace?}
    DevChk -->|是| DevTip[偏差提示,不回流]
    DevChk -->|否| WB
```

### Data Flow Description

| Data Flow ID | Source System | Target System | Data Content | Transport | Frequency | Format | Notes |
|-----------|--------|----------|----------|----------|------|------|------|
| DF001 | forge 项目注册表(SQLite,权威) | dsh workspaceRegistry(投影) | 项目条目(名称/顺序/归档保留/删除移除) | host 半身通道(设计期定形) | 注册/改名/归档/删除时 | 内部协议 | 单向;失败降级不阻断 |
| DF002 | dsh 会话头(cwd) | workspace 归组 | 会话→项目归属 | dsh 原生机制 | 会话创建时 | 内部 | 归组断言基础 |
| DF003 | session_links + 会话血缘索引 | 任务↔会话反查视图 | active/ended 挂接 + subagent 后代会话 | 应用内只读查询 | 视图渲染/点击时 | 内部 | 血缘推断,不落库 |
| DF004 | dsh 侧 workspace 手工变更 | forge 偏差提示 | 偏差事实(改名/删除/乱序) | 启动/刷新对账 | 低频 | 内部 | 仅提示,禁止反向写 |

## Functional Specs

> UI 功能规格详见 [prd-ui-functions.md](./prd-ui-functions.md)(UF1-UF10)。

### 三区 IA 信息架构稿(PRD 必答①)

层级树(信息架构母模型):

```
应用
└─ 项目列表(启动首屏;含归档分区)
   └─ 项目工作台(三区容器)
      ├─ 代码区:会话列表(parent 血缘树 + subagent 收起)/ worktree・工作区状态
      │  └─ 会话视图(顶层 & subagent;后者展示任务元数据)
      ├─ forge 文件区(以 feature 为组织中心)
      │  ├─ feature 视图(阶段感知:prd/design/tasks/in-progress/completed)
      │  │  ├─ 任务面板(从属于 feature)
      │  │  │  └─ 任务详情(绑定会话/挂接历史/一键打开)
      │  │  └─ 阶段资产面板(M3 收纳)
      │  ├─ 提案板(M3 收纳)
      │  └─ 管线入口(导航占位,M7 承接)
      └─ 知识区:扩展位(零空占位,后续里程碑)
```

### 导航迁移清单与切换策略(PRD 必答②)

**策略**:单向一次切换——新结构替换旧导航,不做长期双轨;切换点在 P1 gate。

| # | 既有视图(来源) | 迁移目标 | 契约处理 |
|---|------------|---------|---------|
| 1 | 全局导航(M1-M3) | 项目一级导航(项目列表 → 项目工作台) | 一次性替换 |
| 2 | M2 看板(任务列表) | feature 视图内任务面板(从属 feature) | 路由/组件契约尽量保持 |
| 3 | M3 提案板 | 项目页 forge 文件区 | 收纳重组 |
| 4 | M3 阶段资产面板 | feature 视图内 | 收纳重组 |
| 5 | M3 文档根设置 | 三区位置选择器(注册向导/项目设置) | 承接既有文档根为 forge 文件区默认值 |
| 6 | M3 发起链 | 原位保留(挂接写入不变),入口收进 feature 视图 | 数据面零变更 |
| 7 | M1 会话主面(dsh 原生) | 代码区会话列表(同一底座,项目维度组织) | 复用不重写 |

孤儿视图清零清单(验收对象):迁移后无任何不处于项目上下文的 forge 视图(e2e 断言全量路由归属)。

### 三区位置文件选择器交互与校验(PRD 必答③)

> **2026-09-26 修订(裁决 = `docs/decisions/project-storage-and-knowledge.md` §5 v2,DF 定形以 UF7 与该裁决为准)**:注册交互重构为「添加项目确认卡」—— 代码区为唯一必答;forge 文件区改**文档位置预览行**(证据三档门控:命中 forge 树沿用仓内 / 有 `.git` 仓内新建 / **无 `.git` 应用管理主路径**;零 git 强制);可写性改运行时状态(非注册门槛);`ERR_FORGE_NOT_DETECTED` 废止;仓外授权收窄至高级自定义。下列正文为 M2→M4 演进口径,冲突处以上述裁决为准。

- **代码区**:必填;选择已存在目录;绝对路径。
- **forge 文件区**:必填;默认承接 M3 文档根(仓内/仓外皆合法);可选已存在目录或输入新路径(不存在则提示创建)。
- **知识区**:**不提供选择器**(后续里程碑引入时再加;遵循不建空占位纪律)。
- **校验规则**(即时校验,非法提示不阻断修正):
  - 存在性:代码区必须存在;forge 文件区允许不存在但需确认创建。
  - 可写性:两区路径须可写(探测写入)。
  - 跨项目唯一:同一目录不可注册为两个项目的代码区(继承 M2 注册校验)。
  - 嵌套提示:forge 文件区位于代码区内(仓内 docs/ 形态)合法,仅信息提示。

### 投影语义与降级规则(PRD 必答④)

- **单向**:forge 项目注册表为权威,workspace 为投影;四操作同步——注册(新增,同名)、改名(同步改名)、归档(保留 workspace,见必答⑤)、删除(移除 workspace)。顺序一致性:项目列表顺序 ↔ workspace 顺序。
- **偏差**:dsh 侧手改 workspace(改名/删除/乱序)→ 不回流;启动/刷新对账后 forge 侧呈现偏差提示(说明差异与处理建议)。
- **降级**:投影写入失败或 workspace 不可写 → 降级为无投影继续运行(归属仅 forge 侧可见),注册/改名/归档不被阻断;提供手动重试;恢复后重试成功即两侧一致。
- **不破坏**:未注册目录的既有会话仍显示为未分组;投影不迁移、不删除 dsh 侧既有 workspace 之外的数据。

### 归档与删除语义(PRD 必答⑤)

| 操作 | forge 侧 | dsh 侧 workspace | 会话 |
|------|---------|-----------------|------|
| 归档 | 项目移入归档分区;项目会话列表不再展示 | **保留** | **仍按项目分组**(dsh 侧可按组找回) |
| 删除(归档态或显式) | 项目条目删除 | 移除 | 按 dsh 语义退未分组(不删除) |
| 改名 | 项目名更新 | 同步改名 | 分组随 workspace 保持 |

### subagent 归拢与反查机制(PRD 必答⑥)

- **归拢**(代码区会话列表):
  - subagent 会话归拢于 parent 会话血缘树下,**不出现在顶层列表**;
  - **默认收起**:parent 条目右侧计数徽标(运行中数 / 总数);
  - 点击徽标或条目展开内嵌后代列表;后代数超上限(默认 20)时尾部呈现「查看全部」;
  - 血缘内多级 subagent 同规则递归收起。
- **反查**(任务 → 会话):
  - 数据面 = 血缘推断:任务 → `session_links` active 行的顶层会话 → 该会话血缘树内 `origin=subagent` 会话;纯只读推导,不落库、可随时重算;
  - 任务详情呈现:挂接历史(active/ended)+ 执行 subagent 会话标识 + 一键打开(顶层走 M1 session-focus,subagent 走 dsh 原生 SubagentAddress);
  - feature 执行视图:点击正在执行的任务即达其 subagent 会话(判定见必答③裁决);
  - 代码区会话树上反向标识会话的任务归属(徽标)。
- **命名约定**(可读性 + 双重校验):派发 prompt 约定执行 subagent 以「任务 id + title」命名;UI 以会话名辅助人辨识,推断以血缘为准,两者冲突时以血缘为准。
- **粒度局限与 M5 备注**:同一顶层会话连续执行多个任务时,血缘推断为会话级(标注「该会话执行中」);若 M5 引入一话多任务管线,派发协议重构时补回写(任务级精度)——已记 M5 提案备查。

### feature 阶段重点信息矩阵(PRD 必答⑦)

| 阶段(manifest 词表) | 重点信息 | 交互 |
|----------------------|---------|------|
| prd | PRD 三件套完成度(spec/stories/ui-functions);缺失文档提示 | 下一步引导(/ui-design、/tech-design) |
| design | 设计文档状态与评审状态 | 下一步引导(/breakdown-tasks) |
| tasks | 分解结果(任务总数/相位数);依赖健康(环/断链) | 开工引导(领取/发起) |
| in-progress | **执行进度(完成/总数)**;**正在执行的任务**(判定 = in_progress 且 active 挂接;点击打开其 subagent 会话);in_progress 未挂接者标注「未挂接会话」;blocked/suspended 提醒 | 点击执行中任务 → subagent 会话 |
| completed | 交付摘要;SC 完成度;质量门状态 | 只读回顾 |

### 会话列表 subagent 收起交互(PRD 必答⑧)

见必答⑥「归拢」。补充:徽标计数 = 运行中数 + 历史总数(如「3 运行中 / 12」);展开动画不阻塞列表滚动;收起状态随项目记忆(布局记忆的一部分)。

### 分屏/多窗口行为要求(PRD 必答⑨)

- **分屏**:项目工作台内同屏多视图(典型组合:左会话右看板/任务面板); pane 数量与比例随项目记忆,重进恢复;M1 壳行为(托盘/单实例)不受影响。
- **多窗口**:可从项目工作台将视图(会话/看板)拆出为独立窗口并行观察;独立窗口仍属该应用实例(单实例约束不变);布局(主窗口 pane 结构 + 拆出窗口集合)随项目记忆。
- **交付顺序**:分屏先于多窗口(P4 内先后);与 M1 壳行为的设计级对账归 /tech-design。

### Related Changes

| # | Project | Module | Change Point | Updated Logic |
|------|----------|----------|------------|----------------|
| 1 | dsh-forge-m1 | 壳(托盘/单实例/主窗口) | 多窗口与壳行为对账 | 单实例语义保持;设计期对账 |
| 2 | dsh-forge-m2 | 看板(UF4) | 收纳为 feature 视图内任务面板 | 从属 feature;数据面零变更 |
| 3 | dsh-forge-m2 | session_links | 沿用,不扩列 | subagent 绑定 = 运行时血缘推断 |
| 4 | dsh-forge-m3 | 提案板/阶段资产面板 | 收纳进项目页/feature 视图 | 路由重组,功能零缩水 |
| 5 | dsh-forge-m3 | 文档根设置 | 升级为三区位置选择器 | forge 文件区默认承接文档根 |
| 6 | dsh-forge-m3 | 发起链 | 入口收进 feature 视图;挂接写入不变 | 反查数据面复用 |
| 7 | dsh-forge-m1 | session-focus | 复用为任务→顶层会话打开通道 | subagent 打开走 SubagentAddress(新) |
| 8 | 全局 | 导航结构 | 一次性替换为项目一级导航 | 孤儿视图清零 |

## Other Notes

### Performance Requirements

- 项目工作台首屏 ≤2s(500 任务规模,继承既有预算);视图切换不劣于重构前(性能断言)。
- 投影操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断)。
- 血缘推断为点击时只读计算,不引入常驻索引开销(实现约束:计算 ≤100ms,超时降级为仅顶层会话)。

### Data Requirements

- **数据追踪**:无遥测新增(离线自足)。
- **数据初始化**:项目表扩展列(三区路径/归档状态/投影状态/布局记忆)均带默认值;存量项目自动迁移(forge 文件区默认 = M3 文档根)。
- **数据迁移**:无破坏性迁移;SQLite schema 演进(加列/加表),升级路径向后兼容。
- **布局记忆**:按项目存储(pane 结构/收起状态/拆出窗口集合),项目删除时随之清除。

### Monitoring Requirements

- 离线桌面应用,无外部监控;投影降级与偏差提示以本地 UI 呈现(用户可见即达);诊断信息进本地日志(继承 M1 日志纪律)。

### Security Requirements

- IPC 继承 electron-ipc-security 约束:origin-lock、typed、版本化、最小必要面。
- 投影写入通道(host 半身)权限面设计期验证:仅项目条目级写操作,最小授权;血缘/SubagentAddress 仅只读消费。
- 文件选择器路径经既有安全通道传递,无 shell 注入面(路径校验在主进程)。

### 继承约束(Non-Functional,来自提案与 M1-M3)

两级插件模型(视图重组在插件槽位体系内);宿主与协议缝;零侵入上游;收纳不推倒(路由/组件契约尽量保持);中英双语;三平台;离线自足;workspaceRegistry/SubagentAddress 契约以 dsh 本地源码为唯一权威。

## Phase 规划(四阶段,每 phase 设 gate)

| Phase | 范围 | Gate |
|-------|------|------|
| P1 | 项目一级导航重组 + 项目页骨架:项目列表页、三区容器布局、代码区会话列表归组、subagent 收起、注册/设置三区选择器、导航一次切换 | SC1 + SC2 布局面;迁移清单执行完毕 |
| P2 | forge 文件区收纳:feature 组织/任务面板从属/阶段感知 + 任务↔会话反查 + subagent 会话元数据 + 回归盘点定稿 | SC2 全量 + SC7 + SC8;回归清单全绿基线 |
| P3 | workspaceRegistry 单向投影:四操作同步、归组、偏差提示、降级 | SC3 |
| P4 | 分屏/多窗口 + 布局记忆 + 全量验收 | SC4 + SC5 + SC6;里程碑收口 |

## Test Pipeline

- **单元**:投影语义纯函数(同名同序/归档保留/删除移除/降级);血缘推断(命中/未命中/多后代/上限);执行中判定(in_progress × active 挂接矩阵);路径校验规则;布局记忆序列化。
- **e2e(Playwright,web surface)**:SC1-SC8 逐条断言;M1-M3 既有 e2e 规格按迁移清单全量迁移并保持全绿(零功能删除断言);执行单实例锁纪律(全量 e2e 前核查本机活跃实例)。
- **性能断言**:首屏 ≤2s@500 任务;视图切换对比重构前不劣化;投影操作 ≤2s。
- **回归收口**:quality-gate 全量通过。

## Success Criteria(M4 里程碑验收)

- [ ] SC1 项目一级导航:全部视图以项目为一级导航组织,打开项目进入项目工作台;原全局平铺的 forge 视图全部收纳进项目上下文,孤儿视图清零(e2e 断言)。
- [ ] SC2 三区容器:项目页同时呈现代码区(会话列表/worktree/工作区状态)与 forge 文件区(任务面板从属于 feature;提案板/管线入口),项目相关内容汇总一处;知识区零空占位(断言)。
- [ ] SC3 单向投影:注册后 dsh 侧存在同名条目且顺序一致(断言);改名同步;归档 = workspace 保留 + forge 侧归档分区(断言);删除 = workspace 移除(断言);派发会话在 dsh 原生 UI 归组正确(断言);dsh 侧手工变更不回流且呈现偏差提示;投影失败降级不阻断注册(e2e)。
- [ ] SC4 分屏/多窗口:项目内可分屏同屏(会话 + 看板组合)与多窗口并行;布局状态随项目记忆,重进恢复(e2e)。
- [ ] SC5 零缩水回归:既有 M1-M3 功能面在 IA 重构后完整可用,迁移后的 e2e 规格全绿(回归清单见必答②,零功能删除断言)。
- [ ] SC6 性能预算:项目工作台首屏 ≤2s(500 任务规模)且视图切换不劣于重构前(性能断言)。
- [ ] SC7 任务↔会话反查:任务详情呈现挂接历史;执行 subagent 会话在任务维度可标识;从任务可打开顶层派发会话与 subagent 会话(e2e 断言);subagent 会话不出现在项目会话列表顶层、归拢于 parent 血缘树下且默认收起(断言);subagent 会话视图展示所执行任务的元数据(断言)。
- [ ] SC8 feature 阶段感知:feature 视图按阶段呈现重点信息;执行阶段有任务执行中时突出呈现,点击可打开其对应 subagent 会话(e2e 断言);in_progress 未挂接任务标注「未挂接会话」(断言)。

## Quality Checklist

- [x] Is the requirement title accurate and descriptive
- [x] Does the background include all three elements: reason, target, users
- [x] Are the goals quantified
- [x] Is the flow description complete
- [x] Does the business flow diagram exist (Mermaid format, with decision + exception branches)
- [x] Is prd-ui-functions.md referenced and UI specs complete
- [x] Are related changes thoroughly analyzed(M1-M3 迁移映射全量)
- [x] Are non-functional requirements considered (performance / data / monitoring / security)
- [x] Are all tables filled completely
- [x] Is there any ambiguous or vague wording(必答①-⑨已消除关键模糊)
- [x] Is the spec actionable and verifiable(SC1-SC8 逐条可断言)
