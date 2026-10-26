# 预设专家档案新撰评审留痕（dsh-forge 从未使用 7 类）

日期：2026-11-05 ｜ 对象：`packages/plugin-forge/experts/` 下 7 个新撰档案

## 分层依据

`docs/features/*/tasks/*.md`（p1-mvp / m2-pipeline / m3-bootstrap-presets）frontmatter `type:` 全量核查，以下 7 类在 dsh-forge 派发历史中零记录，按提案 §3 纳入 1 以档案规范新撰（非 PERSONA_VARIANTS 迁移）：

| # | 键 | 类型语义 | 新撰要点 | 自评 |
|---|---|---|---|---|
| 1 | coding-enhancement | 既有特性增量改进 | 增量边界判别（扩展非新建）、TDD 补新增行为测试、既有测试零回归 | 通过 |
| 2 | coding-cleanup | 死重与退化痕迹清除 | 行为零变更红线、只删不重构、不要求补测 | 通过 |
| 3 | coding-refactor | 结构改善行为不变 | 先影响映射后动手、新增→迁移→移除次序、不夹带功能变更 | 通过 |
| 4 | code-quality-simplify | 删减收敛提升可读性 | 五维度审视、行为等价逐字红线、发现分歧停手上报 | 通过 |
| 5 | doc-drift | 文档-代码一致性审计 | 代码为唯一事实源、发现附文件:行、只审计不修改 | 通过 |
| 6 | validation-code | 代码行为验证 | 只记录不改码、发现附可复现凭据、范围限代码（漂移审计除外） | 通过 |
| 7 | validation-ux | 体验视觉验收 | 截图为证据、判据缺失 blocked、只验收不代改 | 通过 |

## 评审结论

- 规范符合性：7 档案均过 `parseExpertFile` 同口径全量门（见 [experts-gate-check.txt](experts-gate-check.txt)，20/20 PASS）。
- 三段正文（职责/边界/信条）齐备，frontmatter 含 name/title/description/tools/skills。
- 与矩阵文本关系：新撰文本按类型语义独立成文，未逐字复制 PERSONA_VARIANTS；与程序段（复杂度门禁/结算纪律）零重复。
- 与同族档案边界清晰：coding-cleanup（只删）↔ coding-refactor（结构迁移）↔ code-quality-simplify（删减收敛）三者以红线条款互斥；validation-code ↔ doc-drift 以验证对象划界。
- 评审结论：**7/7 通过，入库**。
