---
journey: "out-of-repo-docs-root"
step: 3
step-action: "过程资产读写落于文档根"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/journey.md
anchors:
  web:
    page: "工作台 · 任务看板 / 提案看板 / 阶段资产面板"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage / ProposalsPage / FeatureDetail StageAssetsTab"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: out-of-repo-docs-root / Step 3: 过程资产读写落于文档根

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "仓外注册项目就绪(授权已完成);agent 会话通道可用;代码仓工作区基线已记录"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "external"
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
      - entity_type: "ExecutionRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "用户在该注册项目上经 agent 会话产出多类过程资产(任务派发 subagent 执行并留执行记录;阶段总结会话生成阶段资产;管线会话产出提案),并在任务看板/提案看板/阶段资产面板浏览;随后经测试通道检查代码仓工作区(git 状态与未跟踪文件)"
- Output: "各看板/面板呈现的内容与产出一致,且全部来自仓外文档根下的过程文档(各视图同源寻址文档根);代码仓工作区除用户自有改动外无任何应用/agent 新增的过程文档;全部过程资产仅存在于仓外文档根"
- State: "任务/执行记录/阶段资产/proposals 读写按文档根寻址(文档根三分模型);代码仓零过程文档写入"
- Side-effect: "agent 会话产出过程文档(落于仓外文档根);内核索引随感知/直发更新"
- Invariants: "仓外注册项目:代码仓内零新增过程文档(应用/agent 写入语义,用户自有改动除外)"
<!-- density merge note: journey 3b(长期运行后的仓内零新增边界:各资产类型 ≥1 笔后的 git 级检查)与本 Outcome 断言同一性质(仓工作区零应用新增过程文档),按 risk-density 合并规则并档 —— 3b 的区分断言(每类资产 ≥1 + git 状态检查)已并入本 Outcome 的 Input/Output 断言面 -->

## Outcome "legacy-in-repo-docs-invisible"
<!-- source: inferred: UF3 Placement「仅检出 index.json 时插入迁移确认」+ 本旅程 INV3(全部过程资产读写按文档根寻址)推演——仓内既有 md 过程文档不被工作台呈现,亦不被迁移/改动;PRD 未定义该形态的警告/搬迁语义,本步骤仅断言最小推演、不定界警告行为 -->
- Preconditions: "fixture 3 形态:未注册、仓内已有过程文档但无 tasks/index.json 的 forge 项目(含 .forge/)"
  fixture_spec:
    entities:
      - entity_type: "ForgeProjectCodeRoot"
        min_count: 1
        field_constraints:
          - field: "hasDotForge"
            value: true
          - field: "hasInRepoProcessDocs"
            value: true
          - field: "hasIndexJson"
            value: false
- Input: "用户走注册向导,保持默认仓外文档根完成注册,随后浏览任务看板/提案看板"
- Output: "不插入迁移确认步骤(未检出 index.json);注册成功且文档根 = 仓外;工作台各视图按仓外文档根寻址 —— 仓内既有过程文档不出现在视图,文件零改动、零搬迁(harness 级)"
- State: "项目行 external 寻址;仓内既有过程文档不被索引(不在文档根下)"
- Side-effect: "none"
- Invariants: "全部过程资产读写按文档根寻址"

## Outcome "remove-registration"
<!-- source: BIZ-workbench-001(移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据) -->
<!-- source: inferred: 应用管理文档根的删除/保留归宿 PRD 未定界(BIZ-workbench-001 移除范围成文于 M2 仓内文档世界),本步骤显式不定界、不作断言 -->
- Preconditions: "仓外注册项目已注册且文档根含过程文档"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "external"
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "用户在工作台移除该注册项目"
- Output: "移除完成;项目仓内文件与 forge 数据零改动;再次注册同一代码根可行;仓外文档根内容的清除/保留归宿不作断言(PRD 未定界)"
- State: "级联清除自有数据(快照/挂接等);项目仓与 forge 数据零触碰"
- Side-effect: "移除级联(仅自有数据)"
- Invariants: "移除不触碰项目仓内文件与 forge 数据"

## Journey Invariants

- 新注册项目的文档根默认恒为仓外(应用管理路径);仓内仅为显式选项
- 仓外注册项目:代码仓内零新增过程文档(应用/agent 写入语义,用户自有改动除外)
- 全部过程资产读写按文档根寻址(看板/提案板/阶段资产同源)
- 既有仓内项目行为零破坏(默认值翻转不回溯影响存量项目)
- 注册期校验链沿用 M2:forge 数据未检出、重复注册、仓外路径非法或未授权均阻止落注册(无绕过通道,错误成因可辨)
