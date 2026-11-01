# 评审报告：loop-consol-flywheel-hardening（050c6538，under-review）

- 评审基线：proposal.md @ 454ca782；落点实核以工作区当前检出为据。
- 评审方式：独立通读 + 逐落点文件实核，只出报告不改提案。

## 一、内部一致性（改进项 ↔ 改动范围 ↔ 验收标准 ↔ D 清单）

| 改进项 | 改动范围 | 验收 | D 清单 | 结论 |
|---|---|---|---|---|
| 2.1 状态窗口约束 | test-runner.md | AC1 | — | 对齐 |
| 2.2 CDP 零仪表化对照 | AGENTS.md | AC2 | D1 | 对齐 |
| 2.3 双 convention 晋升 | docs/conventions/ | AC3 | D2 | 对齐 |
| 2.4.1 withdrew 契约 | lessons + proposal-reviewer.md | AC4 | D3 已定案 | 对齐 |
| 2.4.2 / 2.4.5 退役清单 + 伴随件 | quick-tasks SKILL.md | AC4 | — | 对齐（提案自declare合并一条，无重复） |
| 2.4.3 台账核验闭环 | submit-task SKILL.md | AC4 | — | 对齐 |
| 2.4.4 恢复原语转出 | 独立机械提案 | AC5 | D4 | 对齐（仅立项不实施，边界清晰） |
| 2.4.6 文本样稿前置 | grilling + quick-tasks | AC4 | — | 对齐，但落点路径表述有误（见 Q1） |
| 2.4.7 polish backlog | verification/ 产物 + 小改清单 | AC6 | D5 | 对齐（CE-6 已收敛并在 AC6 明示不入交付面，无孤儿） |

无孤儿项、无落点漂移；AC4 措辞「落档于裁决确定的落点文件」中 2.4.6 的 grilling 落点并非裁决项而是提案钉死项，措辞小瑕（见 N3）。

## 二、落点实核（逐一在场 + 可挂载）

| 落点 | 在场 | 挂载点 |
|---|---|---|
| `packages/plugin-forge/experts/test-runner.md` | ✅（77 行） | 「执行约束」节（:56-63）或 HARD-GATE 前新增走查预案约束段均可挂；档案 :11 自认 run-tests 编排纪律承载，落点声明与事实相符 |
| `packages/plugin-forge/experts/proposal-reviewer.md` | ✅（30 行） | 「同步核对项」（:19）追加 withdrew 契约核销项即天然挂载 |
| `packages/plugin-forge/skills/quick-tasks/SKILL.md` | ✅（73 行） | 「scope 切分」（:27）+「输出清单」（:64-73）可挂退役清单与伴随件默认纳入 |
| `packages/plugin-forge/skills/submit-task/SKILL.md` | ✅（85 行） | 「结算清单」（:44-49）可挂台账动词实际生效核验；:15-18 已有「不报没做过的动作」口径，新增项与之同源不冲突 |
| `AGENTS.md` §2 cdp 条目 | ✅（:32） | 条目为单句散条，扩一句零仪表化对照纪律可直接续写 |

另核：2.4.4 的空转断言与 submit-task SKILL.md :72「修复完成后源任务自动恢复」不矛盾——fix 径自动恢复已存在，空转发生在「主会话裁决修订 AC」径，提案对根因的切分准确。

## 三、2.3 双 convention 晋升成熟度（D2 倾向：均晋升）

- **equivalent-evidence-over-visual-artifact.md**：口径三要素（主证据/等效证据/纪律）定义句清晰，有主会话终裁事实锚（AC4，2026-10-28 采用）与依据文件。具备晋升条件。
- **review-note-deferred-fact-backfill-gate.md**：有双例实证（N-1/N-2）+ 实现期 24 值映射表闭合 + pin 测试防漂移，判据（何时 Note 何时 Blocker）可操作。具备晋升条件。
- 两件均通过真实走查/评审闭环检验，非单例直觉；倾向**两件均晋升**（与提案 D2 倾向一致）。

## 四、分级清单

### Blocker

无。

### Question（呈用户裁决）

1. **Q1｜2.4.6 grilling 落点路径不实**（proposal.md:66 与 :100）：提案写 `resources/runtime/.../skills-blitz/grilling`，实核 grilling 唯一在场位置为 `packages/plugin-forge/skills-blitz/grilling/SKILL.md`（grep 全仓 SKILL.md 仅一处命中）。需确认 resources/runtime 下是否另存副本；若无，落点表述须修订为实际路径，否则 quick-tasks 拆解期会找不到装配点。另外 quick-tasks SKILL.md 本身无「访谈清单」节（其 :12 澄清步是最近挂点），2.4.6 声称「quick-tasks SKILL.md 各 +1」的挂载强度弱于 grilling 侧（:32-39 事实查证清单是天然挂点）——建议拆解期把 quick-tasks 侧约束落在第 0 步澄清节。
2. **Q2｜D5 中 DEV-3 的「小改」定性存疑**（proposal.md:77）：DEV-3（dispose/异常终局遗留 in_progress 任务有界滞留）的修复方向是「恢复径扩展或 reconcile 对账覆盖」——两者均触及 forge 管线任务状态机机械，量级与「apps/web 渲染面小改」（:102）的归类口径不符，且与 2.4.4 判「远征量级转出」的状态机改动性质相近。建议 D5 裁决时对 DEV-3 单独定轨（随纳入但独立评估量级，或与 2.4.4 同栈转机械提案），其余各项整体纳入无异议。
3. **Q3｜D1 落点形态**：倾向同意提案倾向（AGENTS.md :32 扩一句，判例留 knowledge）——该条目本为无正本散条，扩句改动最小；独立 cdp 正本在判例积累到多例前属过早沉淀。可辩点仅在「扩句后 AGENTS.md §2 条目变长」的密度代价，影响轻微。

### Note（留档不阻塞）

1. **N1**：D4 倾向同意立独立机械提案——空转链有 4 次同构实证（fix-6/9/10/11），恢复原语属管线机械且 submit-task :72 已证明「自动恢复」机制在 fix 径可行，机械层补齐有先例可循，非过度设计。
2. **N2**：equivalent-evidence convention 晋升时建议把「依据」段的具体走查产物路径（其 :16）改写为泛化判据表述（晋升正本不绑单次走查工件），原 `.knowledge` 版本可保留出处锚。
3. **N3**：AC4（proposal.md:110）措辞「各检查项/模板落档于裁决确定的落点文件」对 2.4.6 不准确——grilling 落点在提案内已钉死、非裁决项；可随 Q1 一并修订。
4. **N4**：test-runner.md 落点建议在裁决后拆解时明确挂载节（「执行约束」:56 或 HARD-GATE :65 前），避免约束以游离段落在档案正文漂移。

## 五、整体裁决建议

**accept-with-edits**：需求覆盖完整、四面对照无孤儿、五个落点全部实核在场且可挂载、双 convention 具备晋升事实基础，无 Blocker。裁决前随修订收口三处：Q1（2.4.6 落点路径改实）、Q2（DEV-3 量级单独定轨）、N3（AC4 措辞）；D1/D2/D4/D5 倾向均可采纳提案自报倾向（Q2 附 DEV-3 例外）。

——评审员（proposal-reviewer），只读评审，未改任何文件。
