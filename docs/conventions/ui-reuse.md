---
title: "UI 沿用最大化(dsh 上游复用)"
domains: [ui, reuse, dsh-upstream, slot-injection, structural-twin, dual-host, data-face]
---

# UI 沿用最大化

### TECH-ui-reuse-001: UI 面优先沿用 dsh 上游既有实现

**Requirement**: 一切 UI 面优先沿用 dsh 已有实现;新增 UI 仅在上游确无对应物时自研,且风格与上游一致。
**Scope**: [CROSS]
**Source**: /learn entry 2026-09-19

- 主功能面(会话/聊天/审批/计划/设置/文件树/workspace 切换)100% 复用上游 client UI 插件族,经 carrier 接入,零重写、零改动(M1 已冻结为验收口径,见 SC7)。
- 壳级或应用级新增面优先参照上游 apps/desktop 同类实现先例(更新提示 update-coordinator、locale 机制、对话框模式)。
- 自研 UI 前必须先核对上游无对应物,并在任务执行记录中说明核对结论。
- 壳层自有文案中英双语,经上游 locale 机制提供,不自建文案通道。
- 背景:用户 2026-09-19 PRD 阶段定向;源 dsh-forge-m1 PRD Functional Specs「UI 沿用最大化原则」。

### TECH-ui-reuse-002: 上游导航槽位注入与视图键寻址(无路由 SPA)

**Requirement**: 上游 SPA 无路由——新增顶级视图经上游导航槽位注入:`main`(keyed 槽,root scope,ui-layout 声明)+ `sidebar.panellist`(list 槽,ui-sidebar 声明),注册契约 `key/id/order/label`;视图切换经 `ctx.layout.selectPanel` 回写共享控制器;页面族用视图键寻址(page-map 惯例,如 `workbench/overview|tasks|features`),视图切换状态会话期内存、不持久化进路由系统;禁自建导航旁路(插件内自绘 rail 仅最后兜底)。
**Context**: M1 spike-3 证外部通道不可用;M2 spike-1 定形槽位对;新增页面族(M3+)沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-006(design/tech-design.md §Overview D3/§Integration Specs;design/spike-1-findings.md §1;design/page-map.md;packages/plugins/forge-workbench/src/client/contract.ts)

**M4 修订(2026-10-01,M4 交付生效)**:视图键族**收缩**——`workbench/tasks|features|proposals[:slug]` 键退役,WorkbenchTabKey 收缩单成员 `'workbench/overview'` 逃生门(retire-in-place:快照保留字段 + 既有 hydrate 守卫安全归一,零迁移零复活);panellist「项目」行 = **null 寻址**(id: null,`selectPanel(null)` = 原生 conversation = 启动首屏;boot 归一于 apply 而非改视图键机器);拆出窗口 = 新 keyed main panel(DETACHED_PANEL_ID)经 window-role boot 路由,不经视图键机器;退役宿主测试 test.fixme 原地挂起(断言零删改 + 恢复指针)。
**Source**: features/dsh-forge-m4 tasks/records/1.6、1.7、1.8、4.3

### TECH-ui-reuse-003: 上游客户端包组件面不可直接导入(增强 = 数据面 + 槽位 + 行语言自绘)

**Requirement**: 上游客户端包(`@deepseek-ai/dsh-client-*`)的 `./client` 入口仅导出 types/inject/apply(插件装配面),内部组件(如 ui-workspace 的 Rows/tree.ts)不构成导出契约;forge 增强层一律 = 数据面服务(`ctx.workspaces`/`ctx.sessions` 等导出面)+ 槽位注入 + 行语言按设计规格自绘;禁依赖包 `./src/*` 深路径导入(源码映射非契约面,vendored 升级即断)。
**Context**: M4 左栏项目树侦察实证(ui-workspace client 入口导出面核对,2026-09-28);ui-design「复用上游会话列表组件」落码口径 = 复用数据面与行语言。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4 TECH(design/tech-design.md §Integration 1/§Dependencies;docs/decisions/architecture.md 2026-09-28 T1)

### TECH-ui-reuse-004: 上游 UI 槽位消费纪律(single/list 分型 · priority 替换渲染 · unlinked peer 结构孪生)

**Requirement**: 槽位语义**分型**——single 槽 = 最低优先级遮蔽渲染(第二注册整体替换原生组件,而原生组件不导出 = 禁止的包装/重挂载形态),**增量注入必须找 list 槽**(先例:conversation.input.dock、conversation.session.header.utilities、sidebar.right.tab.menu.item、sidebar.right.pane.tab.title);替换渲染走 **priority 机制**(forge -100 = lowest renders;原 occupant 保持注册为崩溃/卸载降级回退 abdicate);**unlinked peer 结构孪生**:SlotMap 声明/资源地址构造器本地镜像,owner 收窄为所读子集(未来上游合并时重复成员 = 显式编译错漂移警报而非静默),格式逐字节对拍 vendored 源 + 测试锁死;运行时全程 guarded,缺席整族静默不注册;右栏 tab 族经**两段式公开面**注册(stage one ctx 句柄 + stage two keyed 声明合并),原生不变量(空栏播种/关闭保护)经 extension band 保活而非复制;上游公共面无某能力时(如 ISidebarRight 无 resize 动词、库存无 pane 结构)→ forge 自建权威控件不遮原生交互面,pane 增删全走原生公共动词(openTab/openResource preferNewPane,原生 per-pane 页唯一性天然幂等去重),如需上游新 seam 走 vendored 升级显式适配。
**Context**: M4 T1 原生 home 增强层落地定形(左栏座位/右栏 tabs/C6 元数据条/C2 横幅/分屏控件五处一致实践);conversation.session single 槽遮蔽实测(2.7)是分型依据;后续里程碑一切会话域/右栏域座位沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4 TECH-004(tasks/records/1.6、2.2、2.7、3.5、4.4;design/tech-design.md §Integration 1/3/5)

### TECH-ui-reuse-005: 双宿主组件纪律(props 化 · 几何单源 · 默认形态 verbatim 锁证)

**Requirement**: 同一视图多宿主(主窗 pane / 拆出窗口 / 逃生门页面)时:宿主上下文一律 **props 化**(单一联合类型如 'window'|'pane' + 默认值兜底既有行为,组件内零宿主探测);宿主几何映射**单源**(无环共享家常量:dock 宽/inset/覆盖层锚定同源取值;pane 内禁 vw/vh,改板盒锚定 absolute + calc(100%-N));零缩水以**默认形态 verbatim 断言锁证**(既有挂载零行为变化);模态弹窗族窗口级自洽不随宿主穿透;项目绑定纯 props(拆出窗口钉来源项目,不读全局激活指针)。
**Context**: M4 TasksView 双宿主(右栏 pane + 拆出窗口)定形;M5+ 任何双宿主视图(todo 板等)沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4 TECH-005(tasks/records/2.1、4.3)
