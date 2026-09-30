---
feature: "dsh-forge-m4"
reviewed: "2026-10-01"
---

# Review Choices

> 非交互模式(任务 consolidate-specs.md 指令:自动集成全部 CROSS 项;派发指令补充:仅集成高置信非重叠增量,争议项留档)。重叠项默认 [skip] 保留双方;M4 规划期撞号条目按序规则修复(renumber,非删除重写)。

## Approved for Integration

新增条目(项目全局 ID):

- BIZ-008 -> docs/business-rules/workbench.md(新 BIZ-workbench-013:布局记忆项目域 —— 删除即清除/用户级分治/stored 存在性判别)
- BIZ-009 -> docs/business-rules/workbench.md(新 BIZ-workbench-014:拆出窗口语义 —— 单实例不变/钉项目/关闭≡收回/标题归主进程)
- TECH-004 -> docs/conventions/ui-reuse.md(新 TECH-ui-reuse-004:上游 UI 槽位消费纪律 —— single/list 分型 + priority 替换渲染 + unlinked peer 结构孪生)
- TECH-005 -> docs/conventions/ui-reuse.md(新 TECH-ui-reuse-005:双宿主组件纪律 —— props 化/几何单源/默认形态 verbatim 锁证)
- TECH-006 -> docs/conventions/host-integration.md(新 TECH-host-007:上游数据面读写双缝 + duck-typed 通道孪生 + relay 重试单源)
- TECH-008 -> docs/conventions/data-kernel.md(新 TECH-data-kernel-007:项目域 UI 状态 blob 纪律 —— 白名单/钳制分治/stored/迟到写双保险)
- TECH-009 -> docs/conventions/shell-windows.md(新文件,新 TECH-window-001:壳层多窗口工程 —— 注册表/role 零 URL 面/fan-out/单一汇流/标题权威)

撞号修复(ID 序规则「max existing NNN + 1」被 M4 规划期集成违反;保留条目文本,仅重排 ID + 映射注记;M3 条目 006/007/008 原号不动):

- workbench.md 规划期「workspaceRegistry 单向投影」BIZ-workbench-006 -> **BIZ-workbench-010**
- workbench.md 规划期「subagent 归拢与任务反查」BIZ-workbench-007 -> **BIZ-workbench-011**
- workbench.md 规划期「执行中判定」BIZ-workbench-008 -> **BIZ-workbench-012**
- 修复范围 = 知识库文档;M4 期 feature 文档/源码注释中的旧号引用不回写(历史记录逐字保留),映射关系在本文件与 workbench.md 头部注记承载

修订条目(保留原 ID,追加 M4 修订/增补块):

- BIZ-001 -> BIZ-workbench-001(M4 修订:③过程文档位置 = docsPlacement 证据三档 + custom 收窄 + app 档内核派生)
- BIZ-001 -> BIZ-workbench-003(M4 修订:注册硬校验收窄,forge 检出门禁与 ERR_FORGE_NOT_DETECTED 废止为信息态;v1 冻结面例外注记)
- BIZ-002 -> BIZ-workbench-002(M4 修订:三层身份归一化 + code_root_key 折叠 UNIQUE + 仲裁自愈;boot 恢复上次活跃 + 原位换台重置)
- BIZ-006 -> BIZ-workbench-004(M4 增补:追加行两行化 = 归因 + 命名,prompt_hash 口径不变)
- BIZ-007 -> BIZ-workbench-005(M4 扩展:工作台首屏 ≤2s/投影四操作 ≤2s/切换不劣化诚实口径 + 实测基线)
- BIZ-004 -> BIZ-workbench-010(M4 执行期增补:偏差物化零落表/归档不对账/收敛单源/复连语义)
- BIZ-005 -> BIZ-workbench-011(M4 执行期增补:降级双因同型/ended 快照不可用座位/徽标覆盖判定/20 上限)
- BIZ-010 -> BIZ-resilience-001(M4 注记:可操作降级呈现族 —— 状态行 + 唯一重试动作)
- TECH-001 -> TECH-host-006(M4 修订:追加行两行化 + oracle 第三查两行前缀对拍)
- TECH-002 -> TECH-electron-ipc-002(M4 修订:51 → 62 通道 + dsh-forge:window-* 壳层动词组)
- TECH-003 -> TECH-ui-reuse-002(M4 修订:视图键族收缩 + panellist null 寻址 + 逃生门单成员)
- TECH-007 -> TECH-data-kernel-001(M4 修订:v3 增量实践注记)+ TECH-data-kernel-006(M4 三新域沿用确认)
- TECH-010 -> TECH-testing-001(M4 扩面:实况 durable 断言/故障注入 env+控制文件缝/REAL persistence 种盘/多窗口 helper/构建新鲜度/fixme 台账/flake 双证)
- TECH-011 -> TECH-product-arch-004(M4 修订:CLI/CC 插件收口顺延 M6,路线图重定题注记)

## Skipped

- BIZ-011 ~ BIZ-013、TECH-012 ~ TECH-013 —— [LOCAL],留 feature 文档
- M4 规划期已入库三处增量(投影/血缘/执行中)不另立新条目 —— 已存在,本次仅 renumber + 执行期增补块
- TECH-ui-reuse-003 —— M4 design 期已入库,不重复

## Related Existing Entries

重叠扫描(非交互默认 [skip] 保留双方,不替换、不删除):

- decisions/project-storage-and-knowledge.md §5 v2(D11 三层身份/证据三档/零 git 强制,2026-09-26)——与 BIZ-workbench-001/003 M4 修订重叠:[skip] 保留双方(裁决记 WHY,规则记长效约束)
- decisions/architecture.md 2026-09-28 行「工作台承载形态 = 原生 home 增强层(T1)」——与 TECH-ui-reuse-002/004 相关:[skip] 保留双方
- decisions/architecture.md/interface.md 2026-09-28 行(投影通道 client relay 直调 T3/window-role 握手 T5)——与 TECH-host-007/TECH-window-001 重叠:[skip] 保留双方
- decisions/data-model.md 2026-09-28 行(project_ui_state/身份列等)——与 TECH-data-kernel-001 修订/TECH-data-kernel-007 重叠:[skip] 保留双方
- lessons/gotcha-user-layer-patch-field-override.md [architecture, testing]——与本次条目无域重叠(字段级 patch 覆盖陷阱,属宿主组合树):不构成重叠
- M3 specs 预览(dsh-forge-m3/specs/)中 BIZ-workbench-006~008 编号指向 M3 条目 —— 撞号修复保持 M3 条目原号,M3 预览映射仍成立

## Domain Overlap Warnings

无(修复后 docs/business-rules 与 docs/conventions 各文件 domains 两两交集均 < 50%;新增/再推导 domains 见各文件 frontmatter)。
