# super-composer 版本台账（PROVENANCE）

## 版本纪律

1. 每修复一个 bug，bump patch 版本号（第三位）。
2. 每升级功能，bump minor 版本号（第二位）。

## bump 记录

| 版本 | 类型 | 说明 |
|---|---|---|
| 0.1.0 → 0.1.1 | patch | 本提案累积缺陷修复面（2026-10-23 用户裁决）；功能面 minor bump 由后续功能任务各自承担 |
| 0.1.1 → 0.2.0 | minor | 1.47 添加到会话后替身自动展开为卡片输入态（1.45 现身球态中间步退役——surfaceChip/onSurfaceExpand/onSurfaceDismiss 双轨摘除，expandRequest 计数缝替代） |
| 0.2.0 → 0.2.1 | patch | fix-19 双 composer 草稿同步收敛为通用机制（bug 65b8e9d0）：复制件回写 chip 保持正门（bail insert-text）+ composerFace 第二数据面实例退役（挂载层扇出）+ data-face tailSpanOf 对齐 detect 平面 |
| 0.2.1 → 0.2.2 | patch | fix-17 退出全屏后现身态不豁免全屏门（bug 2a6ebd3a）：1.47 card 现身态不再绕过可见性门控②——退出全屏替身自动隐藏，重进全屏恢复 |
| 0.2.2 → 0.2.3 | patch | fix-18 替身回写 setDraft 兜底摧毁官方 quote chip（bug d7fe1ab6）：兜底后按官方 occurrences 备忘逆序重物化幸存 token 为 chip——官方发送链对零 occurrence 草稿跳过 serializeReference，clipboard 投影 `〔引用：…〕` 明文原样落会话消息的面封堵 |
| 0.2.3 → 0.2.4 | patch | fix-20 引用落正式 composer 时替身误现身（bug 5773b86f）：surfaceOnReference 现身门收敛为通用合取判定 surfaceGateOk（全屏呈现 ∧ 文档活动）——activity/tracker 缺席不再降级恒真放行，非全屏会话视图引用 chip 落官方 composer 时替身零现身 |
