# flows/add-project/

定位：**业务** —— 添加项目两段式向导（UF-3：浏览选择 → 表单确认 → 执行反馈）。填充：2.8–2.10（全落成）。

- `DirectoryBrowser.tsx` / `browser-model.ts` / `browser-actions.ts` / `dir-source.ts` / `browser.css` —— 段一·文件浏览器（2.8）。
- `RegisterForm.tsx` / `form-model.ts` / `form-actions.ts` / `form.css` —— 段二·注册表单（2.9）。
- `AddProjectFlow.tsx` / `flow-model.ts` / `flow-actions.ts` / `flow-open.ts` / `dir-picker.ts` / `flow.css` —— 组装（2.10）：
  两段状态机（浏览器 ⇄ 表单，返回保留已填）+ 取消点语义（两段任一关闭 = 干净退出零副作用，
  Hard Rules：取消路径零 register 零补偿）+ 确认执行（form 相位一次性放行，官方 Modal 承载，
  Esc/✕ 经 closeIntent 三分守卫——执行中不可中断）+ 成功/失败反馈（typed error code → 文案，
  补偿口径与 core ForgeErrorData 对齐）。入口 = `flow-open.ts` 页内缝（项目树「＋」sidebar 槽位
  接线 / hero CTA 2.12 接线）；宿主挂载归 2.12 工作台装配。
- fix-14 原生目录选取（`dir-picker.ts` 桥探测）：桥在场（Electron 桌面 preload 暴露
  `__DSH_DIRECTORY_PICKER__`——官方 dsh 契约逐字同形）→ 段一/重选渲染按钮面（系统 OS 目录
  对话框主路径）+ 表单三改选 target 同桥直选；桥缺席（非 Electron 载体/单测/e2e 回退口径
  `DSH_FORGE_DIRECTORY_PICKER=off`）→ 回退内嵌浏览器（官方 -browse 双面同型，形态零变化）。
  「已注册」口径迁移：pick 时表单相位挂接提示（回退浏览器行级标记保留）。
