---
journey: "bootstrap-walkthrough"
step: 5
step-action: "总纲回归与收尾记账"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/bootstrap-walkthrough/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: bootstrap-walkthrough / Step 5: 总纲回归与收尾记账

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（回归与文档断言步，无表单交互面）; session-expired = N/A（断言对象为文档与回归门，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "里程碑收尾时点（走查任务链收口）；总纲文档在场可回归；宪法池回归入口可用"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        field_constraints:
          - field: "feature_status"
            value: "收口态（全任务终态）"
- Input: "执行总纲回归断言（SC2 / SC3 / SC7）与记账合入（顺延表 #1–#13 与总纲回写四条款）"
- Output: "总纲 SC2（无投影）/ SC3（只读边界）/ SC7（tool 读写延伸）回归断言绿；顺延表 #1–#13 与总纲回写四条款合入总纲（文档断言，SC9）"
- State: "总纲文档更新（顺延表与四条款在场）；宪法池回归绿"
- Side-effect: "文档变更经提交流水（commit_hash 可审计）"
- Invariants: "宪法池回归是走查收口的硬前置（SC-M3 门条件）"

## Outcome "constitution-regression-red"
- Preconditions: "总纲 SC2（无投影）/ SC3（只读边界）/ SC7（tool 读写延伸）任一回归失败"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "constitution_pool"
            value: "存在回归失败项（SC2/SC3/SC7 任一红）"
- Input: "执行总纲回归断言"
- Output: "门不放行（SC-M3 门条件）——回归红阻断走查收口"
- State: "走查保持未收口态；失败项待修复"
- Side-effect: "none（回归通道）"
- Invariants: "宪法池回归是走查收口的硬前置"

## Outcome "accounting-omission"
- Preconditions: "收尾记账时顺延表或总纲回写四条款缺席"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "master_doc"
            value: "顺延表 #1–#13 或四条款缺席（遗漏形态）"
- Input: "SC9 文档断言核查"
- Output: "断言红——顺延表 #1–#13 全量与四条款（M3 行收窄 / 全量顺延表 / brainstorm 条目修订 / M3.5 时序注记 + tech-research 偏离注记）必须合入总纲"
- State: "遗漏被识别（测试断言面）；补齐后文档合入完整"
- Side-effect: "none（断言通道）"

## Journey Invariants
- 全程零 manifest.md 生成（文件系统断言）——库记账是唯一记账通道
- 任务/执行记录 100% 入自身 forge.db（自举飞轮第一批真实数据入库，无漂移）
- 走查即 M3.5 立项启动（时序耦合：评审接受之时；不提前、不事后补）
- 自举纪律生效记账：M4 起剩余功能一律用自身开发
- 总纲 SC2 / SC3 / SC7 回归绿 + SC9 记账合入 = SC-M3 门放行条件
