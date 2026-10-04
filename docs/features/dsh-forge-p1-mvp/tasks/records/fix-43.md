---
status: "completed"
started: "2026-10-05 07:26"
completed: "2026-10-05 07:44"
time_spent: "~18m"
---

# Task Record: fix-43 Fix: 项目树对齐原生残留差值——会话行缩进 26→8（原生 depth*12 顶层=0，状态点对齐 folder 槽）+ 组内行距 2px + 行 hover 底出血右缘 + 段头 36px 刻度/label 14/20 常规

## Summary
侧栏项目树视觉刻度对齐原生 dsh 残留收尾（fix-42 后差值五项）：①会话行缩进 26→8px（母本 calc(8px + depth*12px)，产品树恒单层 depth=0 直取终值——状态点 16px 槽正对项目行 folder 16px 槽下方）；「暂无会话」占位行 26→24px（8px+16px 槽宽口径）；②组内相邻行 2px 节奏（官方 groupSection>*+*{margin-top:2px} 同款：.dswf-sidebar-sessions margin-top + >*+* + .dswf-sidebar-project >*+*；flatlist 已 gap:2px 不动）；③行盒右缘出血（容器 padding-right 8→0，行内 padding 0 8px 保持文字距缘——hover 药丸右缘贴面板边/滚动条区；段头自带右缘 8px 保动作位）；④段头 36px 刻度族（height 36 / margin-bottom 4 / justify-content flex-end / padding 0 8px 0 4px——官方 sectionHeader 逐值）；⑤段头 label 退役 --dsw-font-xs-strong-13 改继承壳 14px 常规体 + line-height 20px 令牌 + 三级色（官方 sectionLabel 无字体覆盖仅 line-height:20px）。dsw-raw 豁免注记同步（文件头清单 + 行注，值 = 官方 Rows/WorkspaceBrowser 原值）。原生实值从 vendored bundle 逐值提取核验（Rows.module.css 缩进公式 / WorkspaceBrowser sectionHeader·groupSection·listArea 出血链 / 主题包 --dsw-font-s-14=14px/22px 证伪直接套用）。单文件 CSS 改动，结构/交互/锚点零触碰。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/views/sidebar/sidebar.css

### Key Decisions
- 会话行缩进直取 8px 终值不引入 --dsw-workspace-indent 变量机制（任务边界：产品树恒单层 depth=0；注释记母本公式 calc(8px + depth*12px)）
- 右缘出血取任务处方的容器侧终值（.dswf-sidebar-projects padding-right 8→0）而非行级 margin-right:-8px（后者会溢出滚动容器触发横向滚动条）；段头自携 padding-right 8px 保持 fix-42 基线动作位（官方链中段头由浏览器根 padding-right 供位，产品单容器承载需自持）
- 组内 2px 节奏三处落点：.dswf-sidebar-sessions{margin-top:2px}（项目行→首会话行——官方为平铺兄弟行距，产品 DisclosureRow 内容缝无 spacing 经容器 margin 承载；已核 primitives DisclosureRow root 为 flex column 无 gap 无缩进）+ sessions>*+*（行间）+ project>*+*（项目行↔空会话占位行）
- 段头 label 不用 --dsw-font-s-14（实测主题包值 = 14px/22px ≠ 官方 20px 行高）——改无字体覆盖继承壳 14px 常规 + line-height: var(--dsw-font-xs-13-line-height)（=20px 令牌化取值，零裸值过 lint）
- 占位行前导 24px = 8px 缩进 + 16px 状态点槽宽口径（任务公式；产品自创行无原生对照）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 469
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] 会话行状态点槽正对项目行 folder 槽下方（左缘同 x）；行间 2px 节奏；hover 药丸右缘贴面板边
- [x] 段头 36px、label 14/20 常规三级色
- [x] 全套单测/e2e 绿（侧栏几何断言如有硬编码 26px/34px 同步更新；forge 锚 data-dswf-* 不动）

## Notes
AC1 几何等价经原生 bundle 逐值推导（sessionRow calc(8px+indent) 与 projectRow 0 8px + DisclosureRow 16px leading 同槽位；官方 groupSection 平铺兄弟 2px 与产品容器承载等价）＋ lint/tsc/单测机械门；与原生并排截图对照（任务验收锚）留待活体走查面——本执行按 fix 工作流不启 dev server/e2e。测试口径：web 项目全量 469/469（含侧栏 5 套件 77/77）；改动为纯 CSS（无覆盖率面，coverage null）。e2e/单测无 26px/34px 几何硬编码断言（grep 证：可见性/文本断言面），无测试同步项。fmt：仓库无格式化器配置（无 justfile——worktree 形态，tsc -b + pnpm lint 等价门全绿）。原生测量留痕：tmp-ui-review/fix43-probe.mjs（bundle CSS 逐值提取脚本）。
