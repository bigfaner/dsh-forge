/* M2 UI 原型 · 种子数据(v7:任务行增结构化 content 负载——DB 原型语义)
   本文件 = 每工作区 forge.db 的原型:任务是**结构化行**(列 + content 负载 ≈ vars_json 具体化),
   **没有任务文档**——任务内容不落 markdown,详情抽屉按类型模板渲染这些结构化数据。 */
(function () {
  var DSH_FORGE_HOME = '~/.dsh-forge'
  var WS = 'Z:\\project\\dsh\\demo-proj'
  function hash8(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0 } return ('00000000' + h.toString(16)).slice(-8) }
  function taskStore(ws) { return DSH_FORGE_HOME + '\\' + ws.replace(/\\/g, '-').replace(/^([A-Za-z]):/, '$1') + '@' + hash8(ws) }

  window.M2 = {
    home: DSH_FORGE_HOME, ws: WS, taskStore: taskStore,
    orphan: DSH_FORGE_HOME + '\\' + WS.replace(/\\/g, '-').replace(/^([A-Za-z]):/, '$1') + '-9f1c2ab7',

    projects: [{ id: 'p1', name: 'demo-proj', workspaceId: 'ws-a1f3e9', archived: false }],

    sessions: [
      { id: 's1', parent: null, title: 'run-tasks 派发(M2 dogfood)', running: true },
      { id: 's1-1', parent: 's1', title: 'executor · 2.4 tool 对接', running: true },
      { id: 's2', parent: null, title: '规格核对', running: false }
    ],

    /* ── features(元数据充实——与任务行同粒度的展开详情) ── */
    features: [
      { slug: 'm2-pipeline', status: 'in-progress', label: 'forge 管线接管',
        summary: '任务域从「无」带到「转正」——每工作区库 + 动词 API + 插件执行链 + 概览 tab',
        proposal_id: 'dsh-forge-m2-pipeline', created_at: '2026-10-01', updated_at: '2026-10-05' },
      { slug: 'demo-lib', status: 'tasks', label: '库重构演示',
        summary: '演示次 feature 的任务与文档行交互',
        proposal_id: 'demo-lib', created_at: '2026-10-03', updated_at: '2026-10-04' }
    ],

    /* ── proposals(五态 + 元数据充实) ── */
    proposals: [
      { id: 'dsh-forge-m2-pipeline', slug: 'dsh-forge-m2-pipeline', status: 'accepted',
        title: 'forge 管线接管', author: 'faner',
        summary: '每工作区库 + plugin-forge 执行链 + 概览/文档 tab',
        doc_path: 'docs/proposals/dsh-forge-m2-pipeline/proposal.md',
        created_at: '2026-10-01', decided_at: '2026-10-02',
        file: 'proposal.md' },
      { id: 'demo-ui-polish', slug: 'demo-ui-polish', status: 'under-review',
        title: '界面打磨增强', author: 'faner',
        summary: '空态插画统一 / 骨架节奏调优',
        doc_path: 'docs/proposals/demo-ui-polish/proposal.md',
        created_at: '2026-10-04', decided_at: null,
        file: 'proposal.md' },
      { id: 'demo-lib', slug: 'demo-lib', status: 'accepted',
        title: '库重构演示', author: 'faner',
        summary: '次 feature 演示提案',
        doc_path: 'docs/proposals/demo-lib/proposal.md',
        created_at: '2026-10-03', decided_at: '2026-10-03',
        file: 'proposal.md' }
    ],

    /* ── tasks(七态 + 类型化 content 负载——形状随类型而异,详情抽屉按类型模板渲染) ── */
    tasks: [
      { key: 'm2-pipeline/2.1', status: 'completed', title: 'core forge 域 schema + 七表迁移', deps: [], type: 'coding.feature', priority: 'P0', est: '4h', created_at: '2026-10-01 09:00', complexity: 'high', coverage: 92, coverage_expected: 90,
        content: { goal: '每工作区 forge.db 落地七域表(features/feature_documents/tasks/task_edges/task_records/proposals/task_session_links)+ schema_meta 版本表与幂等迁移器',
          scope: ['packages/core/src/forge/schema.sql', 'packages/core/src/forge/migrate.ts', 'packages/core/test/forge/schema.spec.ts'],
          acceptance: ['七表 DDL 与 db-schema §6 逐字段一致(剥离 M3 后移列)', '重复开库幂等——版本表判定零重放', 'task_records 双触发器:UPDATE/DELETE 均断言 ABORT', '同 feature 边约束 CHECK 生效'],
          refs: ['db-schema §1/§6', '架构基线 §3'] } },
      { key: 'm2-pipeline/2.2', status: 'completed', title: '状态机动词 API + 单测全路径', deps: ['m2-pipeline/2.1'], type: 'coding.feature', priority: 'P0', est: '4h', created_at: '2026-10-01 09:10', complexity: 'high', coverage: 88, coverage_expected: 85,
        content: { goal: 'addTask / claimTask / submitTask / transitionTask / queryTask 全路径——七态转移校验(from 匹配 / 依赖终态 / record 必带)内聚服务层',
          scope: ['packages/core/src/forge/verbs.ts', 'packages/core/test/forge/verbs.spec.ts', 'packages/core/test/forge/state.spec.ts'],
          acceptance: ['七态 × 动词转移矩阵 100% 单测覆盖', '环构造入口(addTask 双 flag)拒绝并回报环路径', 'claimTask in_progress 幂等重入 + digest 重合成'],
          refs: ['db-schema §6-13/14', '预研 §4'] } },
      { key: 'm2-pipeline/2.3', status: 'completed', title: 'dispatchPrompt 合成内聚 claimTask', deps: ['m2-pipeline/2.2'], type: 'coding.feature', priority: 'P0', est: '3h', created_at: '2026-10-01 09:12', complexity: 'medium', coverage: 85, coverage_expected: 80,
        content: { goal: 'claimTask 返回值内聚 dispatchPrompt:约束块 + 动态信息块(含 BLOCKERS 快照)+ 类型策略块三段构成,纯函数零 IO',
          scope: ['packages/core/src/forge/dispatch.ts', 'packages/core/test/forge/dispatch.spec.ts'],
          acceptance: ['三段构成快照测试(每 TaskType 一例)', 'BLOCKERS 快照取领取瞬间而非渲染时', '纯函数可快照测试(零外部依赖)'],
          refs: ['预研 §4'] } },
      { key: 'm2-pipeline/2.4', status: 'in_progress', title: 'plugin-forge tool 半身对接', deps: ['m2-pipeline/2.3'], type: 'coding.feature', priority: 'P0', est: '4h', created_at: '2026-10-01 09:14', complexity: 'high', coverage: 61, coverage_expected: 80,
        content: { goal: 'plugin-forge 注册 claim_task / submit_task / add_task 等 tool(下划线名形),消费宿主能力面 ctx.forgeProjects;cwd → forge.db 路由',
          scope: ['packages/plugin-forge/src/tools/faces.ts', 'packages/plugin-forge/src/tools/register.ts', 'packages/plugin-forge/src/session.ts'],
          acceptance: ['SC7 真闭环:tool 写入 → 状态层 → 看板即时', '会话上下文 = session.id + header.cwd(S8 实证同缝)', '工具注册名一律下划线形(validator_name)'],
          refs: ['S8 spike', 'M2 提案 SC7'], note: '工具名形违规已由 fix-1 记账(阻塞 2.5)' } },
      { key: 'm2-pipeline/2.5', status: 'blocked', title: 'skills 执行链迁移(run-tasks/fix 链)', deps: ['m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', est: '6h', created_at: '2026-10-02 10:00', complexity: 'high', blocked_reason: '依赖 fix-1(源 2.4 工具名形违规)——fix 链未完成', coverage_expected: 75,
        content: { goal: 'run-tasks / fix 链 / submit-task gate / git 纪律技能迁移 plugin-forge,对接 claim/submit 动词面',
          scope: ['packages/plugin-forge/skills/run-tasks/SKILL.md', 'packages/plugin-forge/skills/fix/SKILL.md', 'packages/plugin-forge/skills/submit-task/SKILL.md'],
          acceptance: ['run-tasks 派发链 dogfood 一条链不间断(SC-M2)', 'fix 链:block 边写入 + 完成自动恢复断言', '失败分诊协议迁移自 task-executor 约束块'],
          refs: ['M2 提案交付面②'] } },
      { key: 'm2-pipeline/2.6', status: 'pending', title: 'RPC/桥服务面扩展 + 派生行单源', deps: ['m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', est: '3h', created_at: '2026-10-02 14:00', complexity: 'medium', coverage_expected: 80,
        content: { goal: '宿主 RPC 面扩展任务域查询(listTasks / taskDetail / validateStore)+ 任务库路径派生行单源下发',
          scope: ['apps/host/src/rpc/forge.ts', 'packages/contracts/src/forge.ts'],
          acceptance: ['UI 全部经 RPC 直读状态层(零第二事实源)', 'validateStore 只读校验接入启动断言', '派生行与注册表单展示逐字一致'],
          refs: ['PRD UF-4', 'db-schema C8'] } },
      { key: 'm2-pipeline/2.7', status: 'pending', title: '概览面板 · 任务列表视图', deps: ['m2-pipeline/2.6'], type: 'coding.feature', priority: 'P1', est: '4h', created_at: '2026-10-03 09:00', complexity: 'medium', coverage_expected: 80,
        content: { goal: '概览 dock tab 任务子 tab:两行列表 + DAG + 泳道三视图,七态过滤 chips 与中英搜索',
          scope: ['apps/web/src/panels/overview/Tasks.tsx', 'apps/web/src/panels/overview/Dag.tsx', 'apps/web/src/panels/overview/Swim.tsx'],
          acceptance: ['三视图统一 chips 过滤(0 计数禁用)', '搜索中英双语 + IME 安全', '点击行/节点/卡片开任务抽屉'],
          refs: ['UI 设计 UF-1'] } },
      { key: 'm2-pipeline/2.8', status: 'pending', title: '文档浏览(SC4)+ 悬空容错', deps: ['m2-pipeline/2.6'], type: 'doc', priority: 'P1', est: '3h', created_at: '2026-10-03 10:00', complexity: 'low',
        content: { goal: '文档 dock tab:按 docRel 去重、只读渲染、悬空缺省态(不崩溃不写入不删行)',
          outline: ['发现面扫描契约(tech-design 定稿)', '只读 Markdown 渲染 + mermaid 占位卡', '悬空态:缺省渲染 + ↻ 重读', '按 docRel 去重开 tab'],
          deliverable: 'docs/features/m2-pipeline/ui/impl-notes.md', readers: '走查评审 / tech-design 输入' } },
      { key: 'm2-pipeline/2.9', status: 'pending', title: 'SC6③ 挂接双侧 + 会话头缝', deps: ['m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', est: '2h', created_at: '2026-10-03 14:00', complexity: 'medium', coverage_expected: 70,
        content: { goal: '会话头挂接 pill(双数据源:links=派发挂接 / records.session_id=执行挂接)+ 任务抽屉挂接区双侧一致',
          scope: ['apps/web/src/session/HeaderPills.tsx', 'apps/host/src/rpc/forge.ts'],
          acceptance: ['挂接双侧分别一致(防 executor 会话隐没)', 'pill 点击 → 概览 tab + 抽屉打开', '≤2 并排 + 溢出菜单'],
          refs: ['PRD UF-3', 'S8 spike'] } },
      { key: 'm2-pipeline/2.10', status: 'pending', title: 'SC-M2 门 dogfood 走查', deps: ['m2-pipeline/2.5', 'm2-pipeline/2.7', 'm2-pipeline/2.8', 'm2-pipeline/2.9'], type: 'gate', priority: 'P0', est: '2h', created_at: '2026-10-04 09:00', complexity: 'medium', breaking: true, gate_checks: { passed: 0, total: 10 },
        content: { scenario: 'run-tasks 派发链端到端真实模型 dogfood:claim_task(dispatchPrompt 三段断言)→ executor 子会话 → submit_task(质量门)→ 列表即时刷新;含 fix 链一次 + 模拟中断恢复一次',
          steps: ['领取就绪任务,断言 dispatchPrompt 三段构成', 'executor 阻塞派发(初始 prompt = dispatchPrompt)', '质量门 compile→fmt→lint→test 通过后 submit + git 提交', 'fix 链:block 边写入 + auto-restore 断言', '模拟子会话中断:claimTask 幂等重入 + 简报重合成'],
          checks: ['SC-M2 全 10 项检查清单', 'SC7/SC4/SC6③/SC2 回归', '零页面 JS 错误(冒烟)'] } },
      { key: 'm2-pipeline/fix-1', status: 'pending', title: 'fix: 2.4 工具注册名形违规', deps: [], source: 'm2-pipeline/2.4', fix: true, type: 'coding.fix', priority: 'P0', est: '1h', created_at: '2026-10-04 16:05', complexity: 'low', root_cause: 'tool 注册名使用了点号(validator.name)而非下划线(validator_name)', source_files: 'packages/knowledge/src/tools/faces.ts', test_script: 'pnpm vitest run packages/knowledge',
        content: { symptom: '宿主 tool 面校验拒绝点号名形,plugin-forge 工具注册全部失败',
          steps: ['faces.ts 注册名改下划线形(validator_name)', '补注册名形校验单测', '跑测试脚本确认全绿', 'submit 时恢复钩子应解除 2.5 阻塞(auto-restore)'],
          verify: 'pnpm vitest run packages/knowledge(全绿)' } },
      { key: 'demo-lib/1.1', status: 'skipped', title: '旧接口兼容层(跳过)', deps: [], type: 'coding.refactor', priority: 'P2', est: '2h', created_at: '2026-10-03 08:00', complexity: 'low', coverage_expected: 70,
        content: { goal: '抽离旧 API 兼容层,新调用面切换后保留一个版本的过渡垫片',
          scope: ['src/legacy/api.ts', 'src/index.ts'],
          acceptance: ['旧调用点零改动可编译', '垫片标记 @deprecated 并记账移除窗口'] } },
      { key: 'demo-lib/1.2', status: 'suspended', title: '性能基准采集(挂起)', deps: [], type: 'test.run', priority: 'P2', est: '1h', created_at: '2026-10-03 12:00', complexity: 'low', surface_key: 'web', surface_type: 'web',
        content: { command: 'pnpm bench --surface web', metrics: ['p95 会话打开耗时', '任务列表首帧', '内存峰值(长会话)'], baseline: 'v0.2.0-rc.2 @ 90 天直线' } },
      { key: 'demo-lib/1.3', status: 'rejected', title: '过时方案(否决)', deps: [], type: 'eval.contract', priority: 'P2', est: '3h', created_at: '2026-10-02 16:00', complexity: 'medium', main_session: true, score: 45, severity: 'high',
        content: { target: 'contracts/eval-contract.spec.md', rubric: [{ k: '断言可机械化', s: 60 }, { k: '六维覆盖', s: 40 }, { k: '语义描述符', s: 35 }], conclusion: '断言口径与现行 spec 重叠且过时——rejected(reason: superseded by eval-v2)' } }
    ],

    /* ── commits(实际改动范围的事实源:submit 记录的 commit hash → git 提交查询;
          DB 原型 = 实际实现为只读 git 查询的缓存行,此处直接给结果) ── */
    commits: {
      'a1b2c3d4': { at: '10-01 12:40', summary: 'feat(core): forge 域七表 schema + 幂等迁移器', files: ['packages/core/src/forge/schema.sql', 'packages/core/src/forge/migrate.ts', 'packages/core/test/forge/schema.spec.ts'] },
      '8c2f1e0a': { at: '10-02 12:31', summary: 'feat(core): 状态机动词 API 全路径 + 导出', files: ['packages/core/src/forge/verbs.ts', 'packages/core/test/forge/verbs.spec.ts', 'packages/core/src/index.ts'] },
      'c3d4e5f6': { at: '10-02 15:10', summary: 'feat(core): dispatchPrompt 三段合成(verbs 接口联动)', files: ['packages/core/src/forge/dispatch.ts', 'packages/core/test/forge/dispatch.spec.ts', 'packages/core/src/forge/verbs.ts'] }
    },

    records: {
      'm2-pipeline/2.1': [
        { verb: 'add', at: '10-01 09:00', note: '七表 + schema_meta + 幂等迁移' },
        { verb: 'claim', at: '10-01 09:30', note: 'digest 9a2b11c0(会话 s2 · 挂接行 upsert)' },
        { verb: 'submit', at: '10-01 12:40', note: 'gate ✓ compile/fmt/lint/test · 覆盖率 92%', commit: 'a1b2c3d4' }
      ],
      'm2-pipeline/2.2': [
        { verb: 'add', at: '10-01 09:10', note: 'manual 边 ← 2.1' },
        { verb: 'claim', at: '10-02 10:00', note: 'digest a11b07c3(会话 s2 · 挂接行 upsert)' },
        { verb: 'submit', at: '10-02 12:31', note: 'gate ✓ compile/fmt/lint/test · 覆盖率 88%', commit: '8c2f1e0a' }
      ],
      'm2-pipeline/2.3': [
        { verb: 'add', at: '10-01 09:12', note: 'manual 边 ← 2.2' },
        { verb: 'claim', at: '10-02 14:00', note: 'digest b7c4d8e1(会话 s2 · 挂接行 upsert)' },
        { verb: 'submit', at: '10-02 15:10', note: 'gate ✓ · 覆盖率 85% · verbs.ts 接口联动补导出', commit: 'c3d4e5f6' }
      ],
      'm2-pipeline/2.4': [
        { verb: 'add', at: '10-01 09:12', note: 'manual 边 ← 2.3' },
        { verb: 'claim', at: '10-04 14:02', note: 'digest d3f92a71(会话 s1 · 挂接行 upsert)' },
        { verb: 'claim', at: '10-04 15:40', note: '幂等重入(外环重派)· 简报重合成 digest 77a0c1e8' }
      ],
      'm2-pipeline/2.5': [
        { verb: 'add', at: '10-01 09:14', note: 'manual 边 ← 2.4' },
        { verb: 'submit', at: '10-04 16:05', note: 'result=blocked · reason: 2.4 工具名形违规(gate ✗ lint)' },
        { verb: 'auto-block', at: '10-04 16:05', note: 'addTask --block-source 单事务置源 blocked(fix-1 创建)' }
      ],
      'm2-pipeline/fix-1': [
        { verb: 'add', at: '10-04 16:05', note: 'coding-fix · block-source 2.4 · 边 (2.4 ← fix-1)' }
      ],
      'demo-lib/1.1': [
        { verb: 'add', at: '10-03 08:00', note: 'coding-refactor · 兼容层垫片' },
        { verb: 'transition', at: '10-04 10:00', note: 'pending → skipped · reason: 新调用面直接切换,垫片不需要' }
      ],
      'demo-lib/1.2': [
        { verb: 'add', at: '10-03 12:00', note: 'test-run · surface web' },
        { verb: 'transition', at: '10-04 09:20', note: 'pending → suspended · reason: 等 1.1 兼容层定案后一并采集' }
      ],
      'demo-lib/1.3': [
        { verb: 'add', at: '10-02 16:00', note: 'eval-contract · 🔑 主会话执行(不分发)' },
        { verb: 'eval', at: '10-02 17:30', note: 'score 45/100 · 严重度 high · 断言口径与现行 spec 重叠且过时' },
        { verb: 'transition', at: '10-03 09:00', note: 'in_progress → rejected · reason: superseded by eval-v2' }
      ]
    },

    links: [
      { key: 'm2-pipeline/2.2', session: 's2', kind: 'link' },
      { key: 'm2-pipeline/2.2', session: 's2', kind: 'exec' },
      { key: 'm2-pipeline/2.4', session: 's1', kind: 'link' },
      { key: 'm2-pipeline/2.4', session: 's1-1', kind: 'exec' },
      { key: 'm2-pipeline/2.5', session: 's1', kind: 'link' }
    ],

    /* ── feature 文档索引(元数据充实) ── */
    featureDocs: [
      { slug: 'm2-pipeline', docs: [
        { kind: 'prd-spec', rel: 'docs/features/m2-pipeline/prd/prd-spec.md', summary: 'PRD 规格', dangling: false },
        { kind: 'tech-design', rel: 'docs/features/m2-pipeline/design/tech-design.md', summary: '技术设计(占位)', dangling: false },
        { kind: 'sql-schema', rel: 'docs/features/m2-pipeline/design/schema.sql', summary: '任务域 schema(已并档·悬空演示)', dangling: true }
      ] },
      { slug: 'demo-lib', docs: [
        { kind: 'prd-spec', rel: 'docs/features/demo-lib/prd/prd-spec.md', summary: 'PRD', dangling: false }
      ] }
    ],

    /* ── refDocs(参考文档锚点 → 文档路径映射;参考 chip 点击 → dock 开 tab) ── */
    refDocs: {
      'db-schema': 'docs/proposals/dsh-forge-m2-pipeline/db-schema.md',
      '架构基线': 'docs/proposals/dsh-forge-redesign/architecture.md',
      'M2 提案': 'docs/proposals/dsh-forge-m2-pipeline/proposal.md',
      'S8': 'docs/proposals/dsh-forge-m2-pipeline/spikes/s8-session-ctx.md',
      'S10': 'docs/proposals/dsh-forge-m2-pipeline/spikes/s10-path-stability.md',
      '预研': 'docs/proposals/dsh-forge-redesign/tech-research.md',
      'PRD': 'docs/features/m2-pipeline/prd/prd-spec.md',
      'UI 设计': 'docs/features/m2-pipeline/ui/ui-design.md'
    },

    docs: {
      'docs/proposals/dsh-forge-m2-pipeline/db-schema.md': '# M2 任务域 Schema 预设计\n\n## §1 总则\n\n- FK 一律不带 ON DELETE(RESTRICT 默认)——M2 无删除动词\n\n## §6 已裁决项(节选)\n\n- §6-13 动态边只随 addTask 发生;M2 无独立加边动词\n- §6-14 环校验增量化:--depends-on 与 --block-source 组合 → 从 D 沿出边可达性 DFS\n\n> 只读渲染演示——参考文档锚点跳转。',
      'docs/proposals/dsh-forge-redesign/architecture.md': '# 架构基线\n\n## §3 状态层细则\n\n七表(features/feature_documents/tasks/task_edges/task_records/proposals/task_session_links)+ 七态 CHECK + append-only 记录 + 动词 API。\n\n## §6 已知边界\n\n单机单活跃分支为状态层显式假设;多机同步划出 v1 边界外。',
      'docs/proposals/dsh-forge-m2-pipeline/spikes/s8-session-ctx.md': '# S8 会话上下文实证\n\n**结论(S8 通过,无需回退)**:子会话 id 可得;`header.cwd` 两侧在场且同值——cwd→工作区路由对子会话同样可用,M2 plugin-forge 的 cwd→forge.db 路由无子会话盲区。',
      'docs/proposals/dsh-forge-redesign/tech-research.md': '# 技术预研笔记\n\n## §4 动态提示词组装\n\ndispatchPrompt = 约束块 + 动态信息块(含 BLOCKERS 快照)+ 类型策略块,纯函数零 IO,合成内聚 claimTask。',
      'docs/proposals/dsh-forge-m2-pipeline/proposal.md': '# Proposal: dsh-forge M2 —— forge 管线接管\n\n任务域从「无」带到「转正」。\n\n## 交付面\n\n```mermaid\ngraph TD\n  A[每工作区库] --> B[动词 API]\n  B --> C[dispatchPrompt]\n  C --> D[plugin-forge tool]\n  D --> E[概览 tab]\n  D --> F[SC6③ 挂接双侧]\n  E --> G[SC-M2 门]\n```\n\n- core · forge 域转正(每工作区库 + 动词 API)\n- plugin-forge 插件入仓(tool + skills 执行链)\n- 概览面板 + SC6③ 挂接双侧\n- SC7 真闭环 + SC-M2 门\n\n> 只读渲染演示;frontmatter 不混入正文。',
      'docs/features/m2-pipeline/prd/prd-spec.md': '# PRD Spec —— M2\n\n## Goals\n\n- SC7 真闭环(e2e + 代码审计)\n- SC-M2 门:派发链 dogfood 一条链不间断\n\n```mermaid\nflowchart LR\n  claim --> |dispatchPrompt| executor\n  executor --> |gate| submit\n  submit --> |blocked?| fix\n  fix --> |auto-restore| claim\n```\n\n```\nquantified: 是\n```',
      'docs/features/m2-pipeline/design/tech-design.md': '# Tech Design —— M2(占位)\n\n本文件为悬空演示的对照:同 feature 下正常文档只读渲染。',
      'docs/proposals/demo-lib/proposal.md': '# Proposal: 库重构演示\n\n演示 feature 组行与文档行交互。',
      'docs/proposals/demo-ui-polish/proposal.md': '# Proposal: 界面打磨增强\n\nstatus: under-review(评审中)。\n\n- 空态插画统一\n- 骨架节奏调优',
      'docs/features/demo-lib/prd/prd-spec.md': '# PRD —— 库重构演示\n\n次 feature 的文档行与折叠交互演示。'
    }
  }
})()
