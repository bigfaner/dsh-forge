---
journey: "project-workbench-home"
step: 1
step-action: "启动进入项目工作台首屏"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-workbench-home/journey.md
anchors:
  web:
    page: "项目工作台(project 逻辑态 = 原生 conversation 面板 + forge 注入层)"
    route: "project(视图键 selectPanel(null);上游 SPA 无 URL 路由)"
    requires_auth: false
    layout: "AppFrame → ConversationPanel(原生)+ forge 注入(左栏座位/panellist 行/右栏 tabs);启动默认落点恢复 active_project_id"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-workbench-home / Step 1: 启动进入项目工作台首屏

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (getState.activeProjectId / 视图键可直接核验;FT-134) -->

## Outcome "success"
- Preconditions: "应用已安装且以单实例启动,M1-M3 基座可用;存在 ≥2 个注册项目(其一活跃、其一归档),且应用记住上次活跃项目"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "archived"
            value: "1 个活跃(archived=false)+ 1 个归档(archived=true)"
      - entity_type: "AppState"
        min_count: 1
        field_constraints:
          - field: "active_project_id"
            value: "指向活跃项目(上次退出时的活跃指针)"
- Input: "编排者启动应用(操作系统入口拉起进程,本机无既有实例)"
- Output: "首屏 = 项目工作台(project 视图键),恢复上次活跃项目;左栏项目树、中间会话面板、右栏 dockkit 三区容器整台呈现;不以 dsh 原生会话列表或旧全局平铺导航为首屏"
- State: "active_project_id 恢复指向(getState.activeProjectId = 上次活跃项目);首屏路由形态 = project 工作台"
- Side-effect: "none"
- Invariants: "项目工作台恒为启动首屏"

## Outcome "empty-first-boot"
<!-- source: inferred -->
<!-- reasoning: journey Step 1b(推自 UF1 empty 态定义——空态唯一呈现即 hero 引导);page-map「恢复 active_project_id,无项目 → 空态引导」 -->
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无常规表单输入面,最近似面 = 空态引导可达的添加项目确认卡路径输入,非法输入映射为即时校验提示、留在卡内可修正(操作细节由注册旅程承载) -->
- Preconditions: "全新安装,无任何注册项目(active_project_id 为空,注册表零行)"
  fixture_spec:
    entities:
      - entity_type: "AppState"
        min_count: 1
        field_constraints:
          - field: "active_project_id"
            value: "空(无注册项目)"
    state_requirements:
      - description: "项目注册表为空(全新安装)"
        prerequisite_entity: "Project"
- Input: "编排者启动应用"
- Output: "工作台空态 hero 引导「添加项目」(UF7 入口,C7 确认卡唯一注册入口);不渲染空项目树、不渲染空三区骨架;无报错"
- State: "零注册项目状态保持;不产生任何半注册数据"
- Side-effect: "none"

## Journey Invariants

- 孤儿视图恒 0:旅程全程任何 forge 视图入口均处于项目上下文
- 知识区扩展位不渲染任何空 tab/空视图/预置数据(SC2 断言)
- 左栏全项目树枚举与项目注册表一致;归档项目恒为树内降透明只读分区,不挂会话
- 项目工作台恒为启动首屏,首屏 ≤2s(500 任务规模),视图切换不劣于重构前
- 代码区与 forge 文件区同页可见性在项目切换与重启之间保持(除 error/降级态外,三区容器为常驻结构)
