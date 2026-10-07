/* M3 原型种子数据：提案（五态 × 有/无 mode 溯源）+ feature（诊断三态）+ 五态机允许集 */
window.M3DATA = {
  proposals: [
    { slug: 'dsh-forge-m3.5-knowledge-consolidation', title: 'M3.5 知识沉淀', status: 'under-review', mode: 'expedition', author: 'faner', created: '2026-10-04', verdict: '', lineage: '—（首个自举走查对象）', abstract: '自举开发期召回有货 + 老项目冷启动提取', docs: [{ name: 'proposal.md', state: '评审中' }, { name: 'tech-research.md', state: '评审中' }] },
    { slug: 'ui-polish-round', title: 'UI 打磨轮', status: 'under-review', mode: 'blitz', author: 'faner', created: '2026-10-05', verdict: '', lineage: '—', abstract: '空态/加载态/错误态统一打磨', docs: [{ name: 'proposal.md', state: '评审中' }, { name: 'review-notes.md', state: '草稿' }] },
    { slug: 'worktree-domain', title: 'worktree 项目域', status: 'draft', mode: null, author: '（扫描吸收）', created: '2026-09-28', verdict: '', lineage: 'M2 范围对齐顺延项', abstract: '.git 判定器 / repo_root 分组 / 项目树两级', docs: [] },
    { slug: 'hero-seat-gating', title: 'hero 座位门控前置', status: 'accepted', mode: 'expedition', author: 'faner', created: '2026-10-01', verdict: '证据充分（S5 spike）', lineage: 'M3 预设基座 · 子项', abstract: 'ui-settings 行首启烘焙开启 chips', docs: [{ name: 'proposal.md', state: '已接受' }, { name: 'prd.md', state: '已接受' }, { name: 'spikes/s5-preset-base.md', state: '已接受' }] },
    { slug: 'legacy-eval-retire', title: '旧线 eval 退役', status: 'rejected', mode: 'blitz', author: 'faner', created: '2026-09-20', verdict: '仅迁幸存者（用户裁决）', lineage: '—', abstract: '完整 eval 体系不迁移', docs: [] },
    { slug: 'trace-matrix-m3', title: '追溯矩阵（M3 弹性项旧口径）', status: 'superseded', mode: 'expedition', author: 'faner', created: '2026-09-30', verdict: '定去向 M3.75', lineage: '被 M3.75 立项提案取代', abstract: 'feature↔文档↔任务↔记录谱系视图', docs: [] },
    /* 同名成链提案（feature/任务归属提案——同标识链；v22 模型澄清） */
    { slug: 'dsh-forge-m2-pipeline', title: 'M2 管线接管', status: 'accepted', mode: 'expedition', author: 'faner', created: '2026-09-25', verdict: 'M2 里程碑提案', lineage: '成链 → 同名 feature', abstract: '状态层转正 + 插件执行链 + 任务/文档视图', docs: [{ name: 'proposal.md', state: '已接受' }] },
    { slug: 'dsh-forge-p1-mvp', title: 'P1 MVP', status: 'accepted', mode: 'expedition', author: 'faner', created: '2026-08-30', verdict: 'P1 里程碑提案', lineage: '成链 → 同名 feature', abstract: '壳与桥接面 + 工作区注册 + dogfood 走查门', docs: [{ name: 'proposal.md', state: '已接受' }] },
    { slug: 'dsh-forge-m3-bootstrap-presets', title: 'M3 自举·模式预设', status: 'under-review', mode: 'expedition', author: 'faner', created: '2026-10-03', verdict: '', lineage: '本里程碑（评审中）', abstract: '双预设 + 拆包 + 技能迁移 + 提案管线消费', docs: [{ name: 'proposal.md', state: '评审中' }] }
  ],
  /* 五态机纯函数（人类面允许集；与服务端同源——沿 M2 Interface 10 语义） */
  allowed: {
    draft: ['under-review'],
    'under-review': ['accepted', 'rejected', 'draft'],
    accepted: ['superseded'],
    rejected: ['draft'],
    superseded: []
  },
  statusZh: { draft: '草稿', 'under-review': '评审中', accepted: '已接受', rejected: '已否决', superseded: '已取代' },
  statusOrder: { 'under-review': 0, draft: 1, accepted: 2, rejected: 3, superseded: 4 },
  modeZh: { expedition: '远征', blitz: '突击' },
  /* feature 阶段（M2 FEAT_LABEL 沿袭——feature 子 tab 状态过滤用；用户裁决 v8：相位→阶段） */
  featPhase: { 'dsh-forge-m2-pipeline': 'tasks', 'dsh-forge-p1-mvp': 'completed', 'dsh-forge-m3-bootstrap-presets': 'prd' },
  PHASE_ORDER: ['in-progress', 'prd', 'design', 'tasks', 'completed', 'archived'],
  PHASE_LABEL: { 'in-progress': '进行中', prd: '需求', design: '设计', tasks: '任务', completed: '已完成', archived: '已归档' },
  /* feature 文档（分层：中文分组名 + 真实目录 dir——文档行/消息显示相对于 feature 目录的真实路径；不含提案文档[M2 纪律]） */
  featDocs: {
    'dsh-forge-m2-pipeline': [
      { group: '需求文档', dir: 'prd', docs: [{ name: 'prd-spec.md', state: '已接受' }, { name: 'prd-user-stories.md', state: '已接受' }, { name: 'prd-ui-functions.md', state: '已接受' }] },
      { group: '设计文档', dir: 'design', docs: [{ name: 'tech-design.md', state: '已接受' }, { name: 'er-diagram.md', state: '已接受' }, { name: 'schema.sql', state: '已接受' }] },
      { group: 'UI 文档', dir: 'ui', docs: [{ name: 'ui-design.md', state: '已接受' }] }
    ],
    'dsh-forge-p1-mvp': [
      { group: '需求文档', dir: 'prd', docs: [{ name: 'prd-spec.md', state: '已接受' }] },
      { group: '设计文档', dir: 'design', docs: [{ name: 'tech-design.md', state: '已接受' }] }
    ],
    'dsh-forge-m3-bootstrap-presets': [
      { group: '需求文档', dir: 'prd', docs: [{ name: 'prd-spec.md', state: '已接受' }, { name: 'prd-user-stories.md', state: '已接受' }, { name: 'prd-ui-functions.md', state: '已接受' }] },
      { group: 'UI 文档', dir: 'ui', docs: [{ name: 'ui-design.md', state: '评审中' }] }
    ]
  },
  features: [
    { slug: 'dsh-forge-m2-pipeline', title: 'M2 管线接管', mode: 'expedition', proposal: 'dsh-forge-m2-pipeline', from: '成链自同名提案（proposal_id）', abstract: '状态层转正 + 插件执行链 + 任务/文档视图', docs: 7, diag: { state: 'idle' } },
    { slug: 'dsh-forge-p1-mvp', title: 'P1 MVP', mode: 'expedition', proposal: 'dsh-forge-p1-mvp', from: '成链自同名提案（proposal_id）', abstract: '壳与桥接面 + 工作区注册 + dogfood 走查门', docs: 2, diag: { state: 'idle', fail: { check: 'Liveness', detail: 'dsh-forge-p1-mvp/1.3 卡死子图（1.3 → 1.4 → 1.3），涉及 2 任务' } } },
    { slug: 'dsh-forge-m3-bootstrap-presets', title: 'M3 自举·模式预设', mode: 'expedition', proposal: 'dsh-forge-m3-bootstrap-presets', from: '成链自同名提案（proposal_id）', abstract: '双预设 + 拆包 + 技能迁移 + 提案管线消费（PRD 已批准）', docs: 4, diag: { state: 'idle' } }
  ],
  diagChecks: ['派生不变量', '依赖无环', 'Liveness', '记录链完整性', '拓扑可分层'],
  /* 任务子 tab 复刻（M2 全量结构：七态 + 三视图 + 挂接 + fix 链） */
  tasks: [
    { key: 'dsh-forge-m2-pipeline/2.1', status: 'completed', title: '状态机与动词 API', deps: [], type: 'coding.feature', priority: 'P0', created_at: '2026-09-28 09:00' },
    { key: 'dsh-forge-m2-pipeline/2.2', status: 'completed', title: 'dispatchPrompt 合成内聚', deps: ['dsh-forge-m2-pipeline/2.1'], type: 'coding.feature', priority: 'P0', created_at: '2026-09-29 10:12' },
    { key: 'dsh-forge-m2-pipeline/2.3', status: 'completed', title: '任务动词 tool 面', deps: ['dsh-forge-m2-pipeline/2.2'], type: 'coding.feature', priority: 'P0', created_at: '2026-09-30 08:40' },
    { key: 'dsh-forge-m2-pipeline/2.4', status: 'in_progress', title: '插件执行链接管（tool 半身对接）', deps: ['dsh-forge-m2-pipeline/2.3'], type: 'coding.feature', priority: 'P0', created_at: '2026-10-01 09:14' },
    { key: 'dsh-forge-m2-pipeline/2.5', status: 'blocked', title: '概览 tab 三视图接线', deps: ['dsh-forge-m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', created_at: '2026-10-02 11:30' },
    { key: 'dsh-forge-m2-pipeline/2.6', status: 'pending', title: '会话头挂接 pill', deps: ['dsh-forge-m2-pipeline/2.4'], type: 'coding.feature', priority: 'P1', created_at: '2026-10-02 14:02' },
    { key: 'dsh-forge-m2-pipeline/2.7', status: 'pending', title: '注册派生行升级', deps: ['dsh-forge-m2-pipeline/2.1'], type: 'coding.feature', priority: 'P2', created_at: '2026-10-03 09:20' },
    { key: 'dsh-forge-m2-pipeline/2.8', status: 'skipped', title: '对账卡 UI（用户裁决移出）', deps: [], type: 'coding.feature', priority: 'P2', created_at: '2026-09-27 16:44' },
    { key: 'dsh-forge-m2-pipeline/fix-1', status: 'completed', title: 'fix：2.5 三视图数据源悬空', deps: [], type: 'coding.fix', priority: 'P0', fix: true, source: 'dsh-forge-m2-pipeline/2.5', created_at: '2026-10-02 12:00' },
    { key: 'dsh-forge-p1-mvp/1.1', status: 'completed', title: '壳与桥接面', deps: [], type: 'coding.feature', priority: 'P0', created_at: '2026-08-20 09:00' },
    { key: 'dsh-forge-p1-mvp/1.2', status: 'completed', title: '工作区注册流', deps: ['dsh-forge-p1-mvp/1.1'], type: 'coding.feature', priority: 'P0', created_at: '2026-08-24 10:00' },
    { key: 'dsh-forge-p1-mvp/1.3', status: 'completed', title: '知识库面板', deps: ['dsh-forge-p1-mvp/1.2'], type: 'coding.feature', priority: 'P1', created_at: '2026-08-28 09:30' },
    { key: 'dsh-forge-p1-mvp/1.4', status: 'completed', title: 'dogfood 走查门', deps: ['dsh-forge-p1-mvp/1.3'], type: 'gate', priority: 'P0', created_at: '2026-09-02 15:00' },
    { key: 'dsh-forge-m3-bootstrap-presets/1.1', status: 'pending', title: '预设基座装配（宿主物化绝对路径）', deps: [], type: 'coding.feature', priority: 'P0', created_at: '2026-10-07 10:00' },
    { key: 'dsh-forge-m3-bootstrap-presets/1.2', status: 'pending', title: 'plugin-forge 拆包', deps: ['dsh-forge-m3-bootstrap-presets/1.1'], type: 'coding.feature', priority: 'P0', created_at: '2026-10-07 10:01' },
    { key: 'dsh-forge-m3-bootstrap-presets/1.3', status: 'pending', title: '技能迁移与状态层适配', deps: ['dsh-forge-m3-bootstrap-presets/1.2'], type: 'doc', priority: 'P0', created_at: '2026-10-07 10:02' },
    /* 突击提案直挂任务（blitz 无 feature 阶段——任务挂提案；任务子 tab 以提案为容器） */
    { key: 'legacy-eval-retire/1.1', status: 'completed', title: 'eval 幸存者裁剪清单', deps: [], type: 'doc', priority: 'P1', created_at: '2026-09-21 09:00' },
    { key: 'legacy-eval-retire/1.2', status: 'blocked', title: '旧线 eval 退役走查（用例集冲突）', deps: ['legacy-eval-retire/1.1'], type: 'coding.fix', priority: 'P0', created_at: '2026-09-22 14:30' }
  ],
  links: [
    { key: 'dsh-forge-m2-pipeline/2.4', session: '会话 · 派发链走查', kind: 'link' },
    { key: 'dsh-forge-m2-pipeline/2.4', session: 'executor 子会话', kind: 'exec' },
    { key: 'dsh-forge-m2-pipeline/2.5', session: '会话 · 派发链走查', kind: 'link' },
    { key: 'legacy-eval-retire/1.2', session: '会话 · 突击直达链', kind: 'link' }
  ],
  records: {
    'dsh-forge-m2-pipeline/2.4': [
      { verb: 'add', at: '10-01 09:14', note: '前置声明 ←2.3' },
      { verb: 'claim', at: '10-05 14:02', note: 'digest 77a0c1e8 · 派发⟞ 会话' },
      { verb: 'claim', at: '10-06 09:11', note: '幂等重入（executor 中断后外环重派）· digest 9f21b3c4' }
    ],
    'dsh-forge-m2-pipeline/2.5': [
      { verb: 'add', at: '10-02 11:30', note: '前置声明 ←2.4' },
      { verb: 'auto-block', at: '10-02 12:00', note: 'fix-1 创建（block-source 单事务）' }
    ],
    'ui-polish-round/1.2': [
      { verb: 'add', at: '10-06 14:30', note: '前置声明 ←1.1' },
      { verb: 'submit', at: '10-06 16:12', note: 'result=blocked：表单校验与错误态互斥逻辑冲突——待排查' }
    ],
    'legacy-eval-retire/1.2': [
      { verb: 'add', at: '09-22 14:30', note: '前置声明 ←1.1' },
      { verb: 'submit', at: '09-23 10:05', note: 'result=blocked：eval 用例集与幸存者裁剪清单冲突——待排查' }
    ]
  }
}
