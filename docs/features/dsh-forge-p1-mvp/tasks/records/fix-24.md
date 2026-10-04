---
status: "completed"
started: "2026-10-04 15:49"
completed: "2026-10-04 16:37"
time_spent: "~48m"
---

# Task Record: fix-24 Fix: 新会话输入框上方控件工作区语义→项目语义——picker 影子列项目（名/选中/切换）+ 注册时 workspace 标题对齐项目名（官方 chip/所有 title 面免费显示项目名）+「添加」接产品注册流程

## Summary
真实现 fix-24 全三交付物（前次 blocked 判定的零实现缺口全数补齐）：① hero 工作区控件影子——官方 conversation.hero.workspace 槽位 single 影子占用（priority -100 lowest renders 取官方 WorkspacePicker 弹层渲染位），弹层改列 forge 项目（name + 官方文件夹图标，archived 排除，未绑定工作区天然不出现），选中映射 selectedId(workspaceId)↔project.workspaceId 恒等对照，切换走官方 selectWorkspace 链零契约变化，「添加项目…」footer 入口接 openAddProjectFlow()（UF-3 产品注册流），空项目集直达产品注册流（官方 addIsTheOnlyEntry 语义对齐）；② 注册时 workspace 标题对齐项目名——core 注册链末位调用官方 workspaceController.rename({workspaceId, title: project.name})（api-workspace-controller host 侧服务，core inject 增 workspaceController 双依赖），新建/挂接既有/fix-27 自愈三径全收口（自愈径以既有行 name 对齐，存量项目重注册即愈），fail-soft 永不拖垮注册（name-conflict 属真实可达：两项目同名时后者 chip 退回目录名，无害残留），排序免疫补偿链（rename 仅在 ③ 行落定后执行，② create 失败/③ 写入失败补偿一切失败径 rename 未发生，零回滚需要）；⑤ 测试——hero-picker-model 纯函数单测（workspaceId↔project 映射/archived 排除/空集口径）+ 注册 rename 调用形状单测（新建/挂接/自愈/幂等重入/fail-soft/补偿零残留六面）+ hero-control e2e spec 两例（AC1/AC2 弹层只列项目 + 未绑定账本行不出现 + 切换对齐 chip 文案；AC3 添加项目→注册流端到端→新项目入弹层）。chip 文案面经 ② 端到端实证：官方 chip label 读 workspace.title，e2e 点选项目后 chip 显示项目名（真 workspaceController.rename 链）。周边语义（placeholder 官方文案/agent preset 行）按任务边界 ③ 注记不改。

## Changes

### Files Created
- apps/web/src/views/session/hero-picker-model.ts
- apps/web/src/views/session/hero-picker-model.test.ts
- apps/web/src/views/session/HeroWorkspacePicker.tsx
- apps/web/src/views/session/HeroWorkspacePicker.test.tsx
- e2e/specs/p1mvp/hero-control.spec.ts

### Files Modified
- packages/core/src/forge/registry.ts
- packages/core/src/forge/project-service.ts
- packages/core/src/service.ts
- packages/core/src/forge/project-service.test.ts
- packages/core/src/forge/service-assembly.test.ts
- packages/core/src/service.test.ts
- packages/knowledge/src/integration-core.test.ts
- tests/contract/pin-07-cordis-services.test.ts
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/client-plugin/plugin.test.ts
- apps/web/src/product-views.ts
- apps/web/src/views/sidebar/use-forge-projects.ts
- apps/web/src/views/sidebar/use-forge-projects.test.ts

### Key Decisions
- 影子行不重声明 children：ui-slots register 对已声明子槽重声明即 throw（fix-23 runtime 实证）；官方 WorkspacePicker 登记行被影子后保持在场，其 children 声明持续供养 conversation.hero.workspace.directoryFlow 子洞——fix-14/16 原生选取链不断（任务文「children 声明照抄官方」按运行期语义以『子洞保持存活』达成，字面重声明必 throw——SPEC CONTRADICTION 注记于组件头注）
- rename 对齐点选 ③ 行落定后（registerProject 尾 + attachExistingRow 幂等路径）：补偿链零 rename 回滚需要（排序免疫），失败 fail-soft 不拖垮注册（跨项目同名 name-conflict 真实可达）+ child 控制台 warn 记账（app_key_logs scope CHECK 四值无注册域）
- attachExistingRow 自愈径 rename 以既有行 name 对齐（input.name 对既有行不生效——title 跟行不跟输入）；alignWorkspaceTitle 永不抛（自愈面 try 语义零变化）
- core inject 增 workspaceController（host 侧 api-workspace-controller 服务，dsh-web-app 自带）——与 workspaceRegistry 同级硬依赖（对齐是注册链义务而非可选）；pin-07 门控断言升半依赖不加载面
- 弹层 open 边沿静默重拉项目列表（useForgeProjects 增 silentRefresh——保留现行相位不闪骨架）：应用侧行删除/归档不触发 workspace 快照锚，开合兜住陈旧行集（e2e 假未绑定账本行场景依赖此面）
- 官方 Menu primitive 直 import 复用（零自绘；listClassName=dswf-hero-picker-list 为 portal 面唯一可达样式钩 = e2e 锚）；静态渲染不可达（MenuSurface createPortal(document.body)）→ 单测只测闭态 + 纯函数，开弹层面归 e2e（AddProjectFlow Modal 壳同惯例）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 999
- **Failed**: 0
- **Coverage**: 81.5%

## Acceptance Criteria
- [x] ① 弹层菜单：picker 影子列项目（forge:projects/list → name + 官方文件夹图标；archived 排除；未绑定工作区不出现；「添加项目…」入口接产品注册流；空集直达；官方 Menu/Modal 复用零自绘；owner 契约零变化）
- [x] ② 注册时 workspace 标题对齐项目名（core 注册链官方 workspaces.rename；新建与挂接既有两径都对齐；官方 chip/账本 title/原生显示面免费显示项目名）
- [x] 验收 1：多项目 + 账本含原生工作区 → 弹层只列项目名；点项目会话落其工作区；chip 显示当前项目名
- [x] 验收 2：切换项目 chip/selectedId 随选高亮；发消息后会话归属所选项目
- [x] 验收 3：「添加项目…」→ 产品注册流程端到端（OS 选取回退内嵌浏览器面 → 表单 → 注册完成 → 新项目即入弹层、chip 可选）
- [x] 验收 4：注册对齐 rename 幂等可重入（同项目重注册不炸）；注册失败补偿链 rename 不残留
- [x] 验收 5：e2e hero 控件只列项目（多项目夹具 + 假未绑定账本行）；单测项目映射纯函数 + 注册 rename 调用形状

## Notes
验证面：tsc -b 全绿；pnpm lint 全五段 EXIT=0（ox/imports/tokens/selftest/types）；vitest 999/999（新增 fix-24 ② 六面 + ① 模型 9 例 + 组件 3 例 + plugin 影子登记面；pin-07 门控升双依赖面）；coverage 81.46%（statements，v8 全仓实测，60% 目标之上）。e2e 实跑（fix 任务破例同 fix-16/28 先例——槽位注册缝/UI 面为 renderToStaticMarkup 不可达面）：hero-control 2/2 绿（AC1/AC2 39.9s：RPC 三项目夹具 + gamma 删应用侧行留 dsh 侧工作区 = 假未绑定账本行，弹层仅列 alpha/beta、gamma/默认工作区不出现、添加入口在场、点 beta 后 chip=proj-beta、重开弹层 beta 行 ✓ 记号 2 svg vs alpha 1 svg；AC3 41.8s：footer 添加 → 回退浏览器面注册 hero-add-new → 新项目即入弹层 → chip=hero-add-new）；回归面：session-workbench Step2b/2c + Step4b/4c（chip 流经新弹层）、project-registration 冒烟、web-shell、host-boot、flywheel 6 步全链（dogfood 真模型——chip 流选 demo-proj 后会话落夹具工作区 = 验收 2 发消息归属面）全绿。官方源实证（profile.dev node_modules 只读）：owner 契约 ui-conversation client.js:16268-16281（selectedId=pendingWorkspaceId??sessionWorkspace?.workspaceId）；官方 WorkspacePickFlow addIsTheOnlyEntry :1935-1943；host 侧 rename 命令 = api-workspace-controller index.js:234-246（trim 非空/跨工作区重名 workspace/name-conflict 拒绝/等值幂等跳过 setTitle）；ui-slots register 子槽重声明 throw index.js:80/193。后续耦合注记（任务边界）：项目改名（updateProject name patch）须联动同 rename；placeholder 官方文案随 fix-25 架构落定再评估。
