# Interface Decisions

| Date | Feature | Decision | Rationale | Source |
|---------|---------|----------|-----------|--------|
| 2026-10-06 | knowledge-scope | 知识范围切换 = 官方 Menu 纯项目行（无添加行——添加径归 hero 弹层/左栏「＋」） | 官方件复用 Hard Rule（零自绘 dropdown）；知识面只做浏览范围切换，入口职责不越界（用户裁决） | apps/web/src/views/knowledge/KnowledgeToolbar.tsx |
| 2026-10-06 | dsh-forge-m2-pipeline | 任务域服务面**按领域划分**（forgeTasks / forgeFeatures / forgeProposals / forgeDocs，读写一体）；**废除视图聚合服务**（forgeOverview 方案否决） | MVC：Model 按域内聚，后端 API 独立于前端保持稳定；跨域聚合（ov-head 等）归前端组合多域读；P1 forgeProjects 读写同域先例（用户裁决 2026-10-06） | docs/features/dsh-forge-m2-pipeline/design/tech-design.md §Interfaces |
| 2026-10-08 | dsh-forge-m3-bootstrap-presets | **dispatchTask 复合派发动词**（claimTask+spawnWorker 合并；dispatchPrompt 零进模型上下文；池快照 {pending,inProgress,blocked,unmetPending} 附载每次返回；连续 spawn 失败 ×3 粘住 halted——会话作用域易失计数器·无重置参数·新会话复位） | 消灭简报转述篡改面 + type-policy 双倍 token（用户裁决 A+B 整合·M3 单发）；现状感知机械化（收工/等待/死锁三态可判）；纪律不压模型自觉 | docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md §Interface 2 |
| 2026-10-08 | dsh-forge-m3-bootstrap-presets | **tool 返回面 = formatOk/formatErr 双友好格式化文本**（成功 `✓ 动词结果` + 键值行；失败 `✗ code` + 人话 + 违规清单逐行）；RPC/桥 typed error 信封照旧——双面分治不破 | 老 forge 先例：agent 消费与人类审计同面（用户裁决）；机械断言走 code 首行标记不受损 | docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md §Interfaces 头注 |
