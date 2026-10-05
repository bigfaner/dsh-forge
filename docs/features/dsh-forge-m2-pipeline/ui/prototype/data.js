/* M2 UI 原型 · 种子数据(v6 打磨版:提案/feature 元数据充实 + 任务 DAG/泳道 + 搜索) */
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

    tasks: [
      { key: 'm2-pipeline/2.1', status: 'completed', title: 'core forge 域 schema + 七表迁移', deps: [], type: 'coding.feature', priority: 'P0', est: '4h', created_at: '2026-10-01 09:00', complexity: 'high', coverage: 92 },
      { key: 'm2-pipeline/2.2', status: 'completed', title: '状态机动词 API + 单测全路径', deps: ['m2-pipeline/2.1'], type: 'coding.feature', priority: 'P0', est: '4h', created_at: '2026-10-01 09:10', complexity: 'high', coverage: 88 },
      { key: 'm2-pipeline/2.3', status: 'completed', title: 'dispatchPrompt 合成内聚 claimTask', deps: ['m2-pipeline/2.2'], type: 'coding.feature', priority: 'P0', est: '3h', created_at: '2026-10-01 09:12', complexity: 'medium', coverage: 85 },
      { key: 'm2-pipeline/2.4', status: 'in_progress', title: 'plugin-forge tool 半身对接', deps: ['m2-pipeline/2.3'], type: 'coding.feature', priority: 'P0', est: '4h', created_at: '2026-10-01 09:14', complexity: 'high', coverage: 61 },
      { key: 'm2-pipeline/2.5', status: 'blocked', title: 'skills 执行链迁移(run-tasks/fix 链)', deps: ['m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', est: '6h', created_at: '2026-10-02 10:00', complexity: 'high', blocked_reason: '依赖 fix-1(源 2.4 工具名形违规)——fix 链未完成' },
      { key: 'm2-pipeline/2.6', status: 'pending', title: 'RPC/桥服务面扩展 + 派生行单源', deps: ['m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', est: '3h', created_at: '2026-10-02 14:00', complexity: 'medium' },
      { key: 'm2-pipeline/2.7', status: 'pending', title: '概览面板 · 任务列表视图', deps: ['m2-pipeline/2.6'], type: 'coding.feature', priority: 'P1', est: '4h', created_at: '2026-10-03 09:00', complexity: 'medium' },
      { key: 'm2-pipeline/2.8', status: 'pending', title: '文档浏览(SC4)+ 悬空容错', deps: ['m2-pipeline/2.6'], type: 'doc', priority: 'P1', est: '3h', created_at: '2026-10-03 10:00', complexity: 'low' },
      { key: 'm2-pipeline/2.9', status: 'pending', title: 'SC6③ 挂接双侧 + 会话头缝', deps: ['m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', est: '2h', created_at: '2026-10-03 14:00', complexity: 'medium' },
      { key: 'm2-pipeline/2.10', status: 'pending', title: 'SC-M2 门 dogfood 走查', deps: ['m2-pipeline/2.5', 'm2-pipeline/2.7', 'm2-pipeline/2.8', 'm2-pipeline/2.9'], type: 'gate', priority: 'P0', est: '2h', created_at: '2026-10-04 09:00', complexity: 'medium', breaking: true, gate_checks: { passed: 0, total: 10 } },
      { key: 'm2-pipeline/fix-1', status: 'pending', title: 'fix: 2.4 工具注册名形违规', deps: [], source: 'm2-pipeline/2.4', fix: true, type: 'coding.fix', priority: 'P0', est: '1h', created_at: '2026-10-04 16:05', complexity: 'low', root_cause: 'tool 注册名使用了点号(validator.name)而非下划线(validator_name)', source_files: 'packages/knowledge/src/tools/faces.ts', test_script: 'pnpm vitest run packages/knowledge' },
      { key: 'demo-lib/1.1', status: 'skipped', title: '旧接口兼容层(跳过)', deps: [], type: 'coding.refactor', priority: 'P2', est: '2h', created_at: '2026-10-03 08:00', complexity: 'low' },
      { key: 'demo-lib/1.2', status: 'suspended', title: '性能基准采集(挂起)', deps: [], type: 'test.run', priority: 'P2', est: '1h', created_at: '2026-10-03 12:00', complexity: 'low', surface_key: 'web', surface_type: 'web' },
      { key: 'demo-lib/1.3', status: 'rejected', title: '过时方案(否决)', deps: [], type: 'eval.contract', priority: 'P2', est: '3h', created_at: '2026-10-02 16:00', complexity: 'medium', main_session: true, score: 45, severity: 'high' }
    ],

    records: {
      'm2-pipeline/2.2': [
        { verb: 'add', at: '10-01 09:10', note: 'manual 边 ← 2.1' },
        { verb: 'claim', at: '10-02 10:00', note: 'digest a11b07c3(会话 s2 · 挂接行 upsert)' },
        { verb: 'submit', at: '10-02 12:31', note: 'gate ✓ compile/fmt/lint/test · commit 8c2f1e0(执行会话 s2)' }
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

    docs: {
      'docs/proposals/dsh-forge-m2-pipeline/proposal.md': '# Proposal: dsh-forge M2 —— forge 管线接管\n\n任务域从「无」带到「转正」。\n\n## 交付面\n\n```mermaid\ngraph TD\n  A[每工作区库] --> B[动词 API]\n  B --> C[dispatchPrompt]\n  C --> D[plugin-forge tool]\n  D --> E[概览 tab]\n  D --> F[SC6③ 挂接双侧]\n  E --> G[SC-M2 门]\n```\n\n- core · forge 域转正(每工作区库 + 动词 API)\n- plugin-forge 插件入仓(tool + skills 执行链)\n- 概览面板 + SC6③ 挂接双侧\n- SC7 真闭环 + SC-M2 门\n\n> 只读渲染演示;frontmatter 不混入正文。',
      'docs/features/m2-pipeline/prd/prd-spec.md': '# PRD Spec —— M2\n\n## Goals\n\n- SC7 真闭环(e2e + 代码审计)\n- SC-M2 门:派发链 dogfood 一条链不间断\n\n```mermaid\nflowchart LR\n  claim --> |dispatchPrompt| executor\n  executor --> |gate| submit\n  submit --> |blocked?| fix\n  fix --> |auto-restore| claim\n```\n\n```\nquantified: 是\n```',
      'docs/features/m2-pipeline/design/tech-design.md': '# Tech Design —— M2(占位)\n\n本文件为悬空演示的对照:同 feature 下正常文档只读渲染。',
      'docs/proposals/demo-lib/proposal.md': '# Proposal: 库重构演示\n\n演示 feature 组行与文档行交互。',
      'docs/proposals/demo-ui-polish/proposal.md': '# Proposal: 界面打磨增强\n\nstatus: under-review(评审中)。\n\n- 空态插画统一\n- 骨架节奏调优',
      'docs/features/demo-lib/prd/prd-spec.md': '# PRD —— 库重构演示\n\n次 feature 的文档行与折叠交互演示。'
    }
  }
})()
