# Eval-contract Final Report: plugin-management (contracts)

> Evaluated by `forge:eval --type contract` (T-eval-contract, 2026-09-23). Scorer = [qa] expert (single); scale 1100 / target 935 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules; handbook = design/page-map.md; fact table = .forge/fact-table.json (FT-001..FT-056).

## Eval-contract Complete
**Final Score**: 1067/1100 (target: 935)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 889 | — |
| 2 | 1067 | +178 |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Iteration 2 | Threshold | Result |
|-----------|-------------|-------------|-----------|--------|
| Completeness | 150/150 | 150/150 | ≥90 | PASS |
| Semantic Purity | 172/200 | 192/200 | ≥120 | PASS |
| Precondition Exclusivity | 140/150 | 145/150 | ≥90 | PASS |
| Fact Alignment | 105/150 | 143/150 | ≥90 | PASS |
| Surface Fitness | 95/100 | 100/100 | ≥60 | PASS |
| Internal Consistency | 137/150 | 140/150 | ≥90 | PASS |
| Anchor Integrity | 90/100 | 100/100 | ≥60 | PASS |
| Fixture Specification | 0/100 | 97/100 | ≥60 | PASS |

### Outcome
**Target reached.** Iteration 1 failed on the Fixture Specification entity-completeness veto (step-2 in-session-disable judged session/挂接 state while fixture declared only Plugin; prerequisite_entity mis-attributed) plus a hard factual defect: fixture cardinality 「forge 核心插件恰一个 = true」 contradicted the shipped `apps/desktop/resources/plugin-bundles.json` (3 mandatory bundles; hello-world removed in 9ed862c, forge-workbench added in df85f59; SC6 e2e asserts 三必备名逐一 reject). Revision resolved all 11 attacks: Session/SessionLink (FT-035)/Task/Project entity chain declared with 挂接会话本体存活 state_requirement + SessionLink-min-0 absence pin on the success leg; cardinality corrected to 3 mandatory + 2 third-party (min_count 5) verified against the shipped manifest; test-profile manifest-variant mechanism declared in state_requirements (插件行集唯一来源 = 清单文件, listRows() = manifest.map — 宿主槽位注册不入插件行集); FT-006/035/040/043/048/049/050/053 inline anchors family-wide; 8 oracle parentheticals (hash/sha256 对拍、文件面直读) purged from dimension values; step-5 core-capability precondition made fixture-direct (不要求由 Step 3/4 序列派生) + 回看终态钉死使两腿互斥; tasks 视图 outcome-level anchor added; restart/e2e-driving mechanics relocated; step-3 cancel-no-op oracle defined (覆盖文件存在性钉死 + 预置内容基线); new load-error-retry Outcome (与就绪/清单回退两腿显式互斥). Family grew 12→13 Outcomes (+14% growth).

Residual deductions (iteration-2 report, non-blocking): load-error-retry State 的「失败重列保底」半断言在本腿不可达 (须拆 post-ready 重列失败 Outcome 或删除迁入 toggle-rejection 腿); step-5 core-capability「第三方扩展内容退出说明显示」观察面未钉 (插件行 hint vs 挂接区,后者需会话链装置); mandatory-no-disable 前置被 success 就绪态真包含 (Outcome 选择退到 Input 层); 维值内嵌 IPC 动词名 listPlugins; 两处行为主张 (third-party-disabled 挂接区退出说明、启动装配清单×覆盖对账) 无锚无 inferred 注. Blindspots carried: toggle 拒绝错误路径 (拒绝不乐观翻转 + 按码可读 toast + 守卫码重列,实装存在) 在 13 个 Outcome 中零覆盖; UF6 明文中英双语影响说明文案未断言语言 (承自 journey open 项); mandatory-only 空态 (shipped 产品默认形态,quiet hint) 零覆盖.

Eval-skipped flag: not applicable (score parsed successfully on both iterations).
