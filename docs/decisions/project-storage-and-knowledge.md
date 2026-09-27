# 项目存储与知识库架构(讨论记录与裁决)

> 日期:2026-09-26 · 来源:M4 原型验收后的延伸讨论(起点 =「添加项目面板太复杂」)· 参与:用户裁决 × Claude 整理 × 五视角 subagent 对抗评审(§9)
> 性质:**已裁决项标 ✅,已否决项标 ❌**;§5 为 v2 终稿(同日对抗评审后用户终裁)。本文是独立记录,后续 PRD/tech-design 以本文为上游。

## 1. 讨论脉络

1. **起点**:M4 添加项目对话框 = 3 必填(项目名/代码区/forge 文件区)+ 7 校验反馈 + 授权行 + 场景 chips —— 未开始先填表。诉求:**尽量少填**。
2. **发散**(第一轮):六个方向 —— 零输入纳管 / 打开即注册 / 拖拽粘贴智能单框 / 一根三区 / 侦测确认卡 / 名称免填。
3. **两条校正**(用户裁决,各击杀一个支柱):
   - ❌ **desktop 不包含 `.forge` 文件夹** → 任何依赖 `.forge` 的侦测信号与「打开即注册」身份判定不成立;现行 `ERR_FORGE_NOT_DETECTED(.forge 结构缺失)` 错误码在 desktop 语境**不成立,应废止**。
   - ❌ **「一根三区」违背日常使用习惯与直觉认知** → 以 `<root>/docs` 约定推导 forge 文件区被否决:用户仓库的 `docs/` 是用户自己的目录,forge 默认占用它反直觉且与既有内容冲突。三区在数据模型中保持**独立路径**,不合并为单根。
4. **转向知识侧**:先梳理 forge 文档的过程/资产谱系 → 存储分层的判据浮现 → 用户对知识存储连续三条裁决(目录形式管理、存储后端多样、本地远程共存 + 一切皆插件)→ 能力抽象定形;续裁 taxonomy 动态(D7)与目录三约束(D8)。
5. **收敛与对抗**(2026-09-26):「一锚一选两默认」收敛 → 五视角 subagent 对抗评审(方案发散/产品UX/数据模型/SDD管线/文件系统)→ 三处结构伤重构(③默认证据门控、②边界重划、身份 UUID 化)+ 交互形态升级(预览行)→ 用户终裁(**零 git 强制**:非 git 代码根为一等公民)→ §5 升 v2 定稿;评审记录见 §9。

## 2. 裁决总表

| # | 裁决 | 内容 |
|---|---|---|
| ✅ D1 | desktop 无 `.forge` | 侦测信号改为:git(`.git`)+ dsh workspace 记录 + 仓内 forge 树特征(`docs/features/<slug>/manifest.md`、`docs/proposals/<slug>/proposal.md` 模式);`docs/` 存在但无 forge 结构**不算命中** |
| ✅ D2 | 否决一根三区 | 三区保持独立路径;forge 文件区的值改由「默认来源候选」提供,不做约定推导 |
| ✅ D3 | 知识资产以目录形式管理 | 目录树是知识资产**唯一的组织与呈现模型**(与右栏 提案/feature 树同语言);逻辑命名空间与物理后端分离 |
| ✅ D4 | 存储后端多样 | 现在 = 本地文件系统;未来 = 文档服务类远程存储 |
| ✅ D5 | 本地与远程**共存** | 非迁移叙事;同一棵知识树中本地挂载与远端挂载并排存在 |
| ✅ D6 | 参照 dsh「一切皆插件」 | **消费既有两级插件模型**(TECH-product-arch-001 已点名「知识库」「文档存储适配器」为插件形态能力),不发明旁路注册机制 |
| ✅ D7 | 知识目录**动态** | 树的分类法(taxonomy)不固化于内核;forge 的知识目录结构(conventions/decisions/lessons/business-rules/…)只是**其中一种实践**(默认 preset)——可换、可自定义、可由插件贡献;见 §6.2b |
| ✅ D8 | 目录分层 · 命名有意义 · 目录集开放 | 组织形式 = **分层树**(嵌套层级,唯一不变量);各级目录与文档**名称必须有意义**(自解释、可读);**不固定有哪些目录**(无必备目录清单,同 D7) |
| ✅ D9 | ③默认 = 证据三档门控 · **零 git 强制**(2026-09-26) | 命中仓内 forge 树 → 沿用仓内;有 `.git` 无 forge 树 → 仓内新建(懒物化);**无 `.git` → 应用管理(主路径,非兜底)**。全链路不得以「先 git init」为前置;`.git` 后至 → 一次性非模态迁入建议;应用管 ③ 配**影子 git**(内部历史与 git 有无解耦);见 §5.3 |
| ✅ D10 | ②边界重划 | 任务定义(`tasks/<id>.md`)、阶段资产(`N.gate/N.summary`)、manifest/specs **随 ③**;②缩为纯审计留痕(records/eval/prototype)+ 运行时,外移 `runtime_root`;**沿用仓内 = feature 目录完整布局兼容模式**(forge-cli 链不断);见 §5.2 |
| ✅ D11 | 身份与唯一性工程化 | 内部稳定 UUID 为键 + `<forge根>/projects/<pid8>/` 物理目录(内嵌 project.json 元数据),重命名 = 纯 DB 更新零 fs 变更;**三层身份**(展示路径 / 平台折叠比较键 UNIQUE / `(dev,ino)` 仲裁);可写性 = 运行时状态,非注册门槛;见 §5.5 |
| ✅ D12 | M3 回写时序(硬约束) | 本裁决链须在 M3 开工前回写 M3 PRD(必答③ / G7 / SC9 及 41 任务相关面),否则 M3 按旧单文档根模型执行、M4 落地即返工 |

## 3. 知识资产盘点(事实基线)

### 3.1 四层谱系(过程 → 资产)

| 层 | 内容 | 消费者 | 生命周期 | 判定 |
|---|---|---|---|---|
| ① 管线运行时 | `.forge/state.json`、`index.json.lock`、`logs/`、`worktrees/` | 仅机器 | 崩溃可重建 | 纯过程,可弃 |
| ② 执行留痕 | `tasks/<id>.md`、`records/*.md`、`N.gate/N.summary`、`eval/iteration-*`、`prototype/*` | 审计、回溯 | feature 关闭即冻结 | 过程(写后只读;占文件数大头,M1 单 feature 60+) |
| ③ feature 档案 | proposal、prd 三件套、tech-design、er/schema、ui-design、布局稿 | 未来维护者 + 新 feature 上游输入(M4 引用 M2 原型为实证) | 随 feature 长存 | 资产,feature 作用域;协作 review/PR 场景有 git 诉求 |
| ④ 项目级知识资产 | `conventions/`(7)、`business-rules/`、`decisions/`、`experts/`、`manual/`、`.forge/fact-table.json` | 跨 feature 的人与 agent | 项目终身,触发 `/consolidate-specs` 漂移校验 | 纯资产 = 项目记忆;目前最稀薄(十几个文件) |

预留未建(不建空文档纪律):`lessons/`、`ARCHITECTURE.md`、`reference/`。

### 3.2 灰区判据(三条)

① 下一个消费者是管线还是人;② feature 关闭后还有无读取事件;③ 能否从别处再生。

实例:spike findings 文件在档案、结论被 decisions 吸收(i18n 案例实证:record 引用「spike-3 冻结的 locale 规则」)=「证据留档案,结论进资产」;task records 正文是审计、`Key Decisions` 段是决策知识 = 潜在 `/learn` 抓取源;fact-table 派生可再建但持续累积且带 `confidence/citation` = 机读知识索引,缓存与资产双重身份。

### 3.3 已存在的知识流动管道

spike → decisions/conventions(有实证);`config.yaml knowledgeSave` + `/learn` → decisions/**lessons**(机制位已留,目录未建);评审对话 → 裁决记录(M4 23 条 = 会话知识显性化);proposal 决策日志段(brainstorm 用户显式选择留痕)。

### 3.4 未来知识(发散清单)

**产出侧**:lessons 教训;M5 bug 库(症状/根因/修复关联,fix-bug 强制上报 → 缺陷知识库);M5 便签(用户灵感/待办,轻量);会话蒸馏(轨迹台账 → 探索结论自动沉淀,spike 化);决策自动留痕(brainstorm 裁决直出 decisions);质量趋势(eval 分数/质量门历史);fact-table 增长(代码分析事实 + 置信度分级)。

**引入侧**:上游参照(如 deepseek-harness 源码参照读我 → 应沉淀为 reference);用户规范导入(公司编码/设计规范、领域资料);第三方 ADR/文档、网页剪藏;experts 人格扩充;跨项目共享(conventions 提升组织级,多仓协调未来终会要)。

## 4. 存储地图(分区判据 = 是否随代码走 git;v2 修订见 D10/D11)

| git 诉求 | 内容 | 落位 | 可远端化 |
|---|---|---|---|
| 要(协作 review/PR、与代码同演) | 代码 + ③ 档案**与任务定义**(D10:含 `tasks/<id>.md`、`N.gate/N.summary`、manifest/specs) | 代码区(仓内);**非 git 项目 → 应用管 + 影子 git** | 不走挂载 |
| 不要(纯审计、量最大) | ① 运行时 + ② 纯审计留痕(records/eval/prototype/process) | `runtime_root`(应用管本地) | 否 |
| 不要但人要长期读 | ④ 知识资产 + 引入知识 | **挂载点(本地 FS ↔ 文档服务,共存)** | **是 —— 唯一可插拔层** |

- v2 修订(2026-09-26):①② 同居 `<forge根>/projects/<pid8>/`(desktop **不写 `.forge` 进用户仓**,D1);③按证据三档门控落位(§5.3),「有没有 git」只决定档案放哪、不决定有没有历史(影子 git)。
- 注册的必答从「三区在哪」收敛为「**代码在哪**」;知识挂载 = 机器级一次设定起、按挂载表管理。

## 5. 项目创建与存储绑定(✅ v2 定稿,2026-09-26;对抗评审后,见 §9)

### 5.1 绑定模型

```
Project := {
  id            内部稳定 UUID(唯一键,永不外露;= 既有 projects.id;dsh 上游同构:WorkspaceId=uuid, never the path)
  display_name  自由改、可重复(D8「有意义」的主承担者)
  anchor        代码根 canonical realpath(唯一硬校验;三层身份比对,§5.5)
  docs_root     ③ 档案 + 任务定义/阶段资产(D10):证据三档门控落位(§5.3)
  runtime_root  ① 运行时 + ② 纯审计留痕:<forge根>/projects/<pid8>/(pid8 = uuid 前 8 位十六进制;
                目录内 project.json 持 displayName/slug 元数据;不迁不移)
  knowledge     ④:机器级挂载表订阅(§6.2,原样)
}
```

- **重命名 = 纯 DB `display_name` 更新,零 fs 变更**——消解 Windows 句柄占用/保留名(`con`/`aux`)/尾点/大小写/NFC 全部地雷;slug 退化为创建时一次生成的元数据,不再作键、不再作物理目录名。
- 应用数据根目录布局**镜像 forge 文件约定**(`projects/<pid8>/features/<slug>/…`,D7/D8 纪律),`PROJECT_ROOT` 指向 forge 根时 CLI 仍可操作(迁移期逃生门)。

### 5.2 四层谱系修订(D10:②边界重划)

| 层(v2) | 内容 | 落位 |
|---|---|---|
| ① 运行时 | state / logs / worktrees / process | runtime_root(应用管) |
| ② 纯审计留痕 | `records/*.md`、`eval/`、`prototype/` | runtime_root(应用管) |
| ③ 档案 + 任务定义 | proposal、prd、design、ui、`tasks/<id>.md`、`N.gate/N.summary`、manifest、specs | docs_root(仓内 或 应用管+影子 git) |
| ④ 知识资产 | conventions / decisions / lessons / facts / 引入知识 | 挂载表 |

依据(forge-cli 源码实证):任务扫描单层 ReadDir(`pkg/task/build_steps.go`)、`forge task index` 会 `MkdirAll` **静默在仓内重建空 tasks/**(`internal/cmd/task/index.go`)、阶段门模板硬编码 `docs/features/<slug>/tasks/records/` 与 design 同根(`pkg/task/stage_gates.go`)——②全量外移会在「沿用仓内」既有仓上制造半拆状态与影子结构。重划后:任务定义/阶段资产是 breakdown 产物、有 review 与上游参照价值(且 M3 已把状态 SoT 移入 SQLite);**沿用仓内的既有项目 = feature 目录保持完整布局的兼容模式**(与 M3 SC2「原样留存」一致),CLI 链不断。管线根参数化(`records_root`/`archive_root` 经 rpc 配置)为后续演进。

### 5.3 ③默认落位 = 证据三档门控(D9;零 git 强制)

| 注册时侦测(一次) | ③ 预选 | 语义 |
|---|---|---|
| 命中仓内 forge 树 | **沿用仓内** | 最强证据:仓库已在实践 |
| 有 `.git`、无 forge 树 | **仓内新建**(懒物化) | 仓已存在,档案随行 |
| 无 `.git` | **应用管理** | 无仓可入;**主路径,非兜底** |

- **全链路零 git 强制**(用户裁决 2026-09-26):注册不要求 git、默认不假设 git、任何流程不得以「先 git init」为前置;非 git 代码根(greenfield、不用 git 的用户、散目录)= 一等公民。
- **`.git` 后至桥接**:激活/侦测发现代码根新出现 `.git` → 一次性可关闭的非模态建议「检测到 git 仓库——将档案迁入仓内?」。是建议,非强制;「迁入仓 / 迁回应用」双向迁移为一等动作(项目设置 + 协作信号时机),应用管理→仓内方向顺滑(误选救援)。
- **影子 git**(应用管 ③ 根):写时自动 commit、用户不可见、可时间旅行回溯——让「有没有 git」只决定档案放哪,**不再决定有没有历史**;纯本地 git plumbing、零新进程(TECH-006 不破)。注册卡副标明示两种形态后果(仓内:「随 git 提交、可 PR 评审」;应用:「应用自管 + 内部版本历史」)。
- 原则一句话:**默认跟随已存在的事实,不跟随期望,更不制造前提。**(与 D2 一脉相承:预选可见、一键可改、懒物化——注册时不写任何东西。)

### 5.4 创建流程(交互形态 v2)

```
┌ 确认卡(全部只读 + 两处 ✎)────────────────────────┐
│  dsh-forge ✎               ← 自动名(文件夹/git 仓库名)│
│  ✓ git 仓库                                         │
│  文档位置  Z:\…\dsh-forge\docs(随 git 提交,可 PR)✎  │ ← 预览行,非选择;
│           └ ✎ 展开:应用管理 / 仓内 + 路径(仅此处)     │   预选 = 证据门控(§5.3)
│  过程留痕 · 应用数据目录(本机,不进 git)    ← 灰字只读 │
│  ▸ 高级(自定义文档路径 / 仓外授权)                   │
│                          [取消]  [添加项目]           │
└─────────────────────────────────────────────────────┘
```

- **预览行替代三选 radio**:注册时刻读到写入承诺(首次向用户仓库写入 = 信任事件),但不做抽象选择;✎ 展开才见模式+路径。**黏性记忆只许记「应用管理」模式**——任何仓内落点只来自本仓侦测命中或本卡显式动作,永不继承(P0 修复:防跨项目静默写入无关仓库)。
- 快车道:拖入/粘贴/浏览 → 已注册路径直接 toast「已注册 · 打开」不出卡;父目录误选(直接子目录 ≥2 个 `.git`)→ 卡内嵌子目录快捷 chips;monorepo 多候选 → 取最浅 git 根 + 文档位置行内下拉(不出新弹窗)。
- **纳管 = 空态主角**:「检测到 N 个已有工作区(含 M 个会话)」优先于向导;非空态靠左树「未分组」组头导入入口(线索在东西旁边)+ 一次性可关闭提示条;**逐项纳管为主**(「全部纳管」会把 scratch 目录灌进注册表);纳管即时生效 + 事后非模态「关于此项目」卡补现侦测摘要(零打断与侦测默认不打架)。
- 机器级 forge 根 = OS 惯例目录(userData)零询问、零首启弹窗;设置页「数据位置」节承载查看/打开/带数据迁移的向导。
- 词汇统一:卡上「文档位置」↔ IA 词汇「forge 文件区」,废除「档案区」叫法(与 UF8「归档」撞车);按钮统一「添加项目」;卡上不出现「知识」行(M4 知识区不渲染 = UI 版空占位)。
- 侦测实现纪律:**固定前缀有界探测**(`<codeRoot>/docs/features` 一次 readdir + manifest 存在性),禁 glob、不读正文(防 OneDrive 水合)、只探 git 根顶层(防 node_modules/vendor 假命中与十万文件 monorepo 分钟级扫描)。

### 5.5 校验与身份(D11)

- **三层身份**(注册时落库,激活时复验):
  1. 展示路径 `code_root`:canonical 真实大小写,仅 UI 呈现,不参与比较;
  2. 比较键 `code_root_key`:平台感知折叠(win32 大写折叠;darwin 按卷探测;linux 原样)后的字符串,**UNIQUE 落此列**——折叠在应用层单源实现,不用 SQLite `NOCASE`(ASCII-only,语义不符);
  3. 物理仲裁位 `identity_dev`/`identity_ino`:命中即「同一项目」,回写最新 canonical 与比较键(顺带自愈父目录改名悬挂);ino 仅仲裁不作键(FAT/网络提供方不稳)。
- 归一化管线(注册与激活同一函数):`resolve → realpath.native(解 junction/symlink/subst/8.3、还原真实大小写)→ 剥 \\?\ 前缀 → 统一正斜杠 → 折叠`;realpath 失败(网络盘离线)→ 字符串归一回退 + 标 `identity_verified=false`;拒绝裸盘符(`Z:`)与相对路径输入。
- **硬校验仅 2 条(修订)**:① 代码根**存在且为目录 + 可读**(「可写」废除——`accessSync(W_OK)` 在 Windows 不查 ACL 形同虚设,行为式写探测又违反「注册零写入」Hard Rule + 污染 git status);② 唯一 = 比较键 UNIQUE + `(dev,ino)` 仲裁,注册入 `BEGIN IMMEDIATE` 事务。**可写性 = 运行时状态**:每次激活复检三区健康 enum(ok/degraded/invalid),写失败按 errno 映射可操作文案;应用管目录创建时一次性行为探测(自家地盘,不污染)。
- 边界:嵌套目录(monorepo 子包)= 合法 + 信息提示(软);同仓多 worktree = 合法两项目;remote/指纹重合 = **软提示**(合并建议),不得硬禁(误杀 worktree-per-project 工作流);UNC↔映射盘 realpath 不等但 `(dev,ino)` 同 → 提示。
- 懒物化并发:一律 `mkdir(recursive)`(幂等竞态安全);先占 DB 行(路径唯一约束)后物化文件;临时名 + 同卷 rename 原子落盘;启动回收自家命名空间的空目录与 `.forge-tmp-*` 残留(不碰用户文件)。

### 5.6 多机与生命周期声明

- **项目身份机器本地**(project_id 不跨机);**跨机只携带 ③(git)与 ④(挂载后端,若放同步盘)**;② 与身份各自机器本地——「项目数据跟着项目走」不成立,须在文档与 UI 明示(分区备份是 v1 现实,导出器 = O8)。
- 仓内命中以**仓库为黏性载体**(仓库即权威,天然跨机一致);应用管根写自描述标记(project.json),支持「检出既有档案」而非静默新建。
- 代码根移动:激活时 anchor 缺失 → `anchor_missing` 状态 + 候选扫描(git remote 一致 + 目录名)一键改绑;UI 明示成本「会话归组自移动日起重新累积」(上游 membership = cwd 精确匹配、path 永不改写——「投影重同步」承诺不了更多,不虚诺)。
- 项目删除:订阅行删除 + 后端 ④ 子树显式三选(保留孤儿命名空间 / 导出 / 删除);slug/pid **不复用**(防前任知识静默泄入新项目);rename 编排覆盖 runtime/③应用管/④挂载子树,按 provider `atomic-rename` 能力位选原子或两步(极少触发——默认零迁移)。

### 5.7 agent 访问面(管线适配)

- agent 侧一律**内核中介动词,不暴露路径**:扩展 M3 D4 dsh tool 写集 —— `forge.doc.read/write`、`forge.record.append`、`knowledge.query/save`;agent 只见逻辑锚(`feature://<slug>/design/tech-design`);record 优先 tool payload,文件形态仅崩溃恢复兜底(对账扫描补「仓内 `tasks/process/` 旧残留」键源)。
- conventions domains 注入收编进**内核预合成系统提示词**(查知识索引 FTS+frontmatter,非目录 glob;远端走快照缓存 O2);composer「@知识」同走内核查询注入。
- 单一写面纪律:已注册项目上 agent 写通道只有 dsh tool;CLI/外部会话写入按 M2 indexer 对账先例(扫描+diff+来源判定),偏差进 M4 投影偏差同一呈现语言。

## 6. 知识库架构(✅ 方向已定,细节 PRD 期定形)

### 6.1 两级插件映射(消费 TECH-product-arch-001/002)

| 两级模型 | 知识存储落法 |
|---|---|
| 必备插件(内置 bundle、不可禁用) | **localfs provider** —— 出厂即用、永远在场 → 知识区至少一个可用挂载,空态保护天然成立 |
| 扩展插件(`dsh plugin add`,同机制共存、互不垄断) | **文档服务 provider**(每服务一个适配器;第三方可自写) |
| 装配 = `plugin-bundles.json` 唯一事实源 | provider 走同一装配机制,双形态(内置 + 运行时 add)同机制 |
| 启停仅第三方 | 停用扩展 provider = 该根子树退出聚合树,数据零损坏(M2 SC6 同口径);再启用 = 索引重建回归 |
| 能力面纪律(electron-ipc-security) | provider 声明 capabilities,宿主协商渲染与降级;凭据最小面,不经插件明文持久化 |

### 6.2 挂载表(共存模型)

- 数据内核新表:`mount_id · provider(插件) · config(路径/远端空间+凭据) · 显示名 · 排序 · enabled`
- **知识树 = 多根聚合**(multi-root union;VS Code multi-root workspace 同构):每挂载一棵根子树,`<mount>/<相对路径>` 寻址,跨挂载天然无冲突;本地与远端并排。
- 「迁移」退化为操作组合:**加远端挂载 → 停用本地挂载**。
- 状态按挂载粒度:树根状态点 healthy / syncing / degraded / deviation;对账与索引按挂载并行;快照表带 `mount_id`;**SoT 永远在各存储后端**,内核只持索引±缓存(可弃重建,BIZ-coexistence-002 同语义)。

### 6.2b 目录实践层(taxonomy = 动态;forge 目录 = 一种实践,D7)

三层模型:

| 层 | 职责 | 形态 |
|---|---|---|
| 存储后端 | 字节落在哪 | provider 插件(§6.1) |
| **目录实践** | 树怎么组织(分类法/命名/层级) | **preset:forge 目录 = 默认实践;可换、可自定义、可由插件贡献** |
| 内容语义 | 条目是什么 | 内核稳定:entry 类型(doc/facts/link)+ origin + frontmatter(§6.3) |

- **目录设计三约束(D8)**:
  - **结构不变量 = 分层树**:嵌套层级是唯一固定的组织形态(不用纯标签库/纯平面页库);
  - **命名纪律 = 各级名称有意义**:目录名与文档名一律自解释、可读 —— 路径即自描述地址,是浏览与检索的第一道线索;远端 provider 的页面 GUID/内部 ID **不得漏出为名称**,适配层必须转译为有意义的标题段;
  - **目录集开放**:不设必备目录清单,也不预置空目录(懒物化)。
- **内核 schema-free**:树浏览、FTS 检索、快照索引一律按路径工作,不假设 forge 分类法;任何 taxonomy 都能挂载呈现。
- **forge 目录 preset** = 默认实践种子(`conventions/ business-rules/ decisions/ lessons/ reference/ …`);**懒物化** —— 分类法定义先行,目录随首条真实条目落地(不建空文档纪律),不预置空占位。
- **管线写入走语义路由**(含自愈,2026-09-26 对抗评审补全):`/learn`、`knowledgeSave`、`/consolidate-specs` 等知识写入不再硬编码 forge 路径,改经**语义槽** → 查当前树的路由表解析落点;forge preset 提供默认路由(decision→`decisions/`、lesson→`lessons/`…)。**词表最小集(v1 内置,注册表开放扩展)= decision / lesson / convention / business-rule / reference / fact**;bug 教训走 lesson(M5 bug 实体入内核表不入树);未知 slot = 显式报错让用户选,禁自动猜。路由表 = preset 提供默认 + 内核持有 + 设置可改 + 随挂载存(`slot→path + 绑定证据`);**自愈四条**:内核写路径上的 move/rename 自动改绑(树 UI 挪动必经内核);本地直改由 `changes()` 感知 → 路由标 degraded → 按条目 frontmatter 的 slot 标记 FTS 扫描重绑(唯一命中自动 + 提示,歧义标 unresolved);写前解析失败 → 回退 preset 默认路径**新建**并在 UI 呈现偏差——**绝不静默丢弃或写错位**。
- UI(知识区树)与检索对 taxonomy 无感知;未来换树、并树、第三方目录实践共存均不动物理层。

### 6.3 能力抽象(三面切分:必备最小面 / 能选能力位 / 内核补齐)

**Provider 契约(必备面 = 四件事)**:

| 能力 | 语义 |
|---|---|
| `mount(config)` | 建立挂载 + 鉴权校验 + 健康检查;失败 → 该挂载 degraded,不阻断其他挂载 |
| `list(prefix?)` | 枚举条目 `path · type · etag/mtime · size`;v1 全量列举、内核按 etag 差分,增量游标为未来优化 |
| `read(path)` | 取正文(markdown 优先) |
| `changes()` | 变更信号,形态由能力位决定 |

**可选能力位(声明式协商降级)**:

| 能力位 | 有 → | 无 → 降级 |
|---|---|---|
| `writable` | 写入(create/update/delete) | 挂载只读,写入口隐藏 |
| `push-change` | watcher/出站长连推送,≤5s 免刷新 | 轮询周期承诺 / 手动同步钮(该挂载唯一允许的刷新语义) |
| `atomic-rename` | move/rename 原子 | 复制+删两步,窗口期「同步中」 |
| `versioning` | 历史版本查询 | 无历史 UI,内核不伪造 |
| `binary` | 附件/图片 | 附件入口禁用 |
| `server-metadata` | 服务端元数据 | 统一由 frontmatter 承载 |
| `acl` | 协作权限、多人 | 单人语义 |

**内核统一补齐(provider 无关,不进契约)**:多根聚合树 + 路径规范化;快照索引 + **全文检索(FTS)—— 检索不要求 provider,能力面最小化的关键一刀**;对账状态机;**单一写路径编排**(agent `/learn`·tool 写 / 人 → 内核 API → provider write;含 §6.2b 语义槽路由;离线队列、冲突按 deviation 呈现)—— 与 forge 文件区的本质差异:文件区只读投影,**知识库有写路径**;条目类型渲染 + 便签升格通道 + 导出。

**条目模型(元数据随文走,跨挂载可移植)**:`path` 寻址;frontmatter:`type: doc | facts | link`(facts 承接 fact-table 类机读知识)、`origin: pipeline | agent | user | import`、`confidence?`(仅 facts)、`tags? / source-url?`。

**消费者能力面**:人 = 树浏览 + 只读渲染(复用 M4 文档 tab 形态)+ 检索 + 降级挂载手动同步;agent = 查询注入(dsh tool / composer @引用)、`/learn` 沉淀、facts 查询(eval grounding);管线 = `/consolidate-specs` 读 conventions、`knowledgeSave` 自动沉淀、漂移校验。

### 6.4 既有硬约束自动套用

- TECH-product-arch-006(常驻足迹 = 2 + 零网络监听)→ 远端 provider 变更感知只能**客户端主动**(轮询/出站长连),禁 webhook 监听与新常驻进程。
- TECH-product-arch-005(vendor-free)→ 第三方 provider 插件产物离仓可装,同一门禁。
- M4 右栏面板注册制 → 知识区面板本身也是注册面板;UI 面与存储面同一插件体系。

### 6.5 验收策略

v1 只交付 localfs provider(必备面全量 + `writable` + `push-change`);另做**契约测试用假想远端 provider**(只读 + 轮询 + 无 rename 子集)证明能力协商与降级路径真实可用 —— 抽象不为远端先行买单。

## 7. 开放点

| # | 问题 | 倾向 |
|---|---|---|
| O1 | 挂载表作用域:全局注册 + 项目订阅子集 vs 项目私有挂载 | 前者(跨项目共享挂载自然表达;默认订阅必备 localfs 的本项目子树) |
| O2 | 远端正文缓存:按需拉取 + 离线降级 vs 本地全量缓存 | 按需 + 明确离线降级 |
| O3 | 便签(M5)与知识树关系 | 便签 = 内核表(高频轻写,运营数据),不进挂载;单向升格通道(便签 → 知识条目)保留 |
| ~~O4~~ | ~~②留痕/③档案落位切分与注册方案终裁~~ | ✅ **已裁决**(2026-09-26):§5 v2 + §9 对抗评审 |
| O5 | localfs 应用自管挂载粒度:单挂载按项目分目录 vs 每项目一挂载 | 单挂载 + 项目目录(挂载数量不随项目膨胀) |
| O6 | 目录实践(preset)的配置形态 | v1 = forge preset 内置 + 用户可改路由表;插件贡献后议(语义槽词表已定最小集,见 §6.2b) |
| O7 | 影子 git 细节:commit 粒度 / 保留策略 / 时间旅行呈现 / 与「迁入仓」的合并语义 | 存储实现 PRD 期定形(§5.3 已定方向) |
| O8 | 项目导出/备份面:绑定模型下备份 = 清单 + 四层数据打包(①可排除),导入重映射 project_id | v1 明示「分区备份是现实」(§5.6);导出器后议 |

## 8. 影响与后续

- **M3(时序硬约束,D12,先于一切执行)**:本裁决链须在 M3 开工前回写 M3 PRD——必答③(单文档根 → §5.2 修订模型)、G7(「仓外默认」收窄为「**非 git 默认**」)、SC9(「代码仓内零新增过程文档」改为仅约束 ② 纯审计留痕,不再约束 ③ 档案与任务定义)及 41 任务的相关面;②边界重划、runtime_root/pid8、影子 git 的实现在 M3 修订后落地。
- **M4(§5 已裁,回写清单)**:注册对话框按 §5.4 预览行形态重构(三选 radio 与场景 chips 移至原型工具);回写 `workbench-layout-v2.md` §2.2、PRD UF7、ui-design C7;`ERR_FORGE_NOT_DETECTED` 废止、BIZ-001/003 收窄为「高级自定义仓外」;纳管空态重排 + 未分组组头入口。
- **M5**:便签语义不变(内核表);升格通道为预留接口;对账扫描补「仓内 `tasks/process/` 旧 record.json 残留」键源;record 优先 tool payload(§5.7)。
- **未来里程碑(知识区)**:右栏第三棵目录树(面板注册制,schema-free 渲染);provider 契约测试;目录实践 preset + 语义路由表(D7/O6)进知识区 PRD;`lessons/` 首条真实条目落地时机随之定。
- **本文地位**:架构方向记录;进入实现前以对应 feature 的 PRD/tech-design 细化——§5.5(三层身份/归一化/校验)为注册工程实现的直接输入,§6.3 为 provider 接口设计的直接输入。

## 9. 对抗评审记录(五视角 subagent,2026-09-26)

方法:五组独立并行评审(方案发散 / 产品 UX / 数据模型 / SDD 管线 / 文件系统),各自只读取证后攻击「一锚一选两默认」终稿;主会话交叉验证(命中 ≥2 = 高置信采纳)后综合,用户终裁落盘。

| # | 视角 | 判定 |
|---|---|---|
| 1 | 方案发散(延迟绑定 / git 原生 / 模板驱动) | 三案均不足以整体替换(败因:错误面移进心流 / 非 git 即自瓦解 / 场景 chips 还魂);吸收五段:快车道、双向迁移、remote 软提示、证据化默认、preset 不进注册门 |
| 2 | 产品 UX | 方向成立;**radio → 预览行**(信任事件成立但不做抽象选择);P0 = 黏性跨项目携带;forge 根时机 = userData 零询问;纳管升空态主角;卡上删知识行;词汇统一 |
| 3 | 数据模型 | P0 = slug 双重身份(上游 `types.ts`:uuid never path 为权威反证)+ 多机 split-brain;②③拆分与 forge-cli 物理冲突;③无历史自相矛盾 |
| 4 | SDD 管线 | P0 = ③默认应用管理釜底抽薪(四个证据面)+ ②外移半拆断 CLI(源码实证);M3 时序倒挂;语义路由自愈;agent 动词面;domains 注入收编 |
| 5 | 文件系统 | P0 = 路径字符串唯一被击穿(大小写/junction/UNC/短名)+ 可写校验两头落空(ACL 不查/写探针违约);放弃目录迁移 → pid8;侦测禁 glob;远端对账元数据 = 内容哈希+size+稳定 ID |

**采纳**(交叉命中 ≥2 或单点 P0):pid8 身份模型 / 三层身份与归一化管线 / 可写性运行时化 / ②边界重划(D10)/ 证据三档门控 + 零 git 强制 + 影子 git(D9)/ 预览行 + 黏性收窄 / 纳管空态主角 + 逐项纳管 / 侦测固定前缀有界探测 / 语义槽词表与路由自愈 / agent 内核动词面 / domains 注入收编 / `.git` 后至桥接 / 多机声明(跨机只携带 ③④)。

**否决**(留痕防重提):① 留 `.forge/` 跟代码根(违 D1,desktop 不写 `.forge` 进用户仓);唯一性 = 路径 ∪ git remote **硬**校验(误杀 worktree-per-project,降为软提示);「全部纳管」批量(workspace 可为任意 scratch 目录);三个替代方案整体替换;③无条件仓内默认(无 git 无仓可入,与零强制裁决冲突);Obsidian 式 vault 首启选择(forge 根是应用数据非用户内容)。

**用户终裁**(2026-09-26):证据门控采纳 + **「.git 不一定存在,不能也无法强制用户先创建本地 git 目录」** → 无 git = 应用管理主路径、全链路零 git 强制(D9);A2/A3 同日裁(落盘指令)。

评审全文五份存于当日会话记录,未另行落盘;本节为裁决性摘要。
