/* M2 UI 原型 · 种子数据（内存态，重置钮还原）
   形态对齐 M2 数据面：features(相位) / tasks(七态) / task_edges(前置) /
   task_records(verb 时间线) / task_session_links(挂接·分型) / 文档索引(feature_documents+proposals)。 */
(function () {
  var DSH_FORGE_HOME = '~/.dsh-forge'
  var WS = 'Z:\\project\\dsh\\demo-proj'

  function hash8(s) {
    var h = 0x811c9dc5
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0 }
    return ('00000000' + h.toString(16)).slice(-8)
  }
  function taskStore(ws) {
    var w = ws.replace(/\\/g, '-').replace(/^([A-Za-z]):/, '$1')
    return DSH_FORGE_HOME + '\\' + w + '-' + hash8(ws)
  }

  window.M2DATA = {
    DSH_FORGE_HOME: DSH_FORGE_HOME,
    ws: WS,
    taskStore: taskStore,
    orphanDir: (function () {
      var w = WS.replace(/\\/g, '-').replace(/^([A-Za-z]):/, '$1')
      return DSH_FORGE_HOME + '\\' + w + '-9f1c2ab7'
    })(),

    features: [
      { slug: 'dsh-forge-m2-pipeline', status: 'in-progress', title: 'forge 管线接管' },
      { slug: 'demo-lib-refactor', status: 'tasks', title: '库重构演示' }
    ],

    /* tasks: key/status/type/deps(前置 keys)/source(fix 源) */
    tasks: [
      { key: 'dsh-forge-m2-pipeline/2.1', status: 'completed', title: 'core forge 域 schema + 七表迁移', deps: [] },
      { key: 'dsh-forge-m2-pipeline/2.2', status: 'completed', title: '状态机动词 API + 单测全路径', deps: ['dsh-forge-m2-pipeline/2.1'] },
      { key: 'dsh-forge-m2-pipeline/2.3', status: 'completed', title: 'dispatchPrompt 合成内聚 claimTask', deps: ['dsh-forge-m2-pipeline/2.2'] },
      { key: 'dsh-forge-m2-pipeline/2.4', status: 'in_progress', title: 'plugin-forge tool 半身对接', deps: ['dsh-forge-m2-pipeline/2.3'] },
      { key: 'dsh-forge-m2-pipeline/2.5', status: 'blocked', title: 'skills 执行链迁移（run-tasks/fix 链）', deps: ['dsh-forge-m2-pipeline/2.4'], source: 'dsh-forge-m2-pipeline/fix-1' },
      { key: 'dsh-forge-m2-pipeline/2.6', status: 'pending', title: 'RPC/桥服务面扩展 + 派生行单源', deps: ['dsh-forge-m2-pipeline/2.4'] },
      { key: 'dsh-forge-m2-pipeline/2.7', status: 'pending', title: '概览页签 · 任务列表视图', deps: ['dsh-forge-m2-pipeline/2.6'] },
      { key: 'dsh-forge-m2-pipeline/2.8', status: 'pending', title: '文档页签（SC4）+ 悬空容错', deps: ['dsh-forge-m2-pipeline/2.6'] },
      { key: 'dsh-forge-m2-pipeline/2.9', status: 'pending', title: 'SC6③ 挂接双侧 + 会话头缝', deps: ['dsh-forge-m2-pipeline/2.4'] },
      { key: 'dsh-forge-m2-pipeline/2.10', status: 'pending', title: 'SC-M2 门 dogfood 走查', deps: ['dsh-forge-m2-pipeline/2.5', 'dsh-forge-m2-pipeline/2.7', 'dsh-forge-m2-pipeline/2.8', 'dsh-forge-m2-pipeline/2.9'] },
      { key: 'dsh-forge-m2-pipeline/fix-1', status: 'in_progress', title: 'fix: 2.4 工具注册名形违规', deps: [], source: 'dsh-forge-m2-pipeline/2.4', type: 'coding-fix' },
      { key: 'demo-lib-refactor/1.1', status: 'skipped', title: '旧接口兼容层（跳过）', deps: [] },
      { key: 'demo-lib-refactor/1.2', status: 'suspended', title: '性能基准采集（挂起）', deps: [] },
      { key: 'demo-lib-refactor/1.3', status: 'rejected', title: '过时方案（否决）', deps: [] }
    ],

    /* task_records 时间线（verb: add/claim/submit/transition/auto-restore/auto-block） */
    records: {
      'dsh-forge-m2-pipeline/2.4': [
        { verb: 'add', at: '10-01 09:12', note: 'manual 边 ← 2.3' },
        { verb: 'claim', at: '10-04 14:02', note: 'dispatch digest d3f9…（会话 s-disp-1）' },
        { verb: 'claim', at: '10-04 15:40', note: '幂等重入·简报重合成 digest 77a0…（外环重派）' }
      ],
      'dsh-forge-m2-pipeline/2.5': [
        { verb: 'add', at: '10-02 11:20', note: 'manual 边 ← 2.4' },
        { verb: 'submit', at: '10-04 16:05', note: 'result=blocked · reason: 依赖 2.4 工具名形违规（gate ✗ lint）' },
        { verb: 'auto-block', at: '10-04 16:05', note: 'addTask --block-source 同事务置源 blocked（fix-1 创建）' }
      ],
      'dsh-forge-m2-pipeline/2.2': [
        { verb: 'add', at: '10-01 09:10', note: 'manual 边 ← 2.1' },
        { verb: 'claim', at: '10-02 10:00', note: 'digest a11b…（s-disp-1）' },
        { verb: 'submit', at: '10-02 12:31', note: 'gate ✓ compile/fmt/lint/test · commit 8c2f1e0（s-exec-1）' }
      ],
      'dsh-forge-m2-pipeline/fix-1': [
        { verb: 'add', at: '10-04 16:05', note: 'coding-fix · block-source 2.4' },
        { verb: 'claim', at: '10-04 16:20', note: 'digest e5c7…（s-disp-1）' }
      ]
    },

    /* 挂接：分型 link=派发(claim) / exec=执行(submit·records.session_id) */
    links: [
      { key: 'dsh-forge-m2-pipeline/2.4', session: 's-disp-1', kind: 'link' },
      { key: 'dsh-forge-m2-pipeline/2.4', session: 's-exec-2', kind: 'exec' },
      { key: 'dsh-forge-m2-pipeline/2.5', session: 's-disp-1', kind: 'link' },
      { key: 'dsh-forge-m2-pipeline/2.2', session: 's-disp-1', kind: 'link' },
      { key: 'dsh-forge-m2-pipeline/2.2', session: 's-exec-1', kind: 'exec' },
      { key: 'dsh-forge-m2-pipeline/fix-1', session: 's-disp-1', kind: 'link' }
    ],

    sessions: [
      { id: 's-disp-1', title: 'run-tasks 派发（M2 dogfood）', running: true },
      { id: 's-exec-1', title: 'executor · 2.2 动词 API', running: false },
      { id: 's-exec-2', title: 'executor · 2.4 tool 对接', running: true }
    ],

    /* 文档索引：发现面建行（proposals 五态 + features 相位 + 文档七类） */
    proposals: [
      { slug: 'dsh-forge-m2-pipeline', status: 'accepted', summary: 'forge 管线接管里程碑提案' },
      { slug: 'demo-ui-polish', status: 'under-review', summary: '界面打磨增强提案' }
    ],
    featureDocs: [
      {
        slug: 'dsh-forge-p1-mvp', status: 'completed', summary: '走线架 + 知识飞轮第一圈',
        docs: [
          { kind: 'proposal', rel: 'docs/proposals/dsh-forge-p1-mvp/proposal.md', missing: false, summary: '阶段提案' },
          { kind: 'prd-spec', rel: 'docs/features/dsh-forge-p1-mvp/prd/prd-spec.md', missing: false, summary: 'PRD 规格' },
          { kind: 'tech-design', rel: 'docs/features/dsh-forge-p1-mvp/design/tech-design.md', missing: false, summary: '五工件架构与契约面' },
          { kind: 'sql-schema', rel: 'docs/features/dsh-forge-p1-mvp/design/schema.sql', missing: true, summary: '中央库 schema（已并档·悬空演示）' }
        ]
      },
      {
        slug: 'demo-lib-refactor', status: 'tasks', summary: '库重构演示 feature',
        docs: [
          { kind: 'proposal', rel: 'docs/proposals/demo-lib-refactor/proposal.md', missing: false, summary: '重构提案' },
          { kind: 'prd-spec', rel: 'docs/features/demo-lib-refactor/prd/prd-spec.md', missing: false, summary: 'PRD' }
        ]
      }
    ],

    docs: {
      'docs/proposals/dsh-forge-m2-pipeline/proposal.md':
        '# Proposal: dsh-forge M2 —— forge 管线接管\n\n核心问题：P1 之后任务管线仍住在旧世界。M2 把任务域从「无」带到「转正」。\n\n## 交付面\n\n- core · forge 域转正（每工作区库 + 动词 API）\n- plugin-forge 插件入仓（tool + skills 执行链）\n- web 概览/文档页签 + SC6③ 挂接双侧\n- SC7 真闭环 + SC-M2 门 dogfood 走查\n\n> 只读渲染演示——正文 `Markdown` 经只读管线，frontmatter 不混入。',
      'docs/proposals/demo-ui-polish/proposal.md':
        '# Proposal: 界面打磨增强\n\nstatus: under-review（评审中演示条目）。\n\n- 空态插画统一\n- 骨架节奏调优',
      'docs/features/dsh-forge-p1-mvp/prd/prd-spec.md':
        '# PRD Spec —— P1 MVP\n\n## Background\n\n走线架 + 知识飞轮第一圈。\n\n## Goals\n\n- MVP 门两步全过\n- SC1 原生首屏 ≥15 断言\n\n```\nquantified: 是\n```',
      'docs/features/dsh-forge-p1-mvp/design/tech-design.md':
        '# Tech Design —— P1\n\n五工件架构：apps/{host,web} + packages/{contracts,core,knowledge}。\n\n- Interface 1: ProjectService（5 法）\n- Interface 2: KnowledgeService（7+1 法）\n- 样式纪律六条（令牌唯一）',
      'docs/proposals/dsh-forge-p1-mvp/proposal.md':
        '# Proposal: dsh-forge P1（MVP）\n\n按总纲敏捷重切直切 MVP：走线架先行、知识飞轮最早入场。',
      'docs/features/demo-lib-refactor/prd/prd-spec.md':
        '# PRD —— 库重构演示\n\n演示 feature 组的文档行与折叠交互。'
    }
  }
})()
