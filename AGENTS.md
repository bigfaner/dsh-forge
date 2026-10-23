# AGENTS.md — dsh-forge 工作区约定

## 1. dsh 集成纪律

### 1.1 只插孔，不改制
- 对官方 dsh 机械（会话/工作区/发送链等）的任何拦截、包装、扩展，只允许落在官方留出的合法缝（槽位影子、inject face、adopt 正门、ignorable 事件直写、方法 wrap）；承重假设依赖前必须到官方包源码核销。正本见 `docs/conventions/official-mechanics-interception.md`（合法缝清单、六条硬约束、决策流程、交付要求）。
- 关键硬约束速记：单写者铁律（禁建后补写会话日志）、header 不可变（落点决策做在创建时点）、正确性必须 host 单点保证（客户端竞速只算体验优化）、非介入面零行为差异且零固定税（分流优先装配期）。

### 1.2 复用优先，不自造机制
- 需要能力时先核销官方同语义机械（ctx 服务键/事件/slot/loader/plugin-manager 等），有则复用；候选机制须读源码弄懂声明方式、生命周期、持久化/失效与并发语义后才能裁定——判定「官方没有」须以穷尽读懂为前提；确需自建须在提案/技术设计记录「官方缺什么、为何不自建进官方」。装配缝合优先走官方缝（cordis inject 服务键、官方 loader、plugin-manager 安装通道），不发明平行注入机制。正本见 `docs/conventions/reuse-official-mechanisms.md`。

### 1.3 插件可移植性
- **装配缝归属插件域**：插件包（`packages/plugins/*`，如 git-worktree）的装配缝（编排逻辑、与官方机械的缝合面）属于插件自身——插件面向一切满足 dsh 规范的应用，不只服务 dsh-forge。宿主只做 wiring（通道注册 / service provide / Face 注入）。正本见 `docs/conventions/plugin-portability.md`（目标分层、判据、现状漂移面）。

### 1.4 外部依赖装配面取证
- **外部依赖装配面结算门 = 真机端到端取证**：子进程/网络/外部文件系统/上游闭源机械的装配代码，fake 契约测试全绿不算交付。正本见 `docs/conventions/external-dependency-verification.md`（适用范围/取证方式/边界）。

### 1.5 依赖与上游
- **官方上游包允许直接 import，禁止 vendor**：「不 vendor」只约束不拷贝官方源码进仓；依赖官方 npm 公开包 + 版本精确 pin 是既定正道（host 依赖三十余个 `@deepseek-ai/*` 包为证）。
- **不存在「零上游 import」全局口径**：该纪律仅是个别产品自建模块的局部决策（事件总线裁决⑧、notify 通道等），不得放大为项目级约束，也不得据此用 `ctx.reflect.get(name)` 丢类型取法规避类型化 import。
- **Cordis 可选具名服务取法**：优先 type-only import 官方包（保留 `ctx.<service>` 具名服务全量类型安全）+ 运行期存在性检查承担 fail-soft；`ctx.reflect.get` 仅限有其局部成因的既有先例，不作为新代码默认配方。
- 先例：`mobile-remote-approval/disc-1`（审批桥接面配方修正）。

## 2. 工程环境（Windows）

- **任务执行/质量门一律 run-once 命令，禁用 `--watch` 形态**（vite build --watch / tsc -b --watch 等）——worker 结束后 watch 子进程成孤儿持续吃 commit，已实证耗尽全局内存（判例 2026-10-16：两个孤儿 watch 共 3.5GB 触发连环原生崩溃误诊）。
- **任何原生内存崩溃先查 commit charge 再定位进程**：症状族（exit 3221226505 / heap OOM / PowerShell 0x800705AF）在 commit ≥ 95% limit 时是环境级耗尽，崩在哪个进程纯看运气——对具体进程做配方排查即误诊。诊断命令与清理流程正本见 `docs/conventions/windows-commit-exhaustion.md`。根治已落地：worker 任意终态经进程树 Job Object 整树回收（`packages/plugin-forge/src/spawn/job-tree.ts`）；pagefile 扩容记录暂缓（用户裁决：记录不实施）。
- **对目录做可继承 ACE 授权（icacls /grant (OI)(CI)）必须预铸时序 + 幂等短路 + 超时上界**：可继承 ACE 写入触发 NTFS 全子树物化传播——满树分钟级独占 1 核，空目录毫秒级；先建空目录授权再填充内容则文件出生即继承、零回溯成本。判例 bug f9a23367（曾阻塞会话发送链路）。正本见 `docs/conventions/ntfs-acl-grant-timing.md`。

## 3. UI 与设计

### 3.1 官方对齐
- **完全对齐官方 dsh 逻辑，尽量复用官方组件**：本项目自建 host 与 UI 层，组合官方组件需要写的**胶水代码**（装配、透传、状态缝合）是允许且预期的交付物；但**不自行编写组件**——官方已有同语义组件/机械（Modal、Switch、dialog 形态、配对/认证流程等）一律复用官方件，产品层只做组合与注入。
- 对齐判据 = 官方实机形态逐位对照（布局、交互词汇、状态语义、刷新/超时机制），不是「语义近似」；走查取证截图归档 `.forge/docs/proposals/<slug>/walkthrough/`（留盘不进 git）。

### 3.2 DESIGN.md
- 根目录 `DESIGN.md` = 本项目设计系统规范：从源码提取（官方 `@deepseek-ai/dsh-client-ui-theme` 令牌 + 产品自绘面 `.dswf-*`），首要原则是**样式尽量跟 dsh 对齐**，非独立设计语言。
- **何时使用**：写任何 UI 代码（新视图、组件、样式）前先读 `DESIGN.md`——取色/字/距/圆角/阴影一律按其令牌表与 Do's/Don'ts，不凭记忆猜值；做 ui-design 类技能或设计走查时是设计侧唯一基准；评审 UI 改动、判断「像不像 dsh」以其对齐判据为口径。
- **何时更新**：令牌消费面出现新自绘形态、或官方包版本升级导致令牌值变化时，同步回写；文档只呈现当前事实，不记调整修复叙事。

## 4. 常用工程命令（质量门参考）

工具链：pnpm + TypeScript（tsc -b）+ oxlint + vitest + Playwright。一律 run-once，禁 `--watch`。

| 门 | 命令 | 说明 |
|---|---|---|
| compile | `pnpm lint:types`（= `tsc -b`） | 全量类型编译；完整产物构建用 `pnpm build` |
| fmt | `npx oxlint -c oxlint.config.ts --fix <路径>` | 无独立 formatter；oxlint --fix 承担自动修复 |
| lint | `pnpm lint` | 全量门 = ox + imports + tokens + selftest + types + test-types；快速单项用 `pnpm lint:ox` |
| test | `npx vitest run <受影响的测试文件或目录>` | **针对性执行受影响功能的单元测试，不跑全局**；契约测试用 `pnpm test:contract`；e2e 用 `pnpm test:e2e` |

- **test 纪律**：`pnpm test`（全局 `vitest run`）只作参考口径；agent 执行质量门时按本次改动定位受影响的测试文件/项目，针对性运行；全局跑仅在跨包重构或收口验收时使用。
- **测试策略正本**：测试分层、执行树布局、旅程/脚本目录约定与环境约束见 `docs/conventions/testing/core.md`——应用向 forge 测试链（gen-journeys → gen-contracts → gen-test-scripts → run-tests）声明的策略与约束；技能在仓内探测该目录，在场即装载遵循。

## 5. Git 与提交

### 5.1 分支合并纪律
- **禁止 agent 直接合并到 main**：任何分支合入 main 必须先经人类审核——agent 列出合并范围（commit 清单 + diffstat + 回归证据），人类明示批准后才可执行 `git merge`；不得以「上一次获批」为由沿用授权。

### 5.2 提交纪律
- 提交按逻辑单元分批，指名路径 add，禁 `add -A/.` 一把梭；不夹带无关改动与过程产物。
- **插件版本随改动同步 bump**（`packages/plugins/*/package.json`，semver 位）：修 bug → patch 位 +1（0.1.**x**）；功能升级/新增 → minor 位 +1（0.**x**.0）；bump 与对应改动同一提交落。先例：input-history 0.1.1（bug ce803be8 修复）。
- **不要提交过程文件**：走查截图、临时取证图、探针脚本输出等过程产物一律不进 git 提交。
  - `.forge/docs/**/*.png` 已被 `.gitignore` 默认忽略——**禁止 force-add**（d32/d35 的 force-add 归档是旧先例，已被本裁决取代）。
  - 过程文件归档到 `.forge/docs/proposals/<slug>/walkthrough/` 等工作区目录即可（留在盘上、留在 git 外），在提交说明里用相对路径引用。
  - 提交只含代码、测试与文档（`.md` 台账/走查记录属文档，可提交）。
