# 行为验证与一致性抽查留档（dual-mode-overhaul · SC7/SC9 · 任务 1.11）

- 验证基线：`43d30d6c`（落地批次完成：2026-10-13 00:11 `23980cdb` persona → 01:07 `43d30d6c` README）。
- 方法与局限：本验证由子代理执行，无法新开会话派发独立 dogfood 任务；故采用**落地批次自身的真实产物**作为 after 样本（任务 1.1–1.10 在新 persona / 新公约下执行），与改动前（2026-10-12 及更早）同类提案产物对比。行数统计：UTF-8 解码后按行分隔符（`\r\n|\n|\r`）正则切分、含空行。
- 质量门：受影响面定向测试 `vitest run apps/host/src/profile/presets.test.ts packages/plugin-forge/src/prompt/index.test.ts packages/plugin-forge/src/plugin.test.ts` → **3 files / 63 tests 全绿（exit=0）**；`oxlint` → 0 warnings / 0 errors。

## ① Dogfood 对比：产物行数 / 返工迹象

改动前（旧资产下产出的提案，5 份近距样本）：

| 样本 | 行数 |
|---|---|
| `.forge/docs/proposals/dsh-forge-async-dispatch/proposal.md` | 348 |
| `.forge/docs/proposals/dsh-forge-m3.1-ui-alignment/proposal.md` | 313 |
| `.forge/docs/proposals/worker-lean-execution/proposal.md` | 310 |
| `.forge/docs/proposals/task-ui-visual-copy-blitz/proposal.md` | 222 |
| `.forge/docs/proposals/run-tasks-host-command/proposal.md` | 171 |
| **中位 / 均值** | **310 / 272.8** |

改动后（新 persona + 公约 + 模板下产出）：

| 样本 | 行数 | 说明 |
|---|---|---|
| `docs/proposals/dual-mode-overhaul/proposal.md`（SC8 按新模板中文写作的远征提案） | 65 | 含 mermaid 图、裁决记录、改动/影响范围表 |
| `.forge/docs/proposals/worker-exec-evidence-replay/proposal.md`（00:40 收口，persona 已落地） | 186 | 突击链路产物 |
| `.forge/docs/proposals/dual-mode-overhaul/walkthrough/run-tasks-fixchain-对照表.md` | 12 | 落地批次走查记录 |

- **行数**：提案类产物中位 310 → 65~186，降幅 40%–79%；提案正文明示的旧样例（366 行满篇调整/修复叙事）形态不再出现——新公约「不留调整/修复叙事、mermaid 优先、文字精简」在 after 样本中可观察（本提案自身 65 行即 SC8 自证样本）。
- **返工迹象**：改动前 5 份 proposal.md 各 1 个 commit（`git log --follow` 计）零返工；落地批次 13 份 SKILL.md 逐文件一次过（每文件 1 commit，无 fix/amend 跟进）；run-tasks fix-chain 协议段重写后逐字对照零漂移（见 walkthrough 12 行对照表）。双侧均未观察到返工 commit；简洁化未以牺牲一次通过率为代价。

## ② 单次 dispatch token 增量核算

逐次 dispatch 必带的提示词面（char 数，UTF-8 解码后）：

| 面 | 改动前 | 改动后 | Δ |
|---|---|---|---|
| `apps/host/src/profile/presets/expedition.patch.yml`（persona prefix 重写） | 8,893 | 9,077 | **+184** |
| `apps/host/src/profile/presets/blitz.patch.yml`（同上） | 8,261 | 8,406 | **+145** |
| `packages/plugin-forge/src/prompt/index.ts`（forge-pipeline 段源，含第四部分公约 + forgeDir 模板化；注入文本净增约 +60） | 3,170 | 3,236 | **+66** |

- **单次 dispatch 系统提示词增量 ≈ +210~400 chars**（persona +145/+184 与 pipeline 段 +66 组合）；按中文 0.6–1.0 token/char 估算 **≈ +130~400 tokens**，占典型 dispatch 提示词 <2%。token 换算为估算值（未跑 tokenizer），如实标注。
- **按需加载面净减**：13 份 SKILL.md 总量 76,058 → 42,204 chars（**−33,854，−44.5%**，英文→中文密度提升）；技能经 skill 工具按需加载，不计入 dispatch 基线，实际载入成本显著下降。
- 结论：风险项「提示词变长推高成本」实测可控——基线增量个位数百分比，最大加载面反而收缩。

## ③ 武器一致性抽查对照表（SC9）

| 检查项 | 抽查方式 | 结果 |
|---|---|---|
| persona 零矛盾指令（run-tasks 铁律 3：分工纪律单一归属技能层） | persona 仅一行引用：`expedition.patch.yml:34` / `blitz.patch.yml:28`（「分工纪律按各技能自身铁律执行，persona 不重复其分工」）；两包 13 份 SKILL.md grep `远征作风\|突击作风\|资深技术专家\|产品型` **零命中**（旧作风契约行清除） | ✅ |
| 零重复纪律（公约单源系统提示段） | 9 份技能（brainstorm/quick-tasks/write-prd/ui-design/tech-design/gen-journeys/gen-contracts/gen-test-scripts/eval）grep `文档风格公约` **零命中**；单源 = `prompt/index.ts:77`；唯一残余 = breakdown-tasks 两行速查 + README 自述（`skills/README.md:17`，提案口径内） | ✅ |
| 术语全库一致（`slug/local-id` / `fix-N` / `disc-N`） | 全库 26 处命中，contracts（`dto/forge.ts:24`）/core（`tasks/add.ts:127`、`prompt/index.ts:62`）/技能（`run-tasks/SKILL.md:145,148`）语义一致；契约测试 `prompt/index.test.ts:25-27` 断言在绿 | ✅ |
| 冻结锚点保留 | `State-Layer Discipline` 段名 4 处原样（ui-design/gen-test-scripts/gen-journeys/gen-contracts SKILL.md）；`<HARD-GATE>` 等标签名沿用；旧英文行文残留 grep `you must\|do not\|never\|always` 两包 **零命中** | ✅ |
| persona ≤12 行 | 两个 preset persona prefix 正文均 6 行（yml 29–34） | ✅ |
| 简洁性（指导值=现状行数、硬上限=×120%） | 13 份对照：12 份达标（run-tasks 189→168、submit-task 111→98、gen-test-scripts 89→78 等）；**tech-design 85→124 行（146%）超硬上限**——超因 = SC5 强制新增四段（技术栈选型/架构决策/模块包设计/交互契约三要素），规范内在张力，如实记录提请裁决 | ⚠️ 12/13 |

## 记录字段

- testResults：presets + prompt/index + plugin 三测试文件 63 tests passed（vitest，exit=0）；oxlint 0 warnings / 0 errors。
- issuesFound：tech-design SKILL.md 124 行超 120% 硬上限（146%），源于 SC5 内容增量与 SC9 行数上限的规范张力——非本次验证引入，留档供裁决（放宽该文件上限或继续压缩）。
