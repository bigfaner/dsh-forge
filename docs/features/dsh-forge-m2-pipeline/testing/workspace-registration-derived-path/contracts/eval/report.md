# Eval-contract Final Report — workspace-registration-derived-path

## Eval-contract Complete
**Final Score**: 944/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 944 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 150/150 | 90 | ✅ |
| Semantic Purity | 184/200 | 120 | ✅ |
| Precondition Exclusivity | 122/150 | 90 | ✅ |
| Fact Alignment | 114/150 | 90 | ✅ |
| Surface Fitness | 95/100 | 60 | ✅ |
| Internal Consistency | 130/150 | 90 | ✅ |
| Anchor Integrity | 80/100 | 60 | ✅ |
| Fixture Specification | 69/100 | 60 | ✅ |

### Outcome
Target reached (944 ≥ 850), all dimensions above threshold. Notable attacks: validation-error precondition over-broad and factually wrong (「非 ready 态」 includes non-blocking states, creating an ambiguous pair with suspected-move-rejected); Step 1/3 page anchors not matching handbook identifier 「注册表单派生行」; discovery-scan assertion has no docs-content fixture to support it; suspected-move Outcome Input/State self-contradiction (confirm button disabled vs Input "确认注册"). Full attack list with quotes: `eval/iteration-1.md`.
