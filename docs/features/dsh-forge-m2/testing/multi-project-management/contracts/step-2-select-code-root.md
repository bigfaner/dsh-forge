---
journey: "multi-project-management"
step: 2
step-action: "选择代码根目录并检出 forge 数据"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/multi-project-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → RegisterWizard 步骤①(选代码根目录)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: multi-project-management / Step 2: 选择代码根目录并检出 forge 数据

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "向导处于步骤 ①;第二个项目路径为含 forge 数据的可读目录(.forge 或 docs/features 存在)且未被注册"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "第二个可注册路径含 .forge/docs/features(检出探测可过)"
        prerequisite_entity: "Project"
- Input: "用户选择第二个项目的代码根目录并确认"
- Output: "系统扫描并检出 forge 数据(显示扫描中 loading 指示);检出通过后进入步骤 ②(选文档位置)"
- State: "向导前进至步骤 ②;零注册写入(检出为只读探测,零 forge CLI 调用、零项目目录写入)"
- Side-effect: "none(全程只读探测)"

## Outcome "no-forge-data"
<!-- surface-web required_outcomes 映射:validation-error → 向导输入校验失败 = 本边与 Step 3b(仓外路径冲突)两处实例;错误文案 + 修正引导、停留当前步骤 -->
- Preconditions: "所选代码根目录下未检出 forge 数据(无 .forge 与 docs/features)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "备选目录不含 forge 数据(空目录/普通目录)"
        prerequisite_entity: "Project"
- Input: "用户在步骤 ① 选择该路径并确认"
- Output: "显示错误引导(修正路径或提示先初始化项目);停留在步骤 ①,不得进入步骤 ②"
- State: "零注册写入(校验链在 forge 检出关卡拒绝,错误码语义 ERR_FORGE_NOT_DETECTED,消息指明缺失探测项)"
- Side-effect: "none"

## Outcome "duplicate-registration"
<!-- source: inferred:拒绝注册并提示已注册、定位既有项目卡片 —— 推自 tech-design 错误码表 ERR_PROJECT_EXISTS(code_root UNIQUE 冲突);不重复落库由 UNIQUE 约束保证 -->
- Preconditions: "向导步骤 ① 选定的代码根目录已被注册为项目(与现有项目 code_root 相同)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "codeRoot"
            value: "与向导将选路径相同(已注册)"
- Input: "用户在步骤 ① 选择该目录并确认"
- Output: "提示该代码根目录已注册并定位既有项目卡片;注册不重复落库(工作台状态读数不变)"
- State: "注册表不变(UNIQUE(code_root) 拒绝,错误码语义 ERR_PROJECT_EXISTS)"
- Side-effect: "none"

## Outcome "code-root-unreadable"
<!-- source: inferred:路径不可读腿推自注册校验链序 2(code_root 可读性探测,ERR_CODE_ROOT_UNREADABLE,消息含路径与原因:不存在/权限/非目录;见 apps/desktop/src/main/workbench/registry/validate.ts:144-152) -->
- Preconditions: "向导步骤 ① 选定的路径不可读——不存在、权限被拒或非目录(与未检出 forge 数据、已注册两情形互斥)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "备选路径不可读(不存在/无权限/非目录)"
        prerequisite_entity: "Project"
- Input: "用户在步骤 ① 选择该路径并确认"
- Output: "错误提示含路径与原因(不存在/权限被拒/非目录);停留在步骤 ①,不进入步骤 ②"
- State: "零注册写入(校验链序 2 拒绝,错误码语义 ERR_CODE_ROOT_UNREADABLE)"
- Side-effect: "none"

## Journey Invariants

- 项目三分模型:代码根目录、工作台自有状态、过程文档位置三者独立存放;工作台自有状态不与 forge 数据混放
- 移除项目只删工作台注册信息:任何移除操作不改动项目仓内文件与 forge 数据
- 单激活约束:任意时刻至多一个激活项目

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
```
