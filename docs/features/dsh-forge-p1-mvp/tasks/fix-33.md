---
id: "fix-33"
title: "Fix(P2): 架构评审加固批次——host 桥 send 防护/DSH_HOME 环境态告警/pin 韧性 + web 钩子形制/桥撤销对称/残械清理/label locale + core 测试类型门/rename 联动/记账防护/死字段 + 桥白名单类型锚"
priority: "P2"
estimated_time: "5h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P2): 评审加固批次（四路 P2 项打包）

> 来源：四路 subagent 架构评审（2026-10-04）host/web/core/横切四路 P2 发现集中打包（均为边角加固级，无架构违规）。

## 清单（按包，逐项独立可裁剪）

### apps/host

1. **[child.ts:96](../../../apps/host/src/boot/child.ts) 子侧 send 防护**：`process.send` 无 try/catch——载荷 BigInt/循环引用时 JSON 序列化抛错落 unhandled rejection，主侧 pending 永不结算（renderer 无限挂起，无 RPC 超时）。包 try/catch 回填**保 id** 降级 error-result；
2. **[main.ts:37](../../../apps/host/src/main.ts) DSH_HOME 环境态第三层**：shell 继承的 DSH_HOME `??=` 静默压过 fix-26 隔离缺省（未文档化）——检测环境态即告警覆盖，或 paths.ts 文档化该层；
3. **[host-main.test.ts:21](../../../tests/structure/host-main.test.ts) pin 韧性**：import 扫描正则补 `import\(`（动态 import 可绕过）；可顺带双引号/模板串；
4. 观察（顺手）：[run.ts:126](../../../apps/host/src/boot/run.ts) host-dist 缺席静默回退 dev 入口 → 直接 throw 更早定位（打包形态 asar 路径误导）。

### apps/web

5. **[ShellHost.tsx:118-120](../../../apps/web/src/workbench/ShellHost.tsx) 条件钩子**：`props.usePanelInfo?.(…)` 内联调用违反 hooks 规则（kit 中途在场性变化即漂移）——抽 PanelInfoAnchor 子件（同文件 WorkspacesAnchor 形制）；
6. **[plugin.ts:377-388](../../../apps/web/src/client-plugin/plugin.ts) 缝族对称性**：桥发布在 apply 期、撤销仅在 overlay 洞 dispose——apply 中途抛错残留死闭包；`__DSH_FORGE_CLIENT__` 标记卸载不清。catch 补撤销 + dispose 清标记 + 注记 publishWorkbenchBridge 双径原因；
7. **[RecallTab.tsx:302-320](../../../apps/web/src/views/session/RecallTab.tsx) keep-alive 残械**：`visible`/'hold' 分支/`[hidden]` 守卫在官方 only:id 挂载下生产不可达——删残械或注明垫片定位；
8. **[plugin.ts:317,330](../../../apps/web/src/client-plugin/plugin.ts) label locale**：硬编码中文 label，官方先例均 locale NS——接 locale 面或登记已知边界注记；
9. **[panel-model.ts:57](../../../apps/web/src/workbench/panel-model.ts) 契约收紧**：projectAnchorOf 把 workspaceId 放宽为可选（contracts 实为必填）——镜像收紧。

### packages/core / contracts

10. **[reconcile-queries.test.ts:96,166-167](../../../packages/core/src/forge/reconcile-queries.test.ts) 测试类型门**：漏改 fix-24 依赖（缺 rename 桩，TS2741 已实证）且 `pnpm lint:types` 看不见测试面（tsconfig exclude + vitest 无 typecheck）——补桩 + 加测试类型门（vitest typecheck 或独立 noEmit project）；
11. **[project-service.ts:266-297](../../../packages/core/src/forge/project-service.ts) rename 联动**：updateProject(name) 不联动 workspace rename（fix-24 自认注记）——成功后 fire-and-forget alignWorkspaceTitle；
12. **[project-service.ts:180-182](../../../packages/core/src/forge/project-service.ts) 自愈降级记账**：attachExistingRow catch-all 静默零记账——best-effort recordKeyLog(scope=reconcile) 再降级（Z:\learn 类现场可追溯）；
13. **[project-service.ts:316-331](../../../packages/core/src/forge/project-service.ts) 对账记账防护**：逐项 catch 内 recordKeyLog 套 try（记账抛错会截断本轮剩余行）；
14. **[dto/project.ts:64-65](../../../packages/contracts/src/dto/project.ts) 死字段**：RegisterResult.compensated 成功径永不置位——删或注释保留位；
15. **[bridge.ts:76-94](../../../apps/host/src/boot/bridge.ts) 白名单类型锚**：PROJECT/KNOWLEDGE_SERVICE_METHODS 手维护字面量——satisfies/keyof 锚到 contracts 服务面（改名编译期显形）；
16. 观察（顺手）：contracts 落 BrowseKnowledgeService 命名类型收口「第八法」四处手工同步；knowledge tsconfig references 残留 ../core 可删。

## 验收

- 每项独立小 PR 粒度可裁剪；全批完成后：四路评审 P2 清单逐项闭环（做/显式不做注记）；
- 现有测试池（972 单测 + e2e）全绿；新增防护各有单测（send 降级/钩子形制/白名单锚/记账防护）。

## Reference Files

- 见清单逐项定位；四路评审报告（本会话 2026-10-04）为规格源

## 边界与不做

- 全批零运行时行为变更（除防护新增）；P1 项已单列 fix-30/31/32，不在此批。
