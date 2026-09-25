---
journey: "session-native-ops-skill-addressing"
step: 4
step-action: "技能集扁平名寻址"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/session-native-ops-skill-addressing/journey.md
anchors:
  web:
    page: "上游会话视图(agent 会话)"
    route: "session"
    requires_auth: false
    layout: "上游 session 视图(技能经 customSkillDirs 承载)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: session-native-ops-skill-addressing / Step 4: 技能集扁平名寻址

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "customSkillDirs 已由应用写入用户层 dsh 配置;必迁 15 项技能目录在场(submit-task、git-commit、git-checkout、run-tests、fix-bug、test-guide、brainstorm、write-prd、tech-design、ui-design、breakdown-tasks、quick-tasks、gen-contracts、gen-journeys、gen-test-scripts)"
  fixture_spec:
    entities:
      - entity_type: "SkillDirectory"
        min_count: 15
        relationship_type: "belongs_to"
        parent_entity: "PluginSkillRoot"
        field_constraints:
          - field: "nameForm"
            value: "dsh 原生扁平名(零 forge: 前缀)"
      - entity_type: "PluginSkillRoot"
        min_count: 1
        field_constraints:
          - field: "configEntry"
            value: "customSkillDirs 受管条目(用户层配置)"
- Input: "在会话中以 dsh 原生扁平名逐一调用必迁技能集(15 项)"
- Output: "全部解析成功(无 forge: 前缀障碍);技能经 customSkillDirs 配置路径承载"
- State: "项目仓零新增文件(harness 级断言);技能根位于插件安装目录内(前缀校验通过)"
- Side-effect: "none"
- Invariants: "技能承载 = customSkillDirs 配置路径;项目仓零新增文件"

## Outcome "deferred-skill-absent"
<!-- source: prd-spec 技能迁移划分表(暂缓 20 项:已注册项目 dsh 会话缺席不阻断,外部会话继续可用) -->
- Preconditions: "会话调用暂缓迁移的辅助技能之一(如评估系 eval-* 类)"
  fixture_spec:
    entities:
      - entity_type: "SkillDirectory"
        min_count: 15
        relationship_type: "belongs_to"
        parent_entity: "PluginSkillRoot"
    state_requirements:
      - description: "被调技能属暂缓迁移清单(不在 15 项目录内)"
        prerequisite_entity: "SkillDirectory"
- Input: "用户观察会话行为并回看外部会话"
- Output: "已注册项目 dsh 会话内该技能缺席不阻断(无错误级失败);外部会话(冻结 CC 插件)继续可用该技能"
- State: "零状态变更;15 项必迁集不受影响"
- Side-effect: "none"
- Invariants: "暂缓迁移技能缺席不阻断"

## Outcome "skill-dirs-sync-alert"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-090(skill-dirs/sync.ts:19-30):配置漂移(条目缺失/重复/安装目录漂移/清单 hash 不符)由 boot 同步修复;不可管理形态 → 显式 failed + ERR_SKILL_DIR_SYNC 告警(设置面呈现),绝不静默吞掉 —— 技能承载面的可观察边界 -->
- Preconditions: "customSkillDirs 配置出现漂移或不可管理形态(条目缺失/重复、安装目录漂移、清单 hash 不符,经测试通道注入)"
  fixture_spec:
    entities:
      - entity_type: "PluginSkillRoot"
        min_count: 1
        field_constraints:
          - field: "configEntry"
            value: "漂移或不可管理形态(受管条目缺失/重复/路径漂移/hash 不符)"
    state_requirements:
      - description: "用户层配置存在漂移(测试通道注入)"
        prerequisite_entity: "PluginSkillRoot"
- Input: "应用 boot 后用户察看设置面告警条目并调用技能"
- Output: "可管理漂移被自动重写恢复(技能照常可寻址);不可管理形态呈现显式告警(ERR_SKILL_DIR_SYNC,非静默);用户自有目录条目字节级保留"
- State: "受管条目重写为正确值;前缀外用户条目原样;告警条目入设置面"
- Side-effect: "boot 同步留痕(changes 清单入日志)"
- Invariants: "技能承载面失败显式告警不静默;用户自有配置不破坏"

## Journey Invariants

- 已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
