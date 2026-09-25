---
journey: "out-of-repo-docs-root"
step: 4
step-action: "既有仓内项目兼容"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/journey.md
anchors:
  web:
    page: "工作台 · 任务看板 / 阶段资产 / 提案看板(仓内项目)"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage / FeatureDetail / ProposalsPage"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: out-of-repo-docs-root / Step 4: 既有仓内项目兼容

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "既有仓内文档根的已注册项目在场(fixture 2,docLocationType = in_repo);M3 读写面可用"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "in_repo"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "用户打开既有仓内文档根项目,执行 M3 读写(任务看板/阶段资产面板/提案看板)"
- Output: "全部功能兼容不破坏;文档根仍在仓内;行为不因默认值翻转而改变"
- State: "项目行 docLocationType 保持 in_repo(默认值翻转不回溯);读写按仓内文档根寻址"
- Side-effect: "none"
- Invariants: "既有仓内项目行为零破坏"

## Outcome "external-change-backflow"
<!-- source: inferred: ≤5s 回流口径仅任务看板(BIZ-workbench-005)与提案看板(SC6/Story 6)有源;阶段资产面板的回流呈现为 M2 DF003 感知机制延续的推演,PRD 未对其单列时效断言 -->
- Preconditions: "既有仓内项目的文档被外部(终端 CLI/编辑器)修改"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "in_repo"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "仓内文档被外部修改(测试通道在应用外改写文件)"
        prerequisite_entity: "Project"
- Input: "用户回看应用内工作台(任务看板/提案看板/阶段资产面板)"
- Output: "外部修改在应用内可见 —— 任务与提案变更 ≤5 秒回流(免手动刷新),阶段资产/文档视图呈现最新内容;兼容为持续感知的读写,非仅启动时静态读取"
- State: "watcher 感知仓内文档根(codeRoot 下 .forge + docs/features);扫描后索引行集替换"
- Side-effect: "sync 事件批推"
- Invariants: "感知健康时外部变更 ≤5s 回流(任务/提案有源口径)"

## Journey Invariants

- 新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项
- 仓外注册项目:代码仓内零新增过程文档(应用/agent 写入语义,用户自有改动除外)
- 全部过程资产读写按文档根寻址(看板/提案板/阶段资产同源)
- 既有仓内项目行为零破坏(默认值翻转不回溯影响存量项目)
- 注册期校验链沿用 M2:forge 数据未检出、重复注册、仓外路径非法或未授权均阻止落注册(无绕过通道,错误成因可辨)
