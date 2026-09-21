---
created: "2026-09-21"
author: "faner"
status: Draft
intent: "new-feature"
---

# Proposal: UI 插件工程基座 —— vendor-free 插件路线(硬前置 dsh-forge-m2)

> **定位**:主提案「一切皆插件」约束在 UI 插件工程上的落地基座。技术论证与源码级证据全部继承 `docs/proposals/dsh-forge/ui-plugin-vendor-free.md`(2026-09-21,下称「技术方向文档」),本文不重复论证,只在提案层定范围、验收与风险。**与 M2 关系:硬前置**——本基座(至少 spike + bundle 配置化)完成后,dsh-forge-m2 的 UI 插件任务方可开工;M2 SC8 语义等价性 spike(agent 语义面)留在 M2,与本提案的装配路线 spike 验证面不同,互不替代。

## Problem

核心问题一句话:**M2 的全部 forge 能力 UI 都要以 dsh 客户端插件形态交付,但当前仓库不具备让任何自有插件存在与被装配的工程基座——bundle 清单焊死在壳代码常量里、插件依赖与 vendored 运行时的版本对齐无自动保障、装配路线的三项关键行为未经源码级验证。**

### Evidence

- **bundle 清单焊死**(2026-09-21 本仓核查):`apps/desktop/src/main/host-profile/index.ts` 的 `HOST_PROFILE_BUNDLES` 为壳代码内硬编码常量——任何自有插件进入壳都必须改壳代码,直接违反「一切皆插件」(技术方向文档 §5 已标记为 M2 必做的设计修正)。
- **版本对齐无保障**(npm registry 2026-09-21 实测,技术方向文档 §2):客户端插件契约族 `@deepseek-ai/dsh-client-*` 已发 npm,但 dist-tag `latest` 停在旧版 `0.0.1-rc.1`,现行线在 `alpha` tag(`0.1.6-alpha.2`);裸装或 `^` 范围会静默拿到旧契约。插件依赖版本必须 ≡ `vendor/upstream.lock.json` 的 `desktopHostVersion`(当前 `0.1.6-alpha.2`,本仓核查),该对齐目前纯靠人工。
- **装配路线三项未验证**(技术方向文档 §8,当前为推断/外部证据):① `dsh plugin add` 对壳自有 profile 目录(userData 下)的行为;② profile node_modules 物化对 out-of-tree bundle 的解析细节(dev `link:` 与 prod tarball 两种形态);③ `inject` 依赖边以非官方包(自有插件)为声明方的完整语义。
- **M2 已被阻塞在 PRD 阶段等待此基座**:`docs/features/dsh-forge-m2/`(prd 三件套已就绪)的 G6 要求 forge 能力 100% 以可启停插件交付、禁用回归纯壳——没有本基座,M2 的第一个 UI 插件任务无法起步。

### Urgency

- **M2 关键路径**:基座(配置化 + spike 结论)是 M2 UI 插件任务的硬前置,M2 PRD 已完成,每晚一天基座,M2 空转一天。
- **上游演进窗口**:dsh 处于 0.1.x alpha 周快速演进期,版本对齐纪律必须在**第一个**自有插件诞生前建立——先有插件再补纪律,错配会以静默契约漂移的形式累积(技术方向文档 §7 已列为固有成本)。
- **成本复利**:三项未验证项直接开发任务可视化插件 = 在未验证地基上盖楼;spike 若推翻假设,返工面是 M2 全部 UI 任务;现在验证,返工面收敛为一个 hello-world。

## Proposed Solution

交付**工程基座**而非业务功能:一个双向扩展演示插件 + 壳侧配置化 + 可复用模板 + 版本一致性自动断言,四件套让「自有插件可以存在、可以被装配、第三方可以照做」。

### 架构关系图(分层定位,约束的可视化)

```mermaid
flowchart TB
    user(["用户（作者本人 / 社区实践者 / 第三方插件作者）"])

    subgraph SHELL["Electron 壳 —— 运行宿主 + 产品数据内核(必备,仅作者维护)"]
        S1["托盘 / 系统通知 / 更新检测 / 崩溃恢复 / 单实例锁"]
        S2["dsh-app:// 承载 Web 资源与 API 流量(无监听端口)"]
        S3["spawn 宿主子进程(进程足迹 = 2,M1 继承)"]
        DL["产品数据层 · SQLite(方向声明,M2/M3 落地)<br/>任务索引 · 项目↔会话挂接 · 工作台自有状态<br/>数据 API · 任务 CRUD 等"]
    end

    subgraph DSH["dsh —— 业务底座(vendored desktop-host,pinned 0.1.6-alpha.2)"]
        H1["会话 / agent / 凭据($DSH_HOME 多装共存)"]
        H2["插件加载 · profile bundles 物化<br/>清单 = 产品级配置(本提案配置化,迁出壳代码)"]
        H3["boot graph(__DSH_BOOT__)推送"]
    end

    subgraph PLUGINS["客户端插件树(Webview 侧)—— ui-slots 槽位体系"]
        subgraph OFFI["官方能力插件 · bundle 清单驱动"]
            O1["ui-chat / ui-renderer / ui-goal …<br/>持有基座槽位"]
        end
        subgraph FORGEPL["forge 能力插件 · 必备(→M2)· 内置 bundle 分发 · 仅作者维护"]
            F1["任务看板 / feature 看板 / 会话挂接<br/>消费基座槽位 + 复用 dsh 组件体系<br/>贡献自有槽位供第三方扩展"]
        end
        subgraph THIRDPL["第三方插件 · 用户自装"]
            T1["dsh plugin add 安装<br/>注入基座槽位或工作台槽位<br/>工程模板起步(本提案产出)"]
        end
        FORGE[("forge 能力<br/>现形态：CLI + 文件 · M2 数据面<br/>演进终点：应用 API + dsh tool<br/>CLI 不保留 · 非本提案")]
    end

    user -->|OS 级交互| SHELL
    user -->|看板 / 会话交互| PLUGINS
    user -.->|照模板写插件| THIRDPL
    S3 ==>|子进程 + 分帧管道| DSH
    H3 ==>|carrier 通道:__DSH_TRANSPORT__| PLUGINS
    H2 -->|物化| O1
    H2 -->|物化 · 读同一配置| F1
    user -.->|plugin add| THIRDPL
    O1 -.基座槽位注入.-> F1
    O1 -.基座槽位注入.-> T1
    F1 -.贡献自有槽位.-> T1
    F1 <-.宿主半身调用：spawn CLI（过渡）→ 应用 API / dsh tool（终点）.-> FORGE
    DL -.数据 API · 任务 CRUD · M2/M3.-> F1
```

**四条架构约束(效果级,技术选型归 /tech-design)**:

1. **分层定位:运行宿主 + 产品数据内核**:Electron 壳 = OS 级宿主职责(M1 既有面)+ **产品数据内核(方向声明,用户定向 2026-09-21)**——任务索引、项目↔会话挂接、工作台自有状态采用 **SQLite** 存储,置于 Electron 侧,提供数据 API(特别是任务 CRUD);**落地为 M2/M3 任务**,事实源关系(forge 文件 vs SQLite)与 API 形态届时设计。dsh 仍为会话/插件业务底座(会话、agent、插件机制、客户端槽位体系)。诚实声明:数据内核进壳**偏离官方壳极小产品 API 面模式**(`DshDesktopProductApi` protocolVersion 1 仅 `updates`,2026-09-21 源码核查;业务原生能力官方钦点宿主侧插件,`allowBuilds: node-pty/koffi/fs-ext`)——这是 dsh-forge 作为**产品壳**(非兼容壳)的自主选择;纪律:preload IPC 面沿用 M1 electron-ipc-security 约束(origin-lock、typed、版本化、最小必要面)。
2. **UI 复用与槽位保留**:forge 能力插件的 UI 构建在 dsh 客户端组件体系上(沿用 M1 上游 tokens 路线),不自建第二套组件体系;槽位体系保留并向下扩展——工作台 UI(→M2)在既有 ui-slots 体系上组装,并**贡献自有槽位**,第三方插件可扩展工作台。
3. **必备与扩展两级插件模型**:forge 核心能力是 dsh-forge 的**必备能力**——以必备插件形态内置 bundle 分发(消费基座槽位 + 复用 dsh 组件体系 + 贡献自有槽位),**不可禁用、不可被第三方修改,仅作者维护升级**;第三方用户可经 `dsh plugin add` 添加扩展插件,注入基座槽位或工作台槽位,与必备插件同机制共存、互不垄断;插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内)。原「可启停/禁用回归纯壳」语义收缩至第三方插件(M2 G6/SC6 记账修订,见 Next Steps)。
4. **forge 能力形态演进与调度插件化**:forge 特色能力是本应用的差异化价值核心,以必备能力随产品交付。形态演进:CLI 为过渡形态(插件宿主半身 spawn Go CLI,经标准 rpc 暴露,二进制随包分发)→ 演进终点 = **应用 API(Electron 数据内核)+ dsh tool**,**CLI 不保留**(用户定向 2026-09-21;具体形态由 M2 语义等价性 spike 与 M4 设计定,禁止预判)。**任务调度机制(领取分配、依赖解析、状态机编排)插件化**——可随产品演进替换,不动数据内核。

**交付件行为**:① hello-world 插件以纯 npm 依赖起包(exact `0.1.6-alpha.2`),零 vendored 文件引用,**注入既有稳定槽位 + 贡献一个自有子槽位**(ui-slots 的 `register` 原生支持「组件 + 子槽位 + store 席位」),演示消费与贡献双向扩展;② 同一插件在官方 `dsh web`(第三方用户视角)与 dsh-forge 壳(经产品级配置装配)双环境跑通;③ `HOST_PROFILE_BUNDLES` 迁出壳代码为产品级配置,配置成为插件树唯一事实源(M2 UF6 启停预留读写同一配置);④ 插件沉淀为工程模板,第三方用户照模板即可给工作台或官方 dsh 写插件;⑤ 版本一致性自动断言(插件依赖 ≡ `desktopHostVersion`,错配即红灯)。

### Innovation Highlights

诚实声明:模板脚手架、CI 版本门禁、pinned vendor 均为标准工程实践,无技术创新。本提案的增量在于约束设计:

- **双向扩展作为一等验收**:常规插件化只验收「我们消费平台槽位」;本提案把「贡献自有槽位供第三方扩展工作台」同时纳入 spike 与模板——扩展性不是文档承诺,是演示过的链路。
- **双环境 = 可移植性证据**:同一插件跑通官方 `dsh web` 与本壳,直接复现 DSH Studio(euanguo/dsh-studio)验证过的双形态分发(外部证据),为 M2+ 可能的插件独立分发保留自由。
- **针对 dist-tag 陷阱的自动断言**:npm `latest` 停旧版是该生态的实测陷阱,「exact 版本纪律 + 断言门禁」把静默契约漂移变成显式红灯——纪律不靠自觉靠机器。

## Requirements Analysis

### Key Scenarios

- **双环境装配(happy)**:hello-world 插件在官方 `dsh web` 以 profile 自装方式注入槽位;同一插件在 dsh-forge 壳内经产品级配置(内置 bundle)装配,贡献的自有子槽位两侧均可见。
- **配置增删(happy)**:仅修改产品级配置,在壳内增加/移除 hello-world,壳行为随配置变化,壳代码零改动。
- **第三方起步(happy)**:社区用户照工程模板新建插件包 → 官方 `dsh web` 注入成功,全程零 vendored 引用、零壳修改。
- **版本错配(edge)**:插件依赖版本与 `UpstreamLock.desktopHostVersion` 不一致 → 自动断言红灯;一致 → 绿灯。
- **spike 推翻假设(error)**:三项未验证项实测结论与推断不符(如 `dsh plugin add` 对壳 profile 目录不可用、out-of-tree bundle 物化失败)→ spike 报告给出修正路线与兜底(内置 bundle 清单路线独立于 `plugin add`;两锚解析各有独立锚点),门控 M2 设计而非带病开工。
- **第三方插件共存(edge)**:用户自装其他插件与工作台插件同时在线,槽位注册互不覆盖、互不破坏。

### Non-Functional Requirements

- 继承 M1 全部 NFR:离线自足、进程足迹 = 2、无监听端口、零侵入 dsh 上游、`$DSH_HOME` 多装共存——本提案不得破坏任何一项。
- 配置化改动不得引入壳启动回归:M1 验收面(SC7 UI 对等、SC9 崩溃恢复)保持绿。
- 插件包体积与构建产物面以上游 `ui-goal` 为参照(小包:宿主半身可空、client 半身经 `exports["./client"]`)。
- 模板文档面向第三方用户,不要求读者接触 dsh-forge 仓的 vendored 树。

### Constraints & Dependencies

- **上游锁定**:vendored SHA `c36ba648` / `0.1.6-alpha.2` 为唯一对齐基准;插件依赖一律 exact 版本或 `alpha` tag,禁裸包名与 `^`(技术方向文档 §2 陷阱)。
- **dsh 插件机制为唯一装配机制**:内置(profile bundle 清单)与运行时(`dsh plugin add`)双形态走同一机制,不发明旁路。
- **npm 发布面依赖**:`@deepseek-ai/dsh-client-*` 族与 cordis 已发 npm(实测),但处于 0.1.x alpha 契约演进期——版本纪律是长期约束,不是一次性动作。
- **顺序依赖**:本提案硬前置 dsh-forge-m2 的 UI 插件任务;M2 SC8(语义等价性 spike)不在本提案内。
- **技术方向文档为论证权威**:源码级事实、npm 实测、装配机制均以其为准(其引用的上游本地 checkout SHA `c36ba648` 为唯一权威源)。

## Alternatives & Industry Benchmarking

### Industry Solutions

- **VS Code 插件生态**:官方脚手架模板(yo code)+ 严格引擎版本声明(`engines.vscode`)+ marketplace——「模板起步 + 版本门禁」的平台工程范式,本提案的模板与断言是其在 dsh 生态的对应物(miniature 版)。
- **DSH Studio(euanguo/dsh-studio,外部证据)**:项目树/Git Review/终端全部为插件且可被 `dsh plugin --profile web add` 装进他人 profile——证明双形态分发在本生态已成立,本提案的双环境验收复现该链路。
- **pinned vendor + lock 对齐**(本仓 M1 既有实践):`vendor/upstream.lock.json` 已是事实基准,断言只是把既有纪律自动化。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing(基座决策散在 M2 首任务临时做) | — | 零新提案成本 | 工程决策悬空进 M2 关键路径;版本纪律晚于第一个插件建立;三项未验证项带病开工 | Rejected: M2 空转 + 返工面放大(用户 2026-09-21) |
| 仅 spike 验证(hello-world 双环境 + 三项结论) | 技术方向 §8 最小切法 | 提案最小 | bundle 配置化、模板、断言仍悬空,M2 首个插件任务还要补工程决策 | Rejected: 基座不完整,硬前置价值打折(用户 2026-09-21) |
| 并入 dsh-forge-m2 作 phase 0 | M2 内组织 | 无跨 feature 协调 | 与 M2 产品范围混杂;验证面(UI 装配 vs agent 语义)耦合;M2 PRD 需返工 | Rejected: 用户选独立提案(2026-09-21) |
| 基座 + 首个真实插件(只读任务列表) | 激进路线 | 最早见真实价值 | 与 M2 PRD 边界扯皮,范围爆炸 | Rejected: 风险不叠加(用户 2026-09-21) |
| **独立工程基座全套(本提案)** | 技术方向 §8 + 用户三轮裁决 | 工程决策前置收敛;M2 关键路径最短;扩展性(双向槽位)成为一等验收 | 单人产品线多一个 feature 的管线开销;基座无直接用户价值,价值在 M2 兑现 | **Selected: 2026-09-21 用户显式选择(单独提案 / 全套范围 / 硬前置)** |

## Feasibility Assessment

### Technical Feasibility

**高**。全部关键事实已源码级/实测核查(技术方向文档 §2-§7):npm 发布面可用、`ui-goal` 提供最小样例、ui-slots 契约零运行时依赖、壳侧引入缝(`host-profile/index.ts` + `HOST_RUNTIME_DIR` 两锚)清晰、M1 验收基建(`scripts/acceptance/live-ui-{probe,sweep}.mjs`)可扩展为壳内验收。剩余不确定性恰好就是三项未验证项——spike 存在的意义即消灭它们,且每项都有兜底路线(§Key Risks)。

### Resource & Timeline

单人产品线,基座量级远小于 M1(21 任务)。hello-world 插件 + 双环境验证以天计;配置化与断言以天计;模板沉淀随 spike 自然产出。风险不在工作量,在 spike 结论修正路线的返工弹性——范围已收敛到 hello-world,返工面最小。

### Dependency Readiness

- npm registry:`@deepseek-ai/dsh-client-*` + cordis 已发布(2026-09-21 实测),无需上游配合。
- 上游源码:本地 checkout SHA `c36ba648` 为唯一权威,零侵入约束不变。
- 壳侧引入缝:M1 已交付,改造点单一(`HOST_PROFILE_BUNDLES`)。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| 自有 UI 插件开发必须引用本仓 vendored 源码 | Assumption Flip(npm 发布面实测) | Overturned:客户端插件契约族与 cordis 均已发 npm,插件可零文件引用 vendored 树(技术方向文档 §2/§4) |
| spike 与工程决策留在 M2 首任务即可,无需独立提案 | Need Gate(更简替代:并入 M2) | Refined→用户裁定独立提案并硬前置;理由 = 工程决策前置收敛 M2 关键路径(2026-09-21;Challenge Override 记录:用户明确选择单独提案) |
| 版本对齐靠 code review 自觉即可 | Stress Test(dist-tag `latest` 停旧版 `0.0.1-rc.1`,alpha 线周演进) | Refined:必须 exact 版本纪律 + 自动断言门禁,把静默漂移变显式红灯 |
| 扩展性 = 我们消费官方槽位 | 用户定向(双向扩展) | Refined:消费基座槽位 + 贡献自有槽位同为一等验收;第三方可扩展工作台本身 |
| hello-world 只需在壳内验证(官方 web 环境多余) | Assumption Flip(官方 web 是第三方用户的真实环境;双环境 = 可移植性证据) | Confirmed:双环境必要,且是 M2+ 插件独立分发的保留自由 |
| 配置化 = 把常量改成本地文件 | 逻辑一致性(M2 UF6 启停需读写同一清单,否则出现第二事实源) | Refined:配置为插件树唯一事实源,M2 UF6 启停读写同一配置,本提案只做静态产品配置起步 |
| forge 核心 API 应参照官方模式集成进 Electron(基础能力由壳提供) | 源码核查 + 两轮用户定向(2026-09-21) | Refined(两轮):第一轮定「集成点 = 插件宿主半身,壳维持极小 API 面」;第二轮用户重新评估——**数据内核(SQLite 任务索引/项目↔会话挂接 + 任务 CRUD API)进 Electron 为产品必备**,会话运行时/调度/UI 保持 dsh 与插件侧,CLI 退役方向不变 |
| 「一切皆插件」= 全部能力可启停、可禁用 | 用户定向(必备能力,2026-09-21) | Refined:两级插件模型——forge 核心 = 必备插件(内置,仅作者维护);启停语义仅第三方插件;M2 G6/SC6 记账修订 |
| 工作台数据(任务索引/挂接)读写经 forge 文件与 CLI 即可,无需应用侧存储 | Stress Test(M2 G1 首屏 ≤2s @500 任务的文件扫描成本、G3 回流 ≤5s;挂接关系无结构化存储) | Refined:SQLite 数据内核方向声明(Electron 侧 + 数据 API),M2/M3 落地,事实源关系与实现届时设计(用户 2026-09-21:现在只做架构约束) |

## Scope

### In Scope

- **hello-world 插件(双向扩展演示)**:npm 依赖起包(exact `0.1.6-alpha.2`),零 vendored 文件引用;注入既有稳定槽位 + 贡献一个自有子槽位;空宿主半身 + client 半身(形态参照上游 `ui-goal`)。
- **双环境装配验证**:官方 `dsh web`(profile 自装,第三方视角)与 dsh-forge 壳(经产品级配置,内置 bundle)各跑通一次——验证两锚解析 + 版本对齐 + 可移植性。
- **三项未验证项结论落档**:`dsh plugin add` 对壳 profile 目录的行为 / profile node_modules 物化对 out-of-tree bundle 的解析 / `inject` 依赖边对非官方包的语义;源码级或实测,归档 spike 报告(含对落地路线的修正)。
- **HOST_PROFILE_BUNDLES 配置化**:bundle 清单从壳代码常量迁到产品级配置;增删插件 = 改配置,壳代码 diff = 0;配置为插件树唯一事实源(M2 UF6 启停预留读写同一配置;运行时启停 UI 本身不在本提案)。
- **插件包工程模板**:hello-world 沉淀为可复用模板,内建槽位消费/贡献标准姿势与 dsh UI 组件复用约定;第三方用户照模板即可给工作台或官方 dsh 写插件。
- **版本一致性自动断言**:插件依赖版本 ≡ `vendor/upstream.lock.json` 的 `desktopHostVersion`,错配即红灯;接入既有 CI/质量门。

### Out of Scope

- 任务可视化插件与一切 forge 能力 UI(→ dsh-forge-m2)。
- SQLite 数据内核与任务 CRUD API 的实现(→ M2/M3;本提案仅落架构约束与方向声明,事实源关系与 API 形态届时设计)。
- 语义等价性 spike(dsh 插件机制 vs forge skill/hook/subagent,→ M2 SC8;验证面不同)。
- 运行时启停 UI(→ M2 UF6;本提案只保证配置为其预留唯一事实源)。
- marketplace 与 `dsh plugin add` 产品化集成(M2+)。
- 修改 dsh 上游仓库(零侵入约束不变)。
- vendored desktop-host 子进程退役(长期演进项,上游发 npm 后另行提案)。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| spike 推翻装配假设(`plugin add` 对壳 profile 目录不可用 / out-of-tree 物化失败 / inject 语义不完整) | M | M | 兜底已备:内置 bundle 清单路线独立于 `plugin add`;两锚(vendored runtime dir / `$DSH_HOME`)各有独立解析;spike 报告给修正路线并门控 M2 设计——这正是 spike 的目的 |
| 上游 0.1.x alpha 契约演进,断言与模板过期 | M | M | 版本断言与上游 SHA 升级任务同 diff bump(技术方向文档 §4 纪律);断言红灯即升级提醒,不静默 |
| inject 依赖边选到不稳定基座,脆性放大 | M | M | 只选稳定基座(ui-slots / ui-chat / ui-renderer 核心槽,技术方向文档 §7);spike 实测确认 |
| 配置化改动壳启动路径引入回归 | L | M | 改造点单一;M1 验收面(SC7/SC9)回归跑;live-ui-probe/sweep 扩展覆盖 |
| 第三方插件与工作台插件槽位冲突(共存破坏) | L | M | hello-world 贡献的子槽位即共存验证载体;遵循 ui-slots 声明合并契约,不垄断槽位;M2 真实工作台时再验真实冲突面 |
| 数据内核进壳扩大 preload IPC 安全面(偏离官方极小面模式) | M | M | 沿用 M1 electron-ipc-security 约束(origin-lock、typed、版本化、最小必要面);API 面随 M2/M3 设计逐项评审 |
| 两级插件模型与 M2 PRD 不同步(G6/SC6/DF001/DF005 口径) | M | M | 本提案 Next Steps 记账;M2 进入设计阶段前修订 PRD,再任务分解 |
| dist-tag 陷阱误装旧契约(latest 停 0.0.1-rc.1) | M | H | 全部依赖 exact 版本;自动断言拦截;模板文档明示禁裸包名/`^` |

## Success Criteria

- [ ] SC1 双环境双向装配:同一 hello-world 插件(零 vendored 文件引用,构建产物面可验证)在官方 `dsh web` 与 dsh-forge 壳内均完成装配——注入的基座槽位与贡献的自有子槽位在**两侧环境**均可见渲染;壳内装配走产品级配置路径,不引入新的壳内硬编码。
- [ ] SC2 配置化生效:仅修改产品级配置在壳内增、删 hello-world 各一次,壳行为随配置变化,两次操作的壳代码 diff = 0(git diff 验证)。
- [ ] SC3 版本断言:断言接入 CI/质量门——人为错配插件依赖版本 → 断言失败(红灯复现并归档);当前依赖 exact `0.1.6-alpha.2` == `UpstreamLock.desktopHostVersion` → 绿灯。
- [ ] SC4 未验证项落档:三项(`plugin add` 对壳 profile 目录行为 / out-of-tree bundle 物化解析 / inject 依赖边非官方包语义)各给出源码级或实测结论,归档 spike 报告,含对落地路线的修正与兜底建议。
- [ ] SC5 模板可用:按模板文档从零新建插件包到官方 `dsh web` 注入成功,全程零 vendored 引用、零壳代码修改(演示记录归档)。

> SC 一致性核查(2026-09-21):SC1↔In1/In2(双向 + 双环境)、SC2↔In4、SC3↔In6、SC4↔In3、SC5↔In5,In Scope 六项均有 SC 覆盖,SC 间无冲突(SC2 依赖 SC1 的配置化装配路径,时序为 SC1 ⊂ SC2 的前提,非矛盾)。

## Next Steps

- Proceed to `/write-prd` to formalize requirements(PRD 覆盖基座六项;技术方向文档 + 本文架构图为源码导航)。
- 技术选型待 `/tech-design`:产品级配置的文件形态与读取时机、模板的目录与产出方式(deggit/脚本/文档化参照)、断言的实现载体(CI 步骤 vs 质量门 hook)、hello-world 插件在本仓 workspace 的落位。
- M2 侧记账:dsh-forge-m2 的 PRD/manifest 增补对本提案的引用(依赖关系声明);并按两级插件模型修订 G6/SC6(必备能力语义,「禁用回归纯壳」收缩至第三方插件)、DF001/DF005(SQLite 数据内核与事实源开放问题)。
