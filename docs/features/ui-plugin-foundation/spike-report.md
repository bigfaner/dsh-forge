---
created: "2026-09-22"
author: "task 5 (ui-plugin-foundation)"
status: archived-spike
---

# 装配路线三项未验证项 spike 结论落档(任务 5)

> **定位与消费方**:① M2 设计的门控输入(三项结论均落档后方可开工 M2 UI 插件任务,与 M2 PRD 修订为耦合双门槛,见提案 Urgency);② 任务 6「打包/闭包验收腿」的形态输入(分发形态结论在 §4);③ M2 真实工作台槽位设计的先天输入(SC6 移交语在 §5)。
>
> **证据等级纪律**:本报告每条结论标注「源码级」或「实测」;外部证据显式标注。全部源码级事实**内联**于附录 A 并锚定 vendored 树(`packages/desktop-host-vendor/vendored`,pinned SHA `c36ba648dc106d21fb32562793b3e3b9c8922bc4` = `vendor/upstream.lock.json` 的 `pinnedSha`,`desktopHostVersion 0.1.6-alpha.2`),**不传递依赖**技术方向文档(`docs/proposals/dsh-forge/ui-plugin-vendor-free.md`)的现状。注:上游本地 checkout(`Z:\project\github\deepseek-harness`)HEAD 已前移至 `4052914c`,不再等于钉定 SHA,故源码核查一律以本仓 vendored 投影为唯一权威(与任务书锚定声明一致)。
>
> **实测证据来源**:任务 3 归档 `docs/features/ui-plugin-foundation/dsh-web-assembly-evidence.md`(2026-09-22 本机 live 链路,下称「任务 3 证据」);任务 2 的壳内配置化交付(本仓 `apps/desktop/src/main/host-profile/index.ts` + `apps/desktop/resources/plugin-bundles.json`)。

## 0. 总览:三项结论一览表

| # | 未验证项 | 结论(等级) | 独立退路(按项独立,不得挪用) |
|---|---------|------------|------------------------------|
| ① | `dsh plugin add` 对壳自有 profile 目录(userData 下)的行为 | **CLI 无法寻址壳 profile,且上游显式禁止**——`--profile desktop` 被 CLI 启动器直接拒绝;按名寻址只落在 `$DSH_HOME/profiles/<name>`;同名不存在时新建 home profile,永不写 userData(源码级) | 内置 bundle 清单路线(任务 2 已交付:产品级配置 + 启动期对账),**独立于 `plugin add`** |
| ② | profile node_modules 物化对 out-of-tree bundle 的解析(dev `link:` / prod tarball) | **两形态均成立**:解析契约 = `resolveBundleDir` 双锚探测 + 壳 profile 隔离式 heal(全部链接只写 profile 目录内);dev `link:` = 链接形态(源目录必须在场),prod tarball = `file:` 依赖经 pnpm 解包物化(peers WARN 不阻断)(源码级 + 实测) | npm 发布或 tarball 随包内置(**注:两锚解析回答的是 inject 目标从哪解析,不是自有插件包的物化通道,不构成本项退路**) |
| ③ | `inject` 依赖边以非官方包(自有插件)为声明方的完整语义 | **声明方无关**:宿主 composer 对任何被 Loader 挂载的包统一扫描 `dsh.client`,无官方白名单;inject = 到达顺序声明,无整体 boot 校验,缺席目标静默跳过、真正校验点在物化期 require(源码级,修正了技术方向文档 §7 的推断);最小稳定子集(3 边)**合法且对本插件功能面等价**(实测 S0/S1 双证) | 按 DSH Studio 第三方插件的既有声明形态调整(外部证据);若子集不合法则退回 ui-goal 全集(未触发) |

**门控结论(M2)**:三项均未被推翻——装配路线假设成立,M2 设计无需修正路线即可开工(§6)。增量价值在语义精确化:四处推断被源码级事实修正/收紧(附录 A 标注 ⚠ 的行),M2 设计须按精确化后的语义执行。

---

## 1. 未验证项①:`dsh plugin add` 对壳自有 profile 目录的行为

### 1.1 结论(源码级)

壳自有 profile 是**应用自有 profile(application-owned profile)**:由壳在 `<userData>/host-profile` 创建、经宿主入口 `argv[3]`(`projectDir`)以 `loadProfileDirectory` 按目录加载(appendix A,事实 1-5)。对它跑 `dsh plugin add` 的行为分三层:

1. **结构性不可寻址**:`dsh plugin --profile <name>` 的名字解析严格落在 `<home>/profiles/<name>`(`resolveProfileDir`;含 `/`、`\`、`.`、`..`、`node_modules` 的名字直接抛错);CLI 启动器旗标面只有 `--profile/--patch/--from-default-profile/--dump-config/--dump-default-config`,**没有**目录或 home 覆盖参数。壳 profile 目录(`host-profile`)不在该布局内,任何 `--profile` 取值都指不到它。
2. **上游显式拒绝(强于推断)**:CLI 启动器对 boot 路径与 `plugin` 子命令**双处**调用 `rejectElectronProfile`——`dsh plugin --profile desktop add <pkg>` 不会执行,直接报错退出:`profile "desktop" is managed exclusively by the Electron application`。上游把 Electron 桌面 profile 划为应用专属、CLI 不可管理,是**有意设计**而非巧合;壳侧 `runProfile({ profile: 'desktop', resolvedProfile })` 用的正是这个保留名。
3. **误用时无害**:对不存在的 profile 名,`runPluginCommand` 会以 `PROFILE_TEMPLATES[<name>]` 或 `DEFAULT_PROFILE_BUNDLES`(`['@deepseek-ai/dsh-base']`)初始化一个**新的 home profile**——即 `dsh plugin --profile <任意名> add` 的写入永远落在 `$DSH_HOME` 下,不会触碰 userData。

**运行时合法通道(补充事实)**:同一 operations 模块(`runProfilePnpm`)支持 `context.dir`(应用自有 profile 显式目录)——使用者是**宿主内 PluginManager 服务**(boot 后常驻,`execution: 'service'`,持 profile 写锁,HMR 热调和,`protectedModules` 保护管理链自身)。即:往壳 profile 里装包的 sanctioned 通道是宿主内服务(桌面 webview 的插件管理 UI 即其消费端),不是 CLI。本基座不需要该通道(产品插件走内置清单),仅落档供 M2+ 记账。

### 1.2 独立退路(① 专属,不得挪用于 ②③)

**内置 bundle 清单路线**——插件以产品级配置声明、壳启动期投影进 profile manifest,装配不经 `plugin add`。该退路**已不是退路而是已交付的产品路线**(任务 2):`apps/desktop/resources/plugin-bundles.json`(唯一事实源,只读)→ `projectHostProfile()` 启动期对账(增腿 = manifest 清单收敛 + 物化播种;删腿 = 清单外条目物化清剪),壳代码 diff = 0。① 的结论对该路线零影响(二者本就互不相依)。

---

## 2. 未验证项②:profile node_modules 物化对 out-of-tree bundle 的解析

### 2.1 解析契约(源码级,两形态共用)

- **双锚解析**:`resolveBundleDir(binName, pkg, installAnchor, profileDir)` 依次从 ① 安装锚(`<runtimeDir>/node_modules/@deepseek-ai/dsh/package.json`,壳场景 = vendored 运行时闭包)② profile 锚(`<profileDir>/package.json`)按 Node 查找序探测包目录;**安装锚优先是契约**——`dsh-base` 等内置 bundle 永远来自运行时安装,profile 本地副本(若同名)只在 out-of-tree 时被第二锚捡起。两锚都落空才报 `cannot resolve profile bundle …`(loud)。
- **隔离式 heal(壳 profile 专属路径)**:boot 时 `healIsolatedProfileModuleFallback` 把「安装闭包 + 仅被选中 bundle 携带的包」物化为 profile 自有的 `node_modules` 链接(经 `<profileDir>/.dsh-module-fallback/node_modules` 中转,**全部链接属于 profile,不写共享 home 目录**);pnpm 已管理的条目权威、不被替换;bundle 被移出清单后其专属链接被清剪。闭包遍历对「已声明但不可解析」的依赖**跳过而非失败整树 boot**(事实 8)——这是 bare 物化(无 peers)能 boot 的契约基础。
- **解析模式**:壳默认 `link` 模式(desktop-host `argv[5] !== 'runtime'`)= 磁盘链接 + Node 原生解析(`PluginPackages` 不装内存路由表);`runtime`/`dual` 模式才装 `installProfileResolution`(enforce/verify 内存包表)。profile 的 pnpm 设置:`nodeLinker: hoisted` + `autoInstallPeers: false`——out-of-tree 插件得到扁平 node_modules,缺失 peers 落到 heal 链接,**每个插件共享安装侧唯一 cordis 实例**而非私带副本(事实 7,与「插件包内永远不装 cordis/ui-*」的两锚设计互为表里)。

### 2.2 dev `link:` 形态(结论:成立,附一条脆性)

- **上游形态**:profile 依赖声明 `link:<相对路径>`(`dsh plugin --profile <name> add link:../path` — `anchorPathSpec` 将 `(file|link):` 前缀相对 spec 锚定为调用目录绝对路径)→ pnpm 在 profile `node_modules` 建符号链接指向源包目录。
- **壳侧现行形态(任务 2)**:等价的链接形态由壳直接播种——`ensureMaterialization()` 对配置了 `workspace:<dir>` source 的条目在 `<profileDir>/node_modules/<pkg>` 建 junction 指向工作区包目录;与上游 heal 互不踩踏(壳播种前检测 upstream-owned fallback 链接与 pnpm 拥有的实体包,均让位)。任务 2 已以 vendored `loadProfileDirectory + composeEntries` 离线验证该形态的 profile 组合链路。
- **脆性(须记账)**:链接形态要求**源目录在 boot 时在场**——源被移动/删除后 boot 报 `cannot resolve profile bundle`;且历史事故证明把 vendored 目录误当 profile 目录会让 heal 把 fallback junction 写进 vendored `node_modules`(修复配方:清 dangling 链接后重跑 `scripts/install-host-closure.mjs`)。故 link 形态定位 = **dev 专用**,打包态走 §4 结论。

### 2.3 prod tarball 形态(结论:成立,实测)

- 机制:profile 依赖记为 `file:<path>.tgz`,pnpm-in-profile 解包物化;`dsh plugin add <tarball>` = pnpm add + reconcile 自动激活 bundle(任务 3 证据 §0/§1)。
- 实测要点(任务 3,live):两次 `plugin add` 均 exit 0;物化内容 = 包 `files[]` 清单本身(`lib/index.js`、`lib/client.js`、`lib/types/**`、`cordis.patch.yml`、`package.json`),**不含任何 peers**(`autoInstallPeers: false`,安装期 peers 报 WARN 不阻断——它们运行时从安装锚 boot graph 解析);boot graph 含自装插件、面板渲染、0 pageerror。
- **关键推论(给 §4)**:S0/S1 的 profile node_modules 里**只有插件包本体、零 peers 在场**,链路依然全绿——即「bare 包物化」满足 boot + 渲染的充分条件是源码契约(事实 8 跳过语义 + 宿主半身零 import)而非 pnpm 的依赖安装行为。

### 2.4 独立退路(② 专属,不得挪用于 ①③)

**npm 发布或 tarball 随包内置**——插件包以 registry 包或随应用分发的 tarball 为物化源,不依赖工作区链接。**显式注明**:② 正文中的「双锚解析」(`resolveBundleDir` 的安装锚/profile 锚)回答的是 *bundle 与 inject 目标从哪里解析*,是**解析锚**,不是自有插件包的**物化通道**(物化通道 = pnpm 安装 / 壳播种),故两锚解析**不构成** ② 的退路——本项退路仅指 npm 发布与 tarball 随包内置两条物化源路线。§4 的分发形态结论正是对该退路的证据定夺。

---

## 3. 未验证项③:`inject` 依赖边以非官方包为声明方的完整语义

### 3.1 声明方无关性(源码级)

宿主侧 composer(`dsh-client-modules` 包根的 `resolveMeta`)对**Loader 树上已挂载的每一行**统一扫描其包 manifest 的 `dsh.client` 声明:形态校验(`parseDshClient`:inject/external 须为字符串数组、platform 须为字符串)+ `platform === "web"` + 包 `exports` 含 `"./client"`。**不存在官方/非官方白名单**——声明方是谁由「其宿主半身是否被 bundle patch 行挂载进 Loader 树」决定。非官方包作为声明方与官方包走完全同一条合成路径(事实 10)。

### 3.2 语义精确化(源码级,修正技术方向文档 §7 推断 ⚠)

技术方向文档 §7 将 inject 目标可用性表述为「名单必须在运行时安装里存在(boot 校验)」。源码核查**修正**该推断:

1. **inject = 到达顺序声明**(arrival ordering):boot graph 行的 `inject` 逐目标执行 `graphRows.get(name)`——目标**在场**则先等其工厂到达再物化本行;目标**缺席则静默跳过**,不报错、不阻断(事实 11,`arriveGraphRow`)。
2. **没有对 inject 名单的整体 boot 校验**:wire 校验(`parseBootManifest`)只验形态(字符串数组、无重复 id、batch 覆盖),不验目标存在性;宿主侧合成同样透传不校验。
3. **真正的硬校验点在物化期 require**:工厂执行的 `require(spec)` 未命中模块表(平台种子词 ∪ 已物化图行)→ **loud throw**(「build-time externals drift, or a dynamic dependency that did not arrive」),插件贡献缺席、webview pageerror 可观察、不阻断整树(与撞键 S2 的宿主行为一致)。
4. cordis 侧另以同一组包边做 entry 组合/注入等待(manifest.ts 文档注释),与模块面到达语义互补。

即:**多声明一条边 = 多一条到达约束;少声明一条边 = 少一条约束,只有当工厂实际 require 该目标时才暴露**。名单的正确性判据是「注册函数实际组合进入的目标面」,不是固定最小集。

### 3.3 两组声明对照与子集合法/等价性

| 声明方 | 性质 | inject 声明(实录) | 证据 |
|---|---|---|---|
| `@dsh-forge/plugin-hello-world`(任务 1) | 非官方,最小稳定子集 | `dsh-client-locale` / `dsh-client-ui-chat` / `dsh-client-ui-renderer`(3 边) | 实测 S0:官方 web boot graph(59 entries)三目标全在场,面板渲染 + 子槽位默认内容 + 交互,0 pageerror |
| `@dsh-forge/plugin-hello-world-collision`(任务 3 fixture) | 非官方,子集复制品 | 同上 3 边 | 实测 S1:独立装配运行绿(证明该子集形态可复制、非个例) |
| `@deepseek-ai/dsh-client-ui-goal`(上游参照,vendored 实录) | 官方,全集 | `dsh-api-remotes` / `dsh-api-session-controller` / `dsh-client-locale` / `dsh-client-ui-chat` / `dsh-client-ui-conversation` / `dsh-client-ui-renderer` / `dsh-client-ui-session`(**7 边**,与技术方向文档「上游实测 7 边」一致) | 源码级:同 graph 内同机制运行(官方 web 常驻) |

**子集合法性:成立**。源码无最小集要求(§3.2);3 边子集以非官方声明方在官方 web 全链路绿(S0),同形态复制品独立绿(S1)。

**等价性:对本插件功能面等价,且是更准确的声明**。等价判据:hello-world 的注册面 = ui-chat 的 `conversation.chat.assistant-actions` 槽(children + store 席位 + locale 命名空间 + 面板),外加 renderer 作稳定基座——3 边恰好等于该功能面;多出的 4 边(api-remotes / api-session-controller / ui-conversation / ui-session)是 ui-goal 自身功能面(GoalBar 挂 conversation/session 表面、读 api 通道)所需,对 hello-world 只增加无行为收益的到达约束(在官方 web graph 内全在场,声明了也不失败)。**反向边界**:子集若不含工厂实际 require 的目标,物化期 loud throw(§3.2-3)——即「等价」的条件是**边集 ⊇ 工厂实际 require 面**,声明面小于 require 面才会失败;本对照中子集满足该条件。

**误读防御(AC 原文语义)**:本结论为「子集合法」,**未触发**「子集不合法则退回 ui-goal 全集」的回退;即便未来某环境触发,回退对象是**全集声明形态**,绝不构成「非官方声明方不可行」的结论(声明方无关性已由源码钉死,§3.1)。

### 3.4 独立退路(③ 专属,不得挪用于 ①②)

按 **DSH Studio 第三方插件的既有声明形态**调整(外部证据:euanguo/dsh-studio README——其项目树/Git Review/终端均为插件且可被 `dsh plugin --profile web add github:euanguo/dsh-studio` 装入他人 profile,声明形态在该生态已成立)。本项未触发退路;若上游契约演进导致 ③ 语义变化,先对照该外部成例再下结论。

---

## 4. hello-world 到达打包态/离线壳的分发形态结论

### 4.1 候选裁定(以证据定夺)

| 候选 | 裁定 | 证据链 |
|---|---|---|
| npm 物化(用户机上从 registry 装) | **否决(打包态)** | 物化期需网络 + registry 可达,直接违反离线自足 NFR;且 dist-tag 陷阱(`latest` 停旧版)在无 exact 纪律的安装路径上放大。保留价值:它仍是**第三方往官方 dsh 分发**的通道(任务 3 已实测),与壳内分发是两个面 |
| tarball 随包内置(artifact 载体) | **选中(载体)** | 任务 3 实测 tarball 物化内容 = `files[]` 自包含(`lib/*.js + cordis.patch.yml + package.json`),JS-only、无构建脚本、无原生依赖,解包即完备 |
| 预播种(壳侧物化机制) | **选中(机制)** | 源码契约:boot 只要求 `resolveBundleDir` 第二锚在 `<profileDir>/node_modules` 探到**包目录**(junction 或实体目录皆可);bare 包(零 peers 物化)满足 boot + 渲染的充分性已由 S0/S1 实测 + 事实 8(不可解析依赖跳过)+ 宿主半身零 import(空 `apply()`,无 Node 侧 import)共同钉死;client 半身经 HTTP 下发、require 走浏览器模块表,磁盘上无需任何 peers |

**结论**:hello-world 到达打包态/离线壳的分发形态 = **「tarball 随包内置 + 壳侧预播种物化」**——构建产物 tarball 打进应用资源,首启/对账时由壳把包内容解包(或等价复制)进 `<userData>/host-profile/node_modules/<pkg>`,不经 pnpm、不经网络。dev 形态维持任务 2 的 workspace junction(§2.2)。落地衔接:产品配置 `source` 词表从 `workspace:<dir>` 扩展出打包态来源(如应用资源内路径),配置仍是插件树唯一事实源、零壳代码硬编码——具体词表与解包实现归任务 6(其 AC4 即按本结论执行)。

### 4.2 与离线自足 NFR 的兼容性声明

- **离线自足:兼容**。预播种物化零网络、零 pnpm、零构建脚本;tarball 载体在应用包内。首启后 profile 完全本地自持。
- **其余 M1 NFR 不受累**:进程足迹仍 = 2(无新增常驻进程;物化是启动期一次性文件操作);无监听端口不变;零侵入 vendored(壳只写 userData profile 与 host-payload);`$DSH_HOME` 多装共存不变(壳 profile 独立于 home,M1 SC8 已验 `runProfile` 只写 profile 目录)。
- **须实测收口的一项**:预播种加入启动路径后的冷启动增量(提案 NFR:相对 M1 基线 ≤5% 且绝对 ≤100ms)——对账/解包是差集化的写一次操作(仅在配置或物化缺席时动手),预算验证归任务 6 实测腿。

---

## 5. 撞键三型结论归档(并入自任务 3;完整证据见 `dsh-web-assembly-evidence.md` §4)

fixture:`packages/plugins/hello-world-collision`(hello-world 结构复制品,`MODE` 四档),2026-09-22 官方 `dsh web` 实测矩阵:

| 场景 | 撞键轴 | 结果 | 归档型 | 静默? |
|---|---|---|---|---|
| S2 | 同声明键(同名子槽位 `hello-world.panel`) | 后到者启动期 pageerror **点名先声明者**,先到者保留,应用不断 | **③ 启动期显式报错** | 否 |
| S5 | 同格(id)同 priority | 后到者抛错 + 内联补救提示(换 priority 即分层),先占者保留 | **③(同格形式)** | 否 |
| S4 | 同格异 priority(-1 vs 0) | 确定性分层接管:胜者渲染翻转,败者留台账(roster + `SlotCore.entries`) | **② 分层覆盖** | 否 |
| S3 | 异 id 异键 | 两面板合并共存,各自子槽位互不垄断 | **① 合并共存** | 否 |

**SC6 移交语(M2 真实工作台槽位设计的前置输入)**:

1. ui-slots 撞键语义 = **CSS 级联式显式分层 + 启动期 fail-loud**:声明键撞键与同格同级一律启动期抛错(点名对方),同格异级按 priority 数值分层,异格合并——工作台自有槽位直接继承该语义,无需发明新机制。
2. 宿主对插件注册抛错的现实行为 = **webview pageerror + 该插件贡献缺席,不阻断整树**。M2 若要求「必备插件缺失即启动失败」,须壳侧另行加门(基座未涉及,仅记录现状)。
3. **profile bundles 顺序 = 声明先后的确定序源**(reconcile 按装入序追加,bundle 顺序决定槽位先声明者)——M2 槽位文档应写明该顺序语义。
4. 无论落哪一型,「静默后者覆盖且不可观察」从未出现(SC6 通过面);fixture(`MODE` 常量四档)是后续同键探测的可复用参照。

---

## 6. 对 M2 设计的门控结论与修正路线条款

**总门控:三项均未被推翻,装配路线假设成立,M2 设计按现路线开工**(与 M2 PRD 修订的耦合双门槛中,基座侧门槛就此闭合)。M2 须携带的语义精确化输入:

1. **inject 语义按 §3.2 执行**:声明集 = 注册函数实际组合进入的目标面(⊇ 工厂 require 面);无整体 boot 校验、缺席目标静默跳过、失败点在物化期 require(loud)。声明仅限目标环境 boot graph 实际携带的行(壳内 graph 来自 vendored 安装闭包的 client 行,M1 SC7 UI 对等已证官方 UI 面在壳内在场;任务 6 做壳内 live 收口)。
2. **壳 profile 的包操作通道按 §1.1**:产品插件 = 内置清单(已交付);CLI 对壳 profile 既不可寻址也被上游显式禁止;运行时第三方装包(若 M2+ 需要)走宿主内 PluginManager 服务通道,非 CLI。
3. **物化契约按 §2/§4**:boot 只需包目录在 profile `node_modules` 在场;peers 不物化是常态而非缺憾(安装锚供给);dev 用链接形态(源目录必须在场),打包态用 tarball 内置 + 预播种。
4. **分发形态按 §4.1 定案**:任务 6 打包腿按「tarball 随包内置 + 壳侧预播种物化」执行并留档离线验证。

**修正路线条款(条件生效)**:若上游 SHA 升级(钉定线 `c36ba648` → 新版)导致任一项结论被推翻,按提案 Key Risks 行 1 激活**对应项的独立退路**(①内置清单 / ②npm 发布或 tarball 内置 / ③DSH Studio 声明形态),在 spike 报告修订版中落档修正路线,并**重新门控 M2 设计**(M2 相关任务暂停直至修订落档)——退路按项独立,不得互相挪用。

---

## 附录 A:源码级事实清单(内联,锚定 vendored SHA `c36ba648`)

> 路径根 = `packages/desktop-host-vendor/vendored/`。行号会漂移,按符号名检索。⚠ = 对技术方向文档推断的修正/收紧。

| # | 事实 | 源码位置(符号) | 消费章 |
|---|------|----------------|--------|
| 1 | profile 名解析 = `join(home, 'profiles', name)`;含 `/`、`\`、`.`、`..`、`node_modules` 的名字抛错——无路径逃逸 | `packages/boot/app-boot/src/profile.ts`(`resolveProfileDir`) | §1 |
| 2 | CLI 启动器旗标仅 `--profile/--patch/--from-default-profile/--dump-config/--dump-default-config`,无目录/home 覆盖;`plugin` 子命令只收 `--profile <name>` + pnpm 透传参数 | `apps/cli/src/args.ts`(`parseDshArgs`) | §1 |
| 3 | **`--profile desktop` 被 boot 与 `plugin` 双路径显式拒绝**:`profile "desktop" is managed exclusively by the Electron application` | `apps/cli/src/args.ts`(`rejectElectronProfile`,两处调用) | §1 |
| 4 | `dsh plugin` 对不存在的 profile 名:初始化新 home profile(`PROFILE_TEMPLATES[name]` 否则 `DEFAULT_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base']`),永不写 userData | `packages/boot/plugin-manager/src/operations.ts`(`runPluginCommand`)+ `app-boot/src/profile.ts` | §1 |
| 5 | 应用自有 profile 的运行时通道 = 宿主内 PluginManager 服务(`execution: 'service'`,`context.dir` = profile 目录,持锁 + HMR 热调,`protectedModules` 自保护);CLI 路径不传 `dir` | `packages/boot/plugin-manager/src/index.ts`(`PluginManager.runPnpm` → `runProfilePnpm`)/ `operations.ts`(`PackageOperationContext.dir` 注释)/ `apps/cli/src/plugin.ts` | §1 |
| 6 | 壳宿主入口:`argv[2]=runtimeDir`(安装锚 = `<runtimeDir>/node_modules/@deepseek-ai/dsh/package.json`)、`argv[3]=projectDir` → `loadProfileDirectory` 按目录加载;`runProfile({profile:'desktop', resolvedProfile}); resolutionMode = argv[5]==='runtime' ? 'runtime' : 'link'`;`argv[6]` 可选注入应用自带 node 作 profile 包管理器 | `apps/desktop-host/src/index.ts`(`main`) | §1 §2 |
| 7 | profile pnpm 设置 = `nodeLinker: hoisted` + `autoInstallPeers: false`(注释:扁平 node_modules,缺失 peers 落到 healed fallback,共享安装侧唯一 cordis 实例) | `packages/boot/app-boot/src/profile.ts`(`PROFILE_PNPM_WORKSPACE`) | §2 |
| 8 | 隔离式 heal:全部 fallback 链接属 profile(`.dsh-module-fallback/node_modules` 中转),不写共享 home;pnpm 条目权威不被替换;**「已声明但不可解析的依赖跳过、不失败整树 boot」**;bundle 移出清单后专属链接被清剪 | `packages/boot/app-boot/src/profile.ts`(`healIsolatedProfileModuleFallback` / `healProfileModuleFallback` / `dependencyClosure` / `packageDirFromAnchor`) | §2 §4 |
| 9 | 双锚 bundle 解析:安装锚优先、profile 锚次之,皆落空才 loud 报错;link 模式 = 磁盘链接 + 原生解析(PluginPackages 无内存表),runtime/dual = `installProfileResolution` enforce/verify | `app-boot/src/profile.ts`(`resolveBundleDir`)+ `apps/cli/src/profile-boot.ts`(`composeProfile`/`runProfile`)+ `app-boot/src/profile-resolution/service.ts`(`PluginPackages`) | §2 |
| 10 | 宿主 composer 对 Loader 已挂载行统一扫描 `dsh.client`(形态校验 + `platform==="web"` + `exports["./client"]`),**无官方白名单**,inject 透传进 boot 行 | `packages/client/modules/src/index.ts`(`resolveMeta`/`parseDshClient`/`buildEntry`) | §3 |
| 11 | ⚠ inject 目标在场→先到达;**缺席→静默跳过不报错**;物化期 require 未命中模块表才 loud throw;物化 memoized、工厂形态 CJS | `packages/client/modules/src/client/system.ts`(`arriveGraphRow`/`makeRequire`/`materialize`) | §3 |
| 12 | ⚠ wire 校验只验形态(字符串数组、无重复 id、batch 覆盖),不验 inject 目标存在性;`WebBootEntry.inject` 语义 = 「工厂必须先到达的包行」(到达顺序声明) | `packages/client/modules/src/client/manifest.ts`(`parseBootManifest`/`WebBootEntry`) | §3 |
| 13 | ui-goal 全集 7 边实录(appendix 表 §3.3);hello-world 子集 3 边实录 | `packages/client/ui-goal/package.json` + 本仓 `packages/plugins/hello-world/package.json` | §3 |
| 14 | `(file\|link):` 前缀相对 spec 被锚定为调用目录绝对路径(dev link 形态的 CLI 入口) | `packages/boot/plugin-manager/src/operations.ts`(`anchorPathSpec`) | §2 |
| 15 | 版本锚:`vendor/upstream.lock.json` = `pinnedSha c36ba648dc106d21fb32562793b3e3b9c8922bc4` / `desktopHostVersion 0.1.6-alpha.2`;hello-world peers exact `0.1.6-alpha.2` ≡ launcher exact ≡ lock(三处一致,任务 3 实测) | 本仓 `vendor/upstream.lock.json` + 任务 3 证据 §2 | 全局 |

**实测证据索引**:任务 3(官方 dsh web 侧:`dsh-web-assembly-evidence.md`,S0–S5 六场景 + 两锚 + 版本对齐 + 现场还原);任务 2(壳内配置化:`apps/desktop/src/main/host-profile/index.ts` 交付与离线组合验证,commit `b8100f6`);任务 4(版本断言门禁:`version-gate-evidence.md`,commit `0644e4b`)。外部证据:DSH Studio(euanguo/dsh-studio README,双形态插件分发实证)——标注为外部,非源码级。
