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
