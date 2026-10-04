---
status: "completed"
started: "2026-10-04 08:52"
completed: "2026-10-04 09:13"
time_spent: "~21m"
---

# Task Record: fix-17 Fix: 添加项目 ＋ 图标改官方「文件夹+加号」件（IconProjectAddOutlineRegular，对齐原生 dsh）——侧栏头部钮图标对齐 + 同排钮形态一致化评估

## Summary
侧栏「添加项目」＋钮图标改官方 IconProjectAddOutlineRegular（文件夹+加号件，原生 dsh 同款）+ 钮形态对齐同排官方行语言（Button ghost/sm，26px 自绘钮规则整块退役）；hero CTA 顺带口径对齐（官方 Button icon 位 + 文案「添加项目」，文本前缀 ％＋ 退役）。锚零变化：data-dswf-nav="add-project" / data-dswf-cta="add-project" / openAddProjectFlow 打开缝 / fix-16 直达编排均未触碰。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/workbench/HeroEmpty.tsx
- apps/web/src/workbench/HeroEmpty.test.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx
- tests/structure/web-shell.test.ts

### Key Decisions
- ＋钮 = 官方 Button variant=ghost size=sm（同搜索/视图钮行语言，className 归 dswf-sidebar-headbtn 排布面）+ IconProjectAddOutlineRegular size=16（AC1 官方 16px 刻度；原生 dsh workspace 同款 wide?16:18 用法印证）；自绘 <button class=dswf-sidebar-add> 26px 规则与自绘纯加号（IconPlusOutlineRegular）整块退役
- hero CTA 用官方 Button icon 位（icon={<IconProjectAddOutlineRegular />}——Button.d.ts 官方前导 16px 图标槽），children 收敛为「添加项目」；aria/title/锚零变化（Hard Rule 未点名元素不变）
- 钉形断言：两处单测 + structure pin 以官方件 artwork 路径前缀 M5.54492 2.06738（文件夹填充路径——IconProjectAdd 独有）钉「官方图标件唯一」Hard Rule；web-shell structure pin 同步由「＋ 添加项目」文本钉改为 icon 件名钉

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1043
- **Failed**: 0
- **Coverage**: 78.2%

## Acceptance Criteria
- [x] ＋ 钮图标 = IconProjectAddOutlineRegular（computed 颜色随令牌；16px 官方刻度）
- [x] 同排三钮（搜索/视图选项/添加）行语言一致（官方件 + 透明底）；走查目视确认
- [x] hero CTA 口径对齐（图标位 + 文案；锚不动）
- [x] data-dswf-nav="add-project" 锚与打开行为零变化（e2e 断言零褪色）；tsc + lint + 定向单测绿
- [x] 执行记录附侧栏头部截屏

## Notes
运行期探针（tmp-ui-review/fix17-probe.mjs，electron 直启 dist + RPC 直注项目进 session 相位）computed 证据：①＋钮 svg viewBox 0 0 16 16 / 16px / 三路径 currentColor（文件夹填充 M5.54492 + 双加号描边 M9.75977/M12.1492——官方 artwork 逐路径吻合）；②三钮行语言对照：搜索 w34/视图 w34/添加 w36 同 h28、同透明底 rgba(0,0,0,0)、同 radius 8px（官方 sm 刻度，差异仅图标 14 vs 16——AC1 钉 16 官方刻度）；③＋钮 hover 底 = #2631480f 恰为 interactive-bg-hover 令牌（ghost 仅 hover 底）；④暗 scope（body[data-ds-dark-theme]）图标色翻 rgb(249,250,251)——computed 随令牌；⑤hero CTA：官方 icon 槽 span(_icon_*) + 文本「添加项目」无 ％＋ 字符、svg 16px 白色（primary 底上 currentColor）。截屏归档（不入仓）：tmp-ui-review/fix17-sidebar-head.png（侧栏头部三钮）、fix17-hero-cta-light.png / fix17-hero-light.png（hero CTA 图标位）、fix17-sidebar-add-hover.png（hover 底）、fix17-sidebar-head-dark.png（暗主题）。走查目视（模型读图）：侧栏右钮 = 文件夹轮廓+右上角加号（非抽象加号）；hero CTA = 深底白字+白文件夹加号图标。质量门：tsc -b exit 0；pnpm lint 全绿（ox/imports/tokens/selftest/types）；vitest 全量 1043/1043（含新增钉形断言；structure pin 修正一处）；定向 e2e p1mvp/project-registration 10/10（锚与打开行为零褪色——含 hero CTA 点击三处 + 项目态 ＋ 入口点击）。coverage 78.23% = 变更目录收窄口径（apps/web/src/views/sidebar/** + HeroEmpty.tsx，v8 statements；HeroEmpty.tsx 满覆盖被表隐藏——vitest 满覆盖文件缺席非未测量）。本任务为 fix-record 恢复形态且前提为假：前次会话零实现（存在性对照——IconPlusOutlineRegular 仍在场、HeroEmpty 仍文本 ％＋ 前缀、apps/web/src 零未提交改动、HEAD=fix-16 无后续提交），依派发注记转真实现（fix-6 形态第四例：fix-6/fix-15/fix-16 之后）。
