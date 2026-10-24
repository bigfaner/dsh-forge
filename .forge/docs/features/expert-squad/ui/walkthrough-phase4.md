# 阶段四 UI 走查记录：expert-squad 面板双主题对照 DESIGN.md

> 走查形态：Electron 实机（desktop 前置构建同径），夹具工作区 `.dsh/experts/` 档案；主题缝 = `body[data-ds-dark-theme]`（官方 ui-theme 令牌作用域锚）。
> 截图归档：`.forge/docs/proposals/expert-squad/walkthrough/phase4-fix13/`（留盘不进 git，`*.png` 已被 .gitignore 忽略）。
> 覆盖面：亮/暗两主题 × 卡片网格四态（数据/骨架/错误/空态）× 详情 Dialog（查看/编辑）× 召唤引导条（正常钮 + 降级条），共 14 屏。

## 截图清单

| 屏 | 亮 | 暗 |
|---|---|---|
| 卡片网格·数据态 | `light-01-grid-data.png` | `dark-01-grid-data.png` |
| 卡片网格·骨架态 | `light-02-grid-skeleton.png` | `dark-02-grid-skeleton.png` |
| 卡片网格·错误态（ErrorBar+重试） | `light-03-grid-error.png` | `dark-03-grid-error.png` |
| 卡片网格·空态（建档引导） | `light-04-grid-empty.png` | `dark-04-grid-empty.png` |
| 详情 Dialog·查看态 | `light-05-dialog-view.png` | `dark-05-dialog-view.png` |
| 详情 Dialog·编辑态 | `light-06-dialog-edit.png` | `dark-06-dialog-edit.png` |
| 召唤降级引导条 | `light-07-summon-degrade.png` | `dark-07-summon-degrade.png` |

取证票据：`capture-notes.txt`（召唤降级文案与主题缝置位记录）；过程 spec 已删除不入 git。

## 逐项对照 DESIGN.md 令牌表结论

| 维度 | 消费面（styles.ts `.dswf-*`） | 判定 |
|---|---|---|
| 色·底/面 | 面板与卡底走 `--dsw-alias-bg-base/layer-2`，双主题截图底色随官方令牌翻转（light #fff ↔ dark #151517/#2c2c2e 系） | ✅ 对齐 |
| 色·状态灯 | `.dot.on` = `state-success-primary`（绿）、`.dot.off` = `label-caption`，双主题一致 | ✅ 对齐 |
| 色·错误态 | 错误文本消费 `--dsw-alias-state-danger-primary` | ⚠️ 偏离 D-1（见下） |
| 字 | 标题 `font-l-20`、卡名 `font-s-14`、正文 `font-xs-13`、标注 `font-xxs-12`、段标 `font-xxxs-11`；工具 chip `--ds-font-family-code` 等宽 | ✅ 对齐（截图字形/字阶与令牌表一致） |
| 距 | 头部/卡片内距与间距走排版行高刻度别名（pad12/16/20），无平行间距体系 | ✅ 对齐 |
| 圆角 | 卡 12（radius-md）、输入/钮 8（radius-sm）、chips 胶囊 999px | ✅ 在官方标尺内（Dialog 见 D-2） |
| 阴影 | 卡 hover `elevation-soft`；Dialog `elevation-strong`（回落 `elevation-soft`）描边+微阴影双层 | ✅ 对齐（Dialog 阴影回落刻度见 D-2 注记） |
| 暗色锚 | 双主题经 `body[data-ds-dark-theme]` 官方锚切换，无 media query 模拟 | ✅ 对齐 |

## 偏离记录（报 gate 裁决，未改码——范围纪律）

- **D-1 错误态语义色令牌名不存在**：`.dswf-errorbar` 与 `.dswf-dlg-err` 消费 `--dsw-alias-state-danger-primary`，官方 ui-theme 令牌表无此名（正名 = `--dsw-alias-state-error-primary`）→ 变量解析失败回落继承色，两主题错误文本均呈灰而非 Error 红（#ec1313 / #f25a5a）。证据：`*-03-grid-error.png` 错误条文本与次文本同灰。
- **D-2 详情 Dialog 圆角/阴影刻度与 F2 注记不一致**：styles.ts 头注记「radius-lg 16 / lv3 阴影」，实际消费 `r12`（radius-md 12）与 `elevation-strong`（官方令牌表无此名，恒回落 `elevation-soft`）。仍在官方圆角标尺与阴影组合族内，但与 ui-design F2 批准刻度不逐位。
- **D-3 召唤降级透出原始异常文本**：降级引导条按设计呈现（fail-soft、不炸面板，`*-07-summon-degrade.png`），但文案携带底层原始 TypeError（`Cannot read properties of undefined (reading 'layout')`——官方 openWorkspace 服务缝在 e2e 载体形状解析失败），非阶段化 message 归因。缝装配面问题归 gate 裁决。

## 状态语义核验（伴随观察）

- 中间态稳定性：骨架期零空态/零错误分支闪落（`*-02` 页脚「扫描专家目录…」）；已有数据后重拉失败静默保持既有网格（list-source 裁决实机成立）。
- 禁用卡降透明、页脚计数（「2 位专家 · 显示 2」/「0 位专家」）与 DESIGN.md 状态语义一致。
