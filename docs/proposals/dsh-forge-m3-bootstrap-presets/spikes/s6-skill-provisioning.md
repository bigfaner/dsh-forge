---
created: "2026-10-07"
related: "../proposal.md#constraints--dependencies"
status: "executed（dev 形态 S6-1–5 全绿 + S6-4 判决反转 2026-10-07；残余经 3.9 复跑补验完毕 2026-10-08——S6-6 relay/S6-7 dev-tf（真实 dispatchTask 面）/S6-8 packaged ✅，见 spikes/m3-s5-s6-presets/VERIFICATION-3.9.md）"
---

# S6 spike：技能供给实跑（customSkillDirs 多根 + rank + L1 + worker 组合继承 + toolFilter，dev + packaged 双形态）

> 排程锚：提案 Constraints「S5/S6 = PRD 前 spike」。可执行工件 = [`spikes/m3-s5-s6-presets/`](../../../../spikes/m3-s5-s6-presets/)（与 S5 同一套——共享叠层/探针/spec）。承重假设 = 提案方案③ L1 双层、方案⑥ worker 供给矩阵、M2 3.4 遗留「技能目录发现结果不在机械观测面」。

## 方法

- **多根 + rank**：远征 customSkillDirs = [forge-core 探针根, forge-spec 探针根, plugin-forge skills]；user 根（`$DSH_HOME/skills`）播种同名 `m3-probe`（rank 400 败者方）。目录经真实模型转录（系统提示技能目录原样抄出——不调用工具、不加载全文）。
- **L1 预设层**：突击 customSkillDirs 不含 forge-spec 根——突击会话目录应**物理不含** `m3-spec-probe`。
- **标准模式疑点（M2 残余 + M3 设计输入）**：web bundle 在 base 层禁用 `skill-filesystem`（预设自带）——M2 3.4 的产品 overlay 把 customSkillDirs 打在该 base 行 config 上，patch 不改 `disabled`，**预期实际无效**（标准模式会话应看不到 plugin-forge 技能）。若证实：M3 预设必须自携 skill-filesystem 行（spike 叠层已是此形态），且 M2 5.4 dogfood 将实证此缺口。**→ 实跑判决反转：标准会话目录可见 plugin-forge 技能，「base 行 disabled 致 overlay 无效」假设不成立，见结果节。**
- **worker 组合继承**：远征默认会话经 subagent 工具派发子任务（调 m3_probe why=child-* + 转录技能目录 + 报告 AGENTS.md 标记字样）——断言子会话 id 相异、工具面含 m3_probe/skill、目录含 m3-spec-probe（继承达 worker）、AGENTS.md 标记可达（`dsh-agent-instructions` 对子代生效）。
- **toolFilter 行级 deny（二期）**：delegation 组 `tool-subagent` 行 config 加 `toolFilter.deny`（名字取自一期 dump 的工具名全集）→ 子代理 dump 的 toolNames 应不含被拒名。**行级 = 现成机制；per-call（模型每次调用传参）不可达 = 已源码核实（tool-subagent schema 无 per-call toolFilter）——M3 worker 按任务类型收窄的落位需插件自有派发面或预设级配置，本 spike 为其定证据基线。**
- **按需加载（旁证级）**：目录转录 prompt 明令「不加载全文」——目录行在场而全文不进上下文 = catalog 行级常驻、内容按需的运行形态旁证。

## 判定物

| # | 问题 | 绿判据 |
|---|------|--------|
| S6-1 | customSkillDirs 多根发现 | 远征目录含 m3-probe + m3-spec-probe + run-tests（plugin-forge skills 挂载） |
| S6-2 | 跨根同名 rank 决胜 | m3-probe 条目呈现 forge-core 版描述（300 胜 400），user-dup 版缺席 |
| S6-3 | L1 预设层物理边界 | 突击目录**不含** m3-spec-probe，但含 m3-probe/run-tests |
| S6-4 | 标准模式 M2 疑点 | 标准会话目录不含 m3-probe/run-tests（M2 overlay base 行打点无效——预期；若相反则 layering 判读需重审） |
| S6-5 | worker 组合继承 | 子代理 dump 在场、会话 id 相异、toolNames 含 m3_probe；子代理目录含 m3-spec-probe |
| S6-6 | AGENTS.md 到达 worker | 子代理回答包含标记字样（有） |
| S6-7 | toolFilter 行级 deny | child-tf dump 的 toolNames 不含 deny 名（dev-tf 二期） |
| S6-8 | packaged-abs 全绿 | 打包形态 + 绝对路径叠层：S6-1/3/5/6 复绿 |

## 结果（dev 形态实跑，2026-10-07；与 S5 同套 evidence.json）

- **dev（S6-1–S6-5 + S6-4 判决反转）：**
  - S6-1 ✅ 远征目录 = `[git-commit, m3-probe, m3-spec-probe, run-tasks, run-tests, submit-task]`（plugin-forge skills 挂载 + 双探针根并入）。
  - S6-2 ✅ m3-probe 条目呈现 **forge-core 版描述**（custom 根 rank 300 胜 user 根 400），user-dup 版缺席。
  - S6-3 ✅ 突击目录 = `[git-commit, m3-probe, run-tasks, run-tests, submit-task]`——**物理不含** m3-spec-probe（L1 预设层边界实证）。
  - S6-4 ✅（**判决反转**）标准会话目录 = `[git-commit, m3-probe, run-tasks, run-tests, submit-task]`——**可见** plugin-forge 技能；标准会话的 m3-probe 为 user 根版本（无竞争语义正确）。M2 3.4 base 行 customSkillDirs 打点**有效**；M2 5.4 dogfood 预期得正答。
  - S6-5 ✅（机械面）worker 子代理 dump：子会话 id = **裸 UUID**（无 `session-` 前缀，父 = `session-6709…`）；子工具面与父**完全一致**（host 面 9 工具：addTask/claimTask/createProposal/knowledge_read_abstract/knowledge_search/m3_probe/queryTask/submitTask/transitionProposal）——dispatchPrompt + 预设组合继承达 worker。
  - S6-6 ⬜ 残余：子代理目录转录 relay **文本**未取得（完成检测改副产物信号后环境故障断流）；工具面/会话 id 已证继承，仅叙述性文本缺口。
- **dev-tf（S6-7）：未跑**——环境故障阻塞（deny 名单已据 main-blitz 工具面备好：M3_TF_DENY=queryTask）。
- **packaged-abs（S6-8）：未跑**——环境故障阻塞；且试验床为 pre-M2-3.4 构建（runtime node_modules 无 plugin-forge），即使跑通对生产形态证明力有限（真正验证待 M2 3.4 构建）。packaged exe 手动 spawn 的**启动健康**已单独取证（profile 物化 created=4、壳窗口就绪）。

### 环境注记

与 S5 同一故障（新建 Electron 启动 renderer 在 `dsh-forge://app/` 得空文档，主进程健康、零报错；马拉松实跑后机器状态漂移）。详见 S5 环境注记。

## 结论与落点（dev 证据版）

- 提案回填点：①方案⑥ worker 供给矩阵——**继承机械面成立**（裸 UUID 子会话 + 同工具面）；toolFilter **per-call 不可达已源码核实**（tool-subagent schema 无 per-call 参数，仅行级 config）→ M3 worker 按任务类型收窄需插件自有派发面或预设级配置（行级 deny 可达，dev-tf 实跑受阻转确认项）；②方案③ L1 预设层「字面调不到」**实证**（突击物理缺 m3-spec-probe）；③M2 残余定性——**反转**：标准会话可见 plugin-forge 技能，M2 3.4 语义成立、5.4 dogfood 预期正答。
- PRD/tech-design 落点：SC2 断言口径（技能枚举/rank/L1 边界三断言实测背书；继承断言以 dump 机械面为准）；worker 派发面设计输入——三路由（预设级配置 / 插件自有派发工具 / in-process driver 直调）设计期裁决，per-call 路由已被源码证据排除。
- 残余（已裁决转 M3 实施期首任务补验）：S6-6 relay 文本、dev-tf、packaged-abs；环境故障本身。
