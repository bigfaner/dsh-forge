---
journey: "explicit-sot-migration"
step: 3
step-action: "原子迁移执行与对拍结果"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/explicit-sot-migration/journey.md
anchors:
  web:
    page: "工作台 · 概览(迁移进度浮层)"
    route: "workbench/dialog/migrate-progress"
    requires_auth: false
    layout: "WorkbenchShell → MigrateProgress 浮层(进度中 data-close-guard 不可关)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: explicit-sot-migration / Step 3: 原子迁移执行与对拍结果

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "迁移确认已通过;迁移前任务全集基线已记录(ID/状态/依赖/标题,用于对拍);数据内核与文档树可读"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "taskCount"
            value: "≥10"
      - entity_type: "TaskMarkdownFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "TaskIndexFile"
      - entity_type: "TaskRecordFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "TaskIndexFile"
- Input: "用户观察迁移进度浮层直至完成"
- Output: "进度按 校验/迁移/对拍/完成 相位呈现;完成后展示对拍结果 = 任务全集(ID/状态/依赖/标题)与迁移前零差异;备份位置在结果中可见"
- State: "管线相位序:守卫 → 备份 → 摄入 → 对拍 → 切读 → 归档;摄入+切读+归档于单事务内提交;projects.data_authority 置 sqlite(与全量摄入同事务);index.json 改名归档;任务/记录 md 原样留存"
- Side-effect: "备份工件落 <userData>/workbench/backups/<projectId>-<时间戳>/(库文件 + 文档树 tasks/ 拷贝,harness 级断言在场);migration_progress 事件逐相位推送;migration_event 审计行随事务落档"
- Invariants: "COMMIT 收口在归档成功之后;任何路径不出现半迁移中间态"

## Outcome "interrupted-pre-commit-rollback"
- Preconditions: "迁移执行中应用被杀/崩溃,中断时点在事务提交之前(摄入/对拍/切读/归档任一相位;外部写入冲突所致失败不属本分支,二者成因互斥)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "迁移事务提交前进程被杀(测试通道在摄入/归档相位注入中断)"
        prerequisite_entity: "Project"
- Input: "重启应用,查看概览页终态呈现;若处回滚态则再次发起迁移"
- Output: "呈现已回滚状态 + 「重试」入口;tasks/index.json 完整在位,任务全集与 Setup 基线一致;重试可成功且对拍零差异"
- State: "事务未提交 → 库回滚至迁移前态(files 权威);已改名文件经恢复路径改名回滚(备份兜底);失败相 + rollback 审计行于事务外补记(失败审计不被事务回滚吞掉)"
- Side-effect: "migration_progress 推送失败相与 rollback 相"
- Invariants: "失败后状态 ≡ 迁移前态;重试幂等可成功"

## Outcome "interrupted-post-commit-success"
- Preconditions: "迁移事务已提交(COMMIT 完成)后、终态呈现前应用被杀/崩溃"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite(事务已提交)"
          - field: "migrated_at"
            value: "非空"
      - entity_type: "ArchivedIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "重启应用,查看概览页终态呈现"
- Output: "等价迁移成功终态:概览页无迁移入口,看板承载全部任务;事件与对拍结果经日志可回查(见 4c);不出现回滚/重试呈现"
- State: "库为迁移后完整态(sqlite 权威 + index.json 已归档);无第三态"
- Side-effect: "none"
- Invariants: "终态二值:提交前中断 = 回滚态,提交后中断 = 成功态,无第三态"

## Outcome "external-write-conflict"
- Preconditions: "迁移执行期间外部写者(终端 CLI/外部会话)改动任务数据;注入机制为 harness 级确定性命中:于摄入完成后、提交前经测试通道对 tasks/index.json 注入一次外部写"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "摄入完成后提交前,index.json 被外部改写(测试通道确定性注入)"
        prerequisite_entity: "TaskIndexFile"
- Input: "用户查看迁移结果"
- Output: "冲突被检测;迁移失败并回滚至干净态(不产生两源混合数据);失败呈现含冲突原因可辨;提示后可重试成功"
- State: "整体 ROLLBACK:库回迁移前态,文档树恢复(改名回滚/备份兜底);失败相(携带原因)+ rollback 审计行事务外补记"
- Side-effect: "migration_progress 推送失败相与 rollback 相"
- Invariants: "永不出现两源混合数据"

## Outcome "corrupt-source-validation"
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为迁移校验阶段源数据校验失败(index.json 损坏/不可读)的阻止 + 错误呈现 + 修正后可重试 -->
<!-- source: inferred -->
<!-- reasoning: journey 3d 注:UF3 进度首阶段 = 校验 + prd-spec 迁移线「原子迁移」,推演源数据非法阻止于摄入/淘汰之前(PRD 未显式定义源损坏分支) -->
- Preconditions: "项目文档树内 tasks/index.json 损坏或不可读(JSON 解析失败/结构缺失,经测试通道注入),检出发生于校验阶段"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskIndexFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "content"
            value: "损坏或不可读(JSON 解析失败/结构缺失)"
- Input: "用户确认迁移,查看迁移反馈"
- Output: "迁移终止于校验阶段;错误明确且原因可辨;修复源文件后可从入口重试成功(对拍零差异)"
- State: "零摄入/淘汰;tasks/index.json 原样在位(不修复不改动);库保持迁移前态"
- Side-effect: "失败审计留档(可回查)"

## Journey Invariants

- 迁移恒为显式触发(确认 + 迁移前自动备份);不存在自动/静默迁移路径
- 原子性:任何时刻项目处于「迁移前完整」或「迁移后完整」其一,永不出现半迁移态
- 任务/记录 md 永不迁移不改动;结构化状态迁移后以 SQLite 为唯一权威,tasks/index.json 终态淘汰
- 完成态必呈对拍结论;迁移事件全程留日志(备份/对拍结果)
- 自动备份恒先于摄入/淘汰;备份工件于完成态与失败回滚态均在结果所示位置在场(断言见 Step 3/3b),为不可逆淘汰的唯一恢复锚点;备份保留/清理策略 PRD 未定界,不作断言
