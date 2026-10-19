# 测试表面判定（Testing Surfaces）

适用：test-gen / test-run 全链技能（gen-journeys → gen-contracts → gen-test-scripts → run-tests）判定与消费表面时的统一纪律。本环境没有表面注册表 CLI——表面一律从仓库自身事实判定，**绝不猜**。

## 支持类型

`web` / `api` / `cli` / `tui` / `mobile`。

## 判定来源（按序探测）

1. **既有 journey 文档 frontmatter**——`testing/<journey>/journey.md` 的 `surface_types` / `surface_keys`。
2. **测试约定目录**——`docs/conventions/testing/` 的逐表面子目录（每个子目录 = 一个已配置表面）。
3. **测试树布局**——`tests/<surfaceKey>/<journey>/` = 多表面项目；`tests/<journey>/`（无 surface-key 层）= 单表面项目。

`<surfaceKey>` 是用户自定义键（如 `backend`），**绝不是**类型（`api`）。

## 硬纪律

- **零命中或证据矛盾且不可裁决 → 阻断上报**（附探测证据），不自行编派表面。
- 表面判定属选型级决策：交互式语境可问用户；执行语境（run-tests）不可交互，只能阻断。
- 全链覆盖一致：journey 的 `surface_types`/`surface_keys` 并集必须覆盖每个已配置的表面类型与键。
- 输出布局：多表面项目 `tests/<surfaceKey>/<journey>/`；单表面项目 `tests/<journey>/`。无暂存区，直接落最终位置。
- 测试执行一律 run-once 命令（按工作区实际工具链取用），禁 `--watch` 形态（见 AGENTS.md §2）。
