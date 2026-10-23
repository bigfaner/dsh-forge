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
| 0.2.4 → 0.2.5 | patch | fix-21 S2 官方 composer 副本卸载窃 shell editor root、主 composer 写空（bug 0cf1818b）：S2 工厂桥官方 InputBar 卸载把 root 置 null 后主视图永不重绑（官方 ComposerContentEditable 每实例只绑一次）——S2 卸载信号回传挂载层，有界重试以官方 setRootElement 正门重绑主 composer editable（root 在场零干预、fail-soft 全缝） |
| 0.2.5 → 0.2.6 | patch | fix-22 chat-view 历史消息多时箭头展开直达最大高度（bug f959ab05）：标题栏热区手动展开即置增高态（grown），FactoryChatView 新增 maxHeightPx 数值上限锚——实测内容高 ≥ 上限时高度首测即 min 钳到上限（分隔线 − 100px GROW_RESERVE），不经 .25s 渐进中间值；流式/发送增量逐块渐进语义保留（1.40） |
| 0.2.6 → 0.2.7 | patch | fix-25 发送消息引用块与用户文本空行分隔（bug 91135f89）：quote codec.serialize 输出以 `\n\n` 前后包裹，官方 sinkSerialized 末端 trim 削去消息首尾残留——`<quote>` 块与相邻手输文本零分隔粘连封堵（序列化分隔落 quote-reference 0.1.2，super-composer 发送链同面验收 bump） |
| 0.2.7 → 0.2.8 | patch | fix-28 Backspace 删引用 chip 越删越多（bug 95c3fb0c）：data-face.insertReference 丢 span 恒尾插（官方 facade.insertReference span 覆盖域换 chip 核销），删除场景幸存 token 明文原位 + 尾插复制 chip → 同步回灌增殖——span 显式直达 bail + 复制件回灌判据补 chip 计数比对，删除收敛 occurrences 单调减 |
