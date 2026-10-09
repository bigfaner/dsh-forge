# views/settings/

定位：**业务** —— UF-2「Forge设置」分区组件（M3 4.5 半身（Build）：分区标题 + worker 小节 + 默认 LLM 三项行式控件 + 未配置/脏态/保存五态反馈）。分区落位（设置对话框 `settings.section` slot 注入）= 4.7 接线；读写 = `rpc settings.{get,set}`（4.1 通道——core forgeSettings 服务单门，UI 与 dispatchTask 同门消费、改完即生效无重启，tech-design 图 11）。m3.1 D24：Provider/Model = 官方 Menu 下拉（原生 select 退役）；m3.1 D25：选项值 =「设置>模型」目录（插件 inject face `loadModelCatalog` 递达——`remote.session.modelCatalog` 惰性反射；缺席/失败 = 静态目录 `WORKER_PROVIDER_CATALOG` 回退）。
边界：禁 import `../overview/` `../session/` `../knowledge/`（同级业务互禁）；rpc 仅经 `rpc/` client；Provider/Model 候选 = 目录参数化纯函数（缺省静态回退面——持久域自由字符串，选择面防御性并入目录外存量值防失显）。

| 文件 | 职责 |
|---|---|
| `ForgeSettingsSection.tsx` | 分区组件全件：展示常量（`WORKER_PROVIDER_CATALOG` 静态回退目录 / `REASONING_SEG_OPTIONS` 低\|中\|高三段）+ 目录参数化纯函数（`workerModelCandidates` / `providerSelectOptions` / `modelSelectOptions` / `applyProviderChange`——m3.1 D25）+ 纯模型（`canSaveWorkerDraft` 填齐∧脏）+ 受控态纯函数（`editWorkerDraft` 同门 / `applyForgeSettingsLoaded` 装载播种 / `applyModelCatalogLoaded` 目录入位）+ `FsDropdown`（m3.1 D24 官方 Menu 下拉叶——开合本地态 + 触发钮值回显）+ 保存链纯异步面（`saveForgeSettings` 单飞+不完整守卫 → `submitWorkerSettings` settings.set 整体覆写 worker 段）+ `ForgeSettingsSectionBody`（纯渲染体——renderToStaticMarkup 全相位可测）+ `ForgeSettingsSection`（装载壳：mount 装载[settings.get + loadModelCatalog 双装载] + seq 竞态守卫 + 受控态 + rpc 保存） |
| `forge-settings.css` | 分区样式：分区标题（底色条 + 13px/600）+ worker 小节（12px/600 次色 + 顶分隔线——`fs > fs-part` 分层多小节可并列）+ 行式控件（标签左/控件右；下拉触发钮 = 原型 m31-dd-btn 刻度 min-h 34/r8/13——卡面官方 MenuSurface 零自绘）；原型 11.5px 行/11px 注刻度归档最近官方字阶令牌（12/11） |

关键口径：**Hard Rule 配置面恒三项**（Provider/Model/Reasoning——无 Output 上限回潮，用户裁决 2026-10-07）；未配置 = `ForgeSettings.worker` 键缺席（⚠ 占位「worker 派发将回退父会话继承」+ 保存禁用；填齐激活）；脏态 = 与已持久化值等值比较（未配置对缺席——填齐即脏；已配置值直出不脏）；保存反馈 = 保存中输入冻结 / 成功 ✓ 复位 + 下次派发生效注记 / 失败错误行留场可重试（补丁恒不含 `draft`/`saved`/`load`——表单内容结构性不被清空）；reasoning 三值 = contracts `REASONING_LEVELS` 词汇（→ agentOptions.effort 直映射）。
