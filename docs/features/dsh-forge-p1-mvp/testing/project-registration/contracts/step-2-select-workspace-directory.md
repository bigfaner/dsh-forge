---
journey: "project-registration"
step: 2
step-action: "在文件浏览器选定工作区目录"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/project-registration/journey.md
anchors:
  web:
    page: "添加项目（两段模态流程）"
    route: "modal/add-project"
    requires_auth: false
    layout: "覆盖中区的模态"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: project-registration / Step 2: 在文件浏览器选定工作区目录

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "添加项目模态处于第一段文件浏览器，目录列表已呈现，目标工作区目录可达（可经双击进入或面包屑跳转浏览）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "registration_state"
            value: "未注册（canonical path 不命中任何既有工作区）"
- Input: "双击进入目录层级或经面包屑跳转浏览，单击选中目标工作区目录，点「下一步」"
- Output: "进入第二段注册表单——工作区目录只读回填（可「重新选择」），项目名自动取文件夹名；「下一步」在未选中任何目录时不可用且有引导提示"
- State: "表单默认值就位（forge 目录 / 知识库目录 / 任务清单与记录派生行，见 Step 3 断言）；流程取消点仍存在于对话框内"
- Side-effect: "none（选择态为前端态，未触发注册）"

## Outcome "attach-existing-workspace"
<!-- 溯源: journey Step 2b（选定已注册目录——幂等挂接既有） -->
- Preconditions: "候选目录的 canonical path 命中 dsh registry 既有工作区（浏览器行带「已注册」标记）"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "canonical_path"
            value: "与候选目录 canonical path 一致（已注册）"
- Input: "选中该已注册目录，点「下一步」进入表单后「确认」"
- Output: "注册执行走「挂接既有」分支——ownership 预检命中（不新建工作区、不登记补偿）；成功反馈含挂接既有说明并自动关闭模态；左栏出现该项目；既有工作区与其会话不受影响"
- State: "应用库写入 projects 行成功（携带既有 workspaceId 外键）；dsh registry 注册数不变、无补偿登记"
- Side-effect: "应用库新增一行项目记录（挂接既有工作区）"

## Outcome "listing-failure-retryable"
<!-- source: inferred -->
<!-- reasoning: Fact Table（AP-16，apps/web/src/flows/add-project/DirectoryBrowser.tsx:173-192）——浏览器列举失败态有错误提示条与重试入口且导航状态保持；注册入口在 High 风险旅程中的现实边界，非 PRD 原文 -->
- Preconditions: "文件浏览器当前目录列举失败（目录不可读或列举通道返回异常）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDirectory"
        min_count: 1
        field_constraints:
          - field: "listable"
            value: "false（当前层级列举不可用）"
- Input: "查看浏览器列表区域并点击重试入口"
- Output: "错误提示呈现（可修正、可重试），面包屑与已选导航状态不丢失；重试成功后目录列表恢复呈现"
- State: "流程停留在第一段文件浏览器，无注册副作用"
- Side-effect: "none"

## Journey Invariants

- 取消点只存在于两段对话框（返回上一步或直接关闭），均在 dsh create 之前；任何取消后 dsh 侧与应用侧零残留
- 应用库 projects 记录必须携带 workspace 外键，canonical path 为对账 join key
- 左栏会话列表实时读 dsh 账本，零缓存零副本（无投影同步）
- hero 空态仅在项目数 = 0 时呈现；首个项目注册成功后永久让位，不残留

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：WorkspaceDirectory（未注册候选或不可列举目录）或 Workspace（已注册既有工作区），按 Outcome 取其一。
