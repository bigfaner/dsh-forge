# M3.1 D1–D28 逐行证据汇总（差异清单打勾表）——SC-8 终验输入

> **任务**：`dsh-forge-m3.1-ui-alignment/1.13`（终局验证，type=test-run）｜**基线**：HEAD `69d01ed`（2026-10-10）｜**汇总日期**：2026-10-10。
> **用途**：用户 SC-8 人工终验按 [proposal 差异总清单](../proposal.md)（D1–D35）逐行打勾的**证据底稿**——本表覆盖 D1–D28（D29–D35 追加行归任务 1.14–1.22 各自台账，不混入本表口径）。
> **判定图例**：✅ = 机械面证据在场且绿（commit + 断言/台账锚）｜⬜ = 待用户实机走查打勾（SC-8）｜⚠ = 在场但带显式记账/残差。

## 一、质量门总表（本任务实跑，2026-10-10）

| 门 | 结果 | 证据 |
|---|---|---|
| ① `just compile`（tsc -b + copy-assets + vite build） | ✅ exit=0 | vite `✓ built`；chunk>500kB 警告为已知非阻塞项 |
| ② `just fmt` | ✅ exit=0 | no-op（仓未配置格式化器——配方自述） |
| ③ `just lint` 六门 | ✅ exit=0 | ox **0 warnings / 0 errors**；import-lint **0 违规**（319 文件）；**token-lint 0 裸值（239 文件）**；selftest 14 规则拦截全命中；`tsc -b` + 九 tsconfig.test 全过 |
| ④ vitest 全量 | ✅ exit=0 | **225 测试文件 / 3070 用例全绿**（M3.1 序内 D1–D3 落地时点为 221 文件 / 2970 用例——总量只增不减） |
| ⑤ e2e 池（Playwright _electron，10 journey） | ⚠ **部分红** | 见「五、e2e 池记录」——3 journey 全绿 / 7 journey 存在失败，失败清单与根因假设已记账，**fix 链承接**（本任务不修产线码） |

> 执行环境注记：首轮池全体 journey 秒败 = 会话环境 `ELECTRON_RUN_AS_NODE=1`（DSH 宿主 Electron 链继承）毒化 `electron.launch`——环境修复（摘除该变量）后复跑（cycle-2），下表为 cycle-2 实测。000-canary 在两轮均绿。

## 二、断言零弱化台账汇总（锚点迁移对照——硬条款）

| 迁移族 | 台账位置 | 用例（前→后） | 断言（前→后） | 记账 |
|---|---|---|---|---|
| D21 弹窗化 + D23 挂载半（单测族） | [drawer/README.md](../../../apps/web/src/views/overview/drawer/README.md) §D21 | 113 → 121 | 519 → 580 | +8 用例 / +61 断言；退役面全部显式记账（否定断言承载） |
| D21（e2e 族） | 同上 | 12 → 12 | 125 → 143 | +18 断言（几何组新增；未改动 spec td-* 锚零漂移） |
| D22 双形态（单测迁移族） | 同上 §D22 | 43 → 55 | 158 → 212 | +12 用例 / +54 断言（完整面断言迁移至 ⤢ 展开前置——计数零弱化；简要面为新增组） |
| D14/D15 胶囊 chips + 下划线子 tab | `tests/structure/overview-chips-subtab.test.ts` | — | +9 结构 pin | 新增组（读文件法 pin CSS 形态语义；DOM 锚零变化，e2e 免迁移）——commit `098e98f` |
| D24/D25 Forge设置 Menu 化 | commit `af4e679` | 迁移记账 | 零弱化 | `<option>/<select selected>` → `fsMenuItems`/目录纯函数锚 + `data-dswf-fs-dd` 值化锚；plugin.test 零-inject pin → inject=loadModelCatalog 四路测试 |
| 全局 vitest 总量 | 本任务实跑 | 221 → 225 文件 | 2970 → 3070 用例 | M3.1 序内只增不减（M3 基线更低） |
| 系列内零弱化 commit 记账 | `698ed0b`（D18/D19 e2e ovr）/ `34994b3`（D30：12 测试文件 title 锚就地迁移 + e2e sc3）/ `0e11ad7`（D29 结构 pin） | — | — | 各 commit message 显式「零弱化」记账（D29/D30 行在 D1–D28 表外，此处留汇总痕） |

## 三、D27 令牌纪律盘点

- **lint-tokens**：`[token-lint] 0 裸值（239 个 css/ts/tsx 文件扫描）`——零违例 ✅（本任务实跑；自证样例 `_lintpos_raw_exempt.css` 放行 + `_lintneg_tokens.*` 拦截双向验证）。
- **--dsw-* 最近语义映射全量核对**：色值零裸值（lint 机械面）+ 逐面映射注记在场（各 css `原型 Npx → 最近语义令牌` 行注，如 dispatch-panel.css:25 `原型 10px → md = 12`、drawer.css:33 同式）✅。
- **dsw-raw 结构刻度豁免注记盘点**：全仓 **291 行豁免 / 22 文件**，逐行注记理由；**零颜色携带**（hex/rgb(/hsl( 全量审计 0 命中）——豁免通道未被用于走私色值，全为结构刻度（宽高/内距/层号/过渡时长）✅。

| 文件（top） | 豁免行 |
|---|---|
| views/overview/task-tab/task-tab.css | 48 |
| views/overview/drawer/drawer.css | 37 |
| views/session/dispatch-tool-row.css | 35 |
| views/sidebar/sidebar.css | 27 |
| views/overview/overview.css | 22 |
| views/knowledge/knowledge.css | 18 |
| views/session/dispatch-panel.css | 16 |
| flows/add-project/browser.css | 14 |
| 其余 14 文件 | 74（单文件 1–11 行） |

## 四、D1–D28 逐行打勾表（SC-8 输入）

> 「证据面」列 = 实机走查输入；对照走查项（D7–D9/D11）以 [1.5 归档](./README.md) 为底稿，残差清单见各归档文件。

| D | 差异点 | 实现证据（commit） | 机械面 | 证据面 | 判定 |
|---|---|---|---|---|---|
| D1 | 左栏右缘竖线 1px 常驻 + 圆角移除 | `273650a` | pin-15-wco-shell-compensation **27 断言**（`tests/contract/`）；wco.css:29 `border-right: 1px var(--dsw-alias-border-l3)`（亮/暗联动） | 实机亮/暗竖线观感 | ✅ + ⬜ |
| D2 | 收起 = 59px rail 图标列常驻 | `273650a` | pin-15；wco.css:48/55 轨宽 + sidebar.css rail 36 命中区刻度 | rail 图标件 + 官方偏离记账核对 | ✅ + ⬜ |
| D3 | 项目行仅名称 + 悬停提示 | `273650a` | pin-15 投影 + title 悬停断言 | 悬停提示实机 | ✅ + ⬜ |
| D4 | 壳面与件面（新会话钮/插件行/知识库行/段头/视图选项/会话行刻度） | 官方承载（零实现） | 原型 R10–R17 逐值核对记账（proposal） | 与原生 dsh 观感一致核对 | ⬜（零差异记账行） |
| D5 | 会话头 pill 槽位卸载 | `d05b8b4` | plugin.test 会话头零产品 pill + `onOpenTask`→桥直开断言 | 会话头零挂件实机 | ✅ + ⬜ |
| D6 | 派发任务悬浮面板 | `d05b8b4` + `69d01ed`（⟞/worker 打开收口） | DispatchPanel 单测族 + e2e m2 `task-session-linkage` D6 几何交互组 | 面板全交互实机（拖/折/⟞/树零联动） | ✅ + ⬜ |
| D7 | 知识召回 tab 对照走查 | `dbf9e4b`（1.5 归档） | —（对照走查项，非重裁面） | [D7 归档](./D7-recall-tab.md)（样式残差 1 项 R1） | ⬜ |
| D8 | hero 面板对照走查 | `dbf9e4b` | — | [D8 归档](./D8-hero-panel.md)（几何残差 1 项 R2：插画 85%↔80%） | ⬜ |
| D9 | 知识面板对照走查 | `dbf9e4b` | —（M3.8 对齐复核成立，零样式残差） | [D9 归档](./D9-knowledge-view.md) | ⬜ |
| D11 | dock 开始页（去留待裁决） | `dbf9e4b` | — | [D11 归档](./D11-dock-start.md)（**去留单列待用户**） | ⬜ |
| D12 | 概览内容弹性填满 | `d657f85`（fix-6） | e2e m2 ovr 填充形态 | 填充观感 | ✅ + ⬜ |
| D13 | 卡片语言（灰底/浮卡/meta 块/顶分隔线） | `d657f85` | overview.css 卡片语言 + 结构 pin 族 | 与原型并排对照 | ✅ + ⬜ |
| D14 | 彩色胶囊 chips | `098e98f` | structure pin **9 断言**（overview-chips-subtab） | 五态/七态着色实机 | ✅ + ⬜ |
| D15 | 下划线子 tab | `098e98f` | 同上结构 pin | 下划线高亮实机 | ✅ + ⬜ |
| D16 | 提案子 tab（mode chip/摘要独行/两列元数据/文档区/行头新会话钮/⋯评审流转） | `4e3e573` | mode chip 三态断言 + ModeDialog/VerdictDialog 零回归 | A 区逐项对照 | ✅ + ⬜ |
| D17 | feature 子 tab 分层文档 | `dd9d7fd` | e2e 锚 `data-dswf-ov-doc` 免迁移 + 结构形态 | B 区逐项对照 | ✅ + ⬜ |
| D18 | taskbar 形态（视图下拉同行右侧/七态 chips 次行/全终态派发置灰/计数注收悬停） | `698ed0b` | 几何锚（y±6）+ e2e ovr 零弱化 | C 区 taskbar 对照 | ✅ + ⬜ |
| D19 | 三视图卡片语言（list/DAG/泳道） | `698ed0b` | e2e 补 DAG 节点/泳道卡点击→弹窗锚（零弱化） | C/D 区三视图对照 | ✅ + ⬜ |
| D20 | ov-head 同位翻转钮 | `d657f85` | 官方 ChevronDown 旋转 + 展开↔收起文案 + aria-expanded | 三次几何同位实机 | ✅ + ⬜ |
| D21 | 抽屉→可拖动弹窗（全窗拖/缘宽 320–760/单例/Esc/✕/默认位不记忆） | `84dd3fa` | **台账 §D21**（+8/+61 单测；e2e +18） | 几何交互实机（SC-2 动线） | ✅ + ⬜ |
| D22 | 简要 440 ↔ 完整 720 双形态 | `ef356d1` | **台账 §D22**（+12/+54） | 双形态往返实机 | ✅ + ⬜ |
| D23 | 四路打开来源 + 挂载独立于 dock | `84dd3fa` + `698ed0b` + `69d01ed` | ShellHost 常驻树挂载断言 + 三视图点击锚 + ⟞/pill 判读链三组单测 | 四路实机各自开弹窗 | ✅ + ⬜ |
| D24 | Provider/Model = 官方 Menu 件 | `af4e679`（+`ffe85c9` Reasoning seg 同形退役） | `fsMenuItems` 纯函数锚 + `data-dswf-fs-dd` 值化锚（零弱化迁移） | F 区 Menu 形态实机 | ✅ + ⬜ |
| D25 | 选项源 = 「设置>模型」目录 + worker 成组 | `af4e679` + `2d80a04` | inject=loadModelCatalog 四路测试 + 目录兼容收口 | 未配置 ⚠/保存反馈实机 | ✅ + ⬜ |
| D26 | 零过程注释文案 | `9a54649` | 字符串级负向断言 + 「零注记」硬规则入纪律 | 正式 UI 零注释实机 | ✅ + ⬜ |
| D27 | 令牌纪律 | 本任务 | **lint-tokens 0/239 + dsw-raw 291 行盘点（0 颜色携带）**（§三） | — | ✅ |
| D28 | 亮/暗双主题全形态 | 本任务 | 全令牌联动机械面（色值零裸值）+ [D28 走查记录](./D28-dual-theme.md) 六面逐面 | 六面亮/暗实机走查 | ✅（机械）+ ⬜（实机） |

## 五、e2e 池记录（cycle-2，2026-10-10）

> 逐 journey 实测（`just test <journey>`；dev→probe→tests→teardown 生命周期）。**本表为诚实记录——失败即失败，不留静默。** 汇总：**3 journey 绿 / 7 journey 红；用例面 27+37+若干绿 vs 87 红 / 10 留痕 skip。**

| journey | 结果 | 明细 |
|---|---|---|
| specs/000-canary | ✅ exit=0 | — |
| specs/host-boot | ✅ exit=0 | 2 passed（15.8s） |
| specs/web-shell | ✅ exit=0 | — |
| specs/smoke-skeleton | ❌ exit=1 | 2 passed / **2 failed**：三区/视图互换组（`[data-dswf-view="session"]` toBeAttached——spec:99）+ 向导两段组（firstWindow 即闭，4.4s） |
| specs/knowledge-integration | ❌ exit=1 | 1 passed / **1 failed**：注册→真数据组（工作区芯片 30s 不可见——spec:183 → support/rpc.ts:69；注册/浏览/抽屉段全过） |
| specs/installer-pipeline | ❌ exit=1 | 2 passed / **1 failed**：打包形态 boot（firstWindow 30s 超时） |
| specs/flywheel | ❌ exit=1 | **1 failed**：飞轮 6 步链（同工作区芯片——spec:115） |
| specs/m2 | ❌ exit=1 | **37 passed / 32 failed**：工作区芯片 ×8；boot/浏览器即闭族 ×12（shell-ready 60-90s 超时 ×7 + firstWindow/中途 browser-closed ×5，含 `bridge rpc 发送失败（IPC 通道已关）`）；ovr 计数注 title 空 ×1（`[data-dswf-tt-contpill]` title 期望 `/· 3 条/` 得 `""`）+ ovr Step4 点击超时 ×1；dogfood 断言错 ×1；注册派生族交互超时 ×9 |
| specs/m3 | ❌ exit=1 | **22 failed**：boot 即闭（firstWindow browser closed）×7；官方面元素缺失（工作区芯片 ×4 + `打开右侧边栏` 展开钮 ×4，navigation.ts:28）×8；其余为同因派生（worker 0ms 连带等）；dogfood ×1 |
| specs/p1mvp | ❌ exit=1 | **27 passed / 19 failed / 10 skipped（留痕）**：工作区芯片族（brand 双主题锚 ✘1 / session-workbench / krf 步骤 / sidebar-view-align 新会话钮链）；注册/补偿族 ×5；installer-smoke 前半（NSIS 静默装→boot 失败，31.3s）×1 + offline 留痕 skip ×1；boot/dogfood 若干 |

### 失败三族 + 根因假设（fix 链承接输入；本任务零产线码改动）

1. **【主族·功能回归嫌疑】官方面元素缺失**（跨 journey ≥15 用例红）：composer 工作区芯片（`默认工作区|选择工作区`）与 hero/会话面右栏展开钮（`aria-label="打开右侧边栏"`）不渲染——**注册与官方会话面局部正常**（composer 在场、注册断言全过）。**时间窗实证**：同 spec（tsl D6 几何交互）昨晚 01:51（`e2e-tsl-run6.log`）已过芯片步至 :569 几何断言，今 14:00 HEAD 死于芯片步——回归窗口 = {`0e11ad7` D29 / `34994b3` D30 Tooltip / `69d01ed` ⟞ 会话打开收口}（三件均 apps/web）。D30 Tooltip = 锚定克隆子元素机制，73 处包裹面嫌疑居首。**归因 bisect 归 fix 任务。**
2. **【boot 瞬败族】**firstWindow 即闭/超时 + 中途 browser-closed + IPC 通道已关（跨 journey ~20 用例）：同 journey 内同型 boot 后续用例均绿——环境性瞬态（端口段轮转 / commit charge 压力，SMOKE-LEDGER §0 记同族史）与真实 boot 期崩溃（嫌疑 D30 Tooltip 大面积挂载）两可，**需复跑 + 崩溃转储定性**。
3. **【点状】**ovr 计数注 title 空（D18 锚）×1、dogfood/凭据门若干（本环境在场凭据形态，真实模型链结果待定性）、installer-smoke NSIS 装→boot 失败 ×1。

### M3.1 定界声明

m3.1 触面（m2/m3 旅程 + ovr/tsl/sc6/sc7/uf3/overview-entry 等）以任务级断言零弱化台账逐一收口（§二）；上表失败 spec 均不在 m3.1 任务级 e2e 门清单内，但**芯片族时间窗证据指向 m3.1 末段 commit**——不排除本轮回归。**本任务按 test-run 硬门如实呈报：池未全绿 → blocked，fix 链承接，不以「疑非本轮回归」放宽门禁。**

## 六、SC-8 动线指引

1. 按第四节表格逐行打勾（D7–D9/D11 用 1.5 归档底稿 + 实机；D28 用 [D28 走查记录](./D28-dual-theme.md) 六面动线）。
2. e2e 失败三族（§五）待 fix 链收口后复跑全绿，再签池门。
3. D11 去留、D33/D34/D35 残差（任务 1.18/1.20/1.22）与 D29–D31/D32 行（任务 1.14–1.17/1.21）在 D1–D28 表外，按 proposal 差异清单各自行随对应任务收口后一并打勾。
