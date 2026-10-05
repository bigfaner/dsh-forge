---
created: "2026-10-05"
related: "../db-schema.md#§7-14"
status: "done（结论闭合）"
---

# S9① spike：发现面目录约定对仓外项目的发现率

> 排程锚：db-schema §7-14（PRD 前 spike）。问题 = M2 发现面按目录约定（docs/features/<slug>/{prd|design|ui|tasks|…} + docs/proposals/<slug>/proposal.md）扫描时，对**仓外项目**（非本产品建设的真实仓）的发现率——SC4 仓外 e2e 的数据来源是否可依赖「真实发现」支撑。可执行扫描器 = [`spikes/m2-s9-external-discovery/scan.mjs`](../../../../spikes/m2-s9-external-discovery/scan.mjs)（只读扫描，零写入）。

## 方法

对本机 8 个真实仓外目录 + 本仓对照组执行约定扫描（docs/features 子目录计数与子结构命中、docs/proposals/<slug>/proposal.md 计数、文档资产总体形态对照）。

## 结果（2026-10-05，8 仓 + 对照）

| 仓 | docs/features | docs/proposals | 文档资产形态 | 命中 |
|---|---|---|---|---|
| 对照·本仓（约定原生） | 2（含 manifest/全套子目录） | 4 | README · docs · .forge · .claude | 6 |
| **旧线 forge 仓本体** | **178** | **203** | 全套 | **381** |
| agent-task-center（经旧 forge 管理） | 1（全套子结构 + manifest） | 1 | docs · .forge · .claude | 2 |
| **pm-work-tracker（经旧 forge 管理）** | **28**（全套子结构 + manifest） | **28** | 全套 | **56** |
| train-recorder-kotlin（经旧 forge 管理） | 1（全套 + manifest） | 1 | docs · .forge · .claude | 2 |
| coding-harness | 0 | 0 | .claude · CLAUDE.md | 0 |
| everything-claude-code | 0 | 0 | README · docs · .claude · CLAUDE.md | 0 |
| learn-claude-code | 0 | 0 | README · docs · .claude | 0 |
| code-rudder | 0 | 0 | README · .claude | 0 |
| pro-essentials-workshop | 0 | 0 | README · docs | 0 |

关键事实：

1. **约定与旧线 forge 完全同构**（docs/features/<slug> + docs/proposals/<slug>/proposal.md + feature 目录内 manifest.md——旧线管线产物）。「仓外」经旧 forge 管理过的仓 = **100% 命中**（含 manifest frontmatter 初值来源——发现面「建行时读 manifest title/status 作初值」对旧线仓有源）。
2. 非 forge 系仓（无结构化管线文档）= **0% 命中**——非约定缺陷：这些仓本无 feature/proposal 结构化文档可发现，SC4 只读浏览锚点自然无源（空态呈现，符合设计）。
3. 性能面：178 slug + 203 proposal 的仓扫描瞬时完成（浅层目录判定，无内容解析压力）——「启动打开/建库」时点扫描无风险。
4. 边界观察：旧线仓存在非标准 slug（`current` / `get` / `get-active` 等短名/动词名 feature 目录）——发现面按目录约定「全类皆收、不猜语义」即可，无需白名单。

## 结论与落点

- **S9① 通过：SC4 仓外 e2e 可依赖真实发现**——两类数据源路径均成立：
  - **首选**：夹具工作区按约定预置 docs/features + docs/proposals 结构（种真实文件 → 走真实扫描链），断言发现面建行与文档页签浏览；
  - **加强**（可选）：以 pm-work-tracker / agent-task-center 等真实旧线仓做一条发现冒烟（非 UI e2e，单测/脚本级），实证大仓扫描与 manifest 初值。
- PRD 落点：SC4「仓外项目浏览」AC 可写为「夹具预置约定结构 → 真实扫描发现 → 页签只读渲染」链路（无需为 e2e 伪造发现结果）；概览/文档页签空态（零命中仓）= 一等展示态。
- tech-design 落点：发现面扫描契约（db-schema §2.1 骨架）照目录约定落地；manifest frontmatter 初值单向阀门对旧线仓天然有源，无额外面。
