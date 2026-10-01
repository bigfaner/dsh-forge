/* ==========================================================================
   dsh-forge 重构总纲原型 — 模拟数据层(data.js)
   分区与总纲数据模型对齐(单一归属,无投影):
     · dsh 侧(模拟 workspaceRegistry + 会话账本)——本体归 dsh,应用只持外键实时读;
     · 应用数据库 appDb —— 项目/任务/feature/提案状态 + 挂接元数据的唯一 SoT;
     · 知识文件 kn —— Markdown + frontmatter(id/摘要/关键词/状态/作者/时间),
       项目级 = 仓外独立目录随项目,全局 = 独立全局库;目录即域(≤3 层);
     · 状态层事件 —— 召回使用事件 + 显式反馈(采纳/忽略),热度与置信度信号源。
   置信度 = 读取时动态计算(审核/使用/近期性/反馈/衰减),不落盘。
   持久:sessionStorage(同标签页保留);重置还原种子。
   恢复迁移:按 seedVer —— 存量会话缺召回日志/种子版本落后 → 仅补挂 recallLogs 示例,不动其余状态。
   ========================================================================== */
(function () {
  'use strict';

  var listeners = [];
  var STORAGE_KEY = 'proto-dfr-db';
  var RECALL_SEED_VER = 2;     /* 召回日志种子版本:升级示例后 +1 → 存量会话自动补挂 */
  var simDays = 0;            /* 模拟时间偏移(天) —— 演示置信度衰减 */
  var seedFn;                 /* 种子构造器(重置用) */

  function now() { return Date.now() + simDays * 864e5; }
  function ago(days, hours) { return now() - days * 864e5 - (hours || 0) * 36e5; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pad(n) { return ('0' + n).slice(-2); }

  /* ───────────────────────── 种子数据 ───────────────────────── */

  seedFn = function () {
    var db = {

      /* ══ dsh 侧(模拟):workspaceRegistry 实体 + 会话账本(本体归 dsh) ══ */
      wsRegistry: {
        'ws-a1f3e9': { id: 'ws-a1f3e9', canonicalPath: 'Z:\\project\\dsh\\dsh-forge-v2' },
        'ws-b7c2d4': { id: 'ws-b7c2d4', canonicalPath: 'Z:\\project\\ai\\forge-plugin' },
        'ws-c9d8e1': { id: 'ws-c9d8e1', canonicalPath: 'Z:\\project\\dsh\\dsh-desktop' }
      },

      sessions: [
        /* p1 · dsh-forge-v2 */
        { id: 's1', ws: 'ws-a1f3e9', parentId: null, title: '置信度四信号实现口径', taskKey: 'p2-kernel/3', status: 'running', ts: ago(0, .1), msgs: [] },
        { id: 's1-1', ws: 'ws-a1f3e9', parentId: 's1', title: '衰减函数 spike', taskKey: 'p2-kernel/3', status: 'running', ts: ago(0, .3), msgs: [] },
        { id: 's2', ws: 'ws-a1f3e9', parentId: null, title: '召回能力面走查', taskKey: 'p2-kernel/2', status: 'ended', ts: ago(1), msgs: [] },
        { id: 's3', ws: 'ws-a1f3e9', parentId: null, title: '目录即域:层级演练', taskKey: null, status: 'ended', ts: ago(3), msgs: [] },
        { id: 's4', ws: 'ws-a1f3e9', parentId: null, title: 'hero 相位与首屏走查', taskKey: null, status: 'ended', ts: ago(6), msgs: [] },
        { id: 's5', ws: 'ws-a1f3e9', parentId: null, title: '旧分支遗产盘点(M4)', taskKey: null, status: 'ended', ts: ago(9), archived: true, msgs: [] },
        /* p2 · forge-plugin */
        { id: 'f1', ws: 'ws-b7c2d4', parentId: null, title: 'skills 半身迁移', taskKey: null, status: 'running', ts: ago(0, 4), msgs: [] },
        { id: 'f2', ws: 'ws-b7c2d4', parentId: null, title: 'eval-* 裁剪核对', taskKey: null, status: 'ended', ts: ago(2), msgs: [] },
        /* p3 · dsh-desktop(归档项目,会话不挂) */
        { id: 'd1', ws: 'ws-c9d8e1', parentId: null, title: '打包巡检(遗产)', taskKey: null, status: 'ended', ts: ago(30), msgs: [] }
      ],

      /* ══ 应用数据库:项目(唯一 SoT;持 workspaceId 外键,无会话副本) ══ */
      projects: [
        { id: 'p1', name: 'dsh-forge', workspaceId: 'ws-a1f3e9', canonicalPath: 'Z:\\project\\dsh\\dsh-forge-v2',
          docMode: 'repo', forgeDir: 'Z:\\project\\dsh\\dsh-forge-v2\\.forge', knowledgeDir: 'Z:\\knowledge\\dsh-forge', defaultRecallDomain: '产品',   /* p1 = 仓外知识目录改写示例 */
          archived: false, expanded: true },
        { id: 'p2', name: 'forge-plugin', workspaceId: 'ws-b7c2d4', canonicalPath: 'Z:\\project\\ai\\forge-plugin',
          docMode: 'repo', forgeDir: 'Z:\\project\\ai\\forge-plugin\\.forge', knowledgeDir: 'Z:\\project\\ai\\forge-plugin\\.knowledge', defaultRecallDomain: '编程',
          archived: false, expanded: false },
        { id: 'p3', name: 'dsh-desktop', workspaceId: 'ws-c9d8e1', canonicalPath: 'Z:\\project\\dsh\\dsh-desktop',
          docMode: 'repo', forgeDir: 'Z:\\project\\dsh\\dsh-desktop\\.forge', knowledgeDir: '—', defaultRecallDomain: null,
          archived: true, archivedAt: '2026-09-19', expanded: false }
      ],

      /* 对账演示状态(p1):ok=对齐 / moved=模拟目录整体移动后失配 */
      alignDemo: { state: 'ok' },

      /* 任务/feature/提案状态(应用数据库直读;经 forge 插件 tool 半身写入) */
      features: [
        { slug: 'p2-kernel', project: 'p1', status: 'design', label: '知识内核', done: 1, total: 9 },
        { slug: 'p1-shell', project: 'p1', status: 'prd', label: '壳与内核', done: 0, total: 12 },
        { slug: 'dsh-forge-m4', project: 'p1', status: 'completed', label: '旧分支遗产·只读', done: 53, total: 53 },
        { slug: 'plugin-scaffold', project: 'p2', status: 'tasks', label: '插件骨架', done: 3, total: 8 }
      ],
      tasks: {
        'p2-kernel/1': { key: 'p2-kernel/1', project: 'p1', feature: 'p2-kernel', title: '契约先行:frontmatter schema 定稿', status: 'completed', sessions: ['s2'], deps: [] },
        'p2-kernel/2': { key: 'p2-kernel/2', project: 'p1', feature: 'p2-kernel', title: '宿主召回能力面(四动词+域过滤)', status: 'in_progress', sessions: ['s2'], deps: ['p2-kernel/1'] },
        'p2-kernel/3': { key: 'p2-kernel/3', project: 'p1', feature: 'p2-kernel', title: '置信度四信号(读取时计算)', status: 'in_progress', sessions: ['s1', 's1-1'], deps: ['p2-kernel/1'] },
        'p2-kernel/4': { key: 'p2-kernel/4', project: 'p1', feature: 'p2-kernel', title: '审核工作台(待审+合并队列)', status: 'pending', sessions: [], deps: ['p2-kernel/2', 'p2-kernel/3'] },
        'p2-kernel/5': { key: 'p2-kernel/5', project: 'p1', feature: 'p2-kernel', title: '晋升流与项目侧重定向', status: 'pending', sessions: [], deps: ['p2-kernel/4'] },
        'p2-kernel/6': { key: 'p2-kernel/6', project: 'p1', feature: 'p2-kernel', title: 'DSM:稳定 ID 与移动=换域', status: 'blocked', sessions: [], deps: ['p2-kernel/2'] },
        'p2-kernel/7': { key: 'p2-kernel/7', project: 'p1', feature: 'p2-kernel', title: '写入 tool 契约校验', status: 'pending', sessions: [], deps: ['p2-kernel/1'] },
        'p2-kernel/8': { key: 'p2-kernel/8', project: 'p1', feature: 'p2-kernel', title: '系统提示词知识段', status: 'pending', sessions: [], deps: ['p2-kernel/2', 'p2-kernel/7'] },
        'p2-kernel/9': { key: 'p2-kernel/9', project: 'p1', feature: 'p2-kernel', title: '召回链路 e2e 断言', status: 'pending', sessions: [], deps: ['p2-kernel/4', 'p2-kernel/5', 'p2-kernel/8'] },
        'p1-shell/1': { key: 'p1-shell/1', project: 'p1', feature: 'p1-shell', title: '薄宿主 spike:runProfile 直跑', status: 'pending', sessions: [], deps: [] },
        'p1-shell/2': { key: 'p1-shell/2', project: 'p1', feature: 'p1-shell', title: 'vite 入口 + 壳内核接入', status: 'pending', sessions: [], deps: ['p1-shell/1'] },
        'p1-shell/3': { key: 'p1-shell/3', project: 'p1', feature: 'p1-shell', title: '原生三区工作台布局落地', status: 'in_progress', sessions: ['s3'], deps: ['p1-shell/2'] }
      },
      proposals: [
        { slug: 'dsh-forge-redesign', project: 'p1', status: 'Accepted', files: ['proposal.md'] },
        { slug: 'dsh-forge-p1-shell-kernel', project: 'p1', status: 'Draft', files: ['proposal.md'] },
        { slug: 'dsh-forge-p2-kernel', project: 'p1', status: 'Draft', files: ['proposal.md'] }
      ],
      /* 仓内文档内容(只读渲染;应用零写入) */
      docs: {
        'proposals/dsh-forge-redesign/proposal.md': '# Proposal: dsh-forge 重构总纲\n以知识资产为核心的研发工作台(AI Coding 场景切入,零代码分支重开)。\n\n## Problem\nM1–M4 迁移产出未达预期:工作台 UI 与上游 dsh 会话体验割裂;「文件 SoT + SQLite 投影」双层架构复杂度反噬;产品职责边界从未划清。\n\n## Proposed Solution\n从零设计薄状态层产品:结构化状态 + 只读引用 + 会话编排入口 + 知识资产全链路。场景分层:场景无关内核 + AI Coding 场景包。\n\n## 数据模型(单一归属,无投影)\n任务清单/执行记录 → 应用运行时存储;任务/feature/提案状态 → 应用数据库;proposal/PRD/design → 默认仓内;项目级知识 → 仓外独立目录;全局知识 → 独立全局库;测试资产 → 代码仓内。',
        'proposals/dsh-forge-p1-shell-kernel/proposal.md': '# P1 · 壳与内核\n自有产品壳:薄宿主(去 vendor)+ vite 入口 + dsh-client-web 壳内核 + boot manifest 掌舵 + 原生三区工作台(M4 原型 v2.12 基线,槽位路线 A)+ 项目↔工作区映射(外键+对账)+ 会话主链路。\n\n(草案占位 — 原型只读渲染示意)',
        'proposals/dsh-forge-p2-kernel/proposal.md': '# P2 · 知识内核\n知识资产全链路:目录即域(≤3 层)、frontmatter 卡片/详情/热度、DSM 轻量版、抽取(双路触发+去重队列)、动态置信度(四信号)、召回能力面(分层动词+可解释+反馈+预算+可重放)、晋升流。\n\n(草案占位 — 原型只读渲染示意)',
        'features/p2-kernel/manifest.md': '# p2-kernel · manifest\nstatus: design · 2/9\n\n阶段:prd → design → tasks → in-progress → completed。',
        'features/p2-kernel/prd/prd-spec.md': '# p2-kernel PRD(占位)\n知识内核产品需求:两面板、审核台、抽取、置信度、召回、晋升。',
        'features/p1-shell/manifest.md': '# p1-shell · manifest\nstatus: prd · 0/12'
      },

      /* ══ 知识文件(Markdown + frontmatter;目录即域,≤3 层) ══
         scope: project(随项目仓外目录)| global(独立全局库)
         status: pending(未审核)/ approved(审核通过)/ rejected(拒绝) */
      kn: [
        /* —— 项目级(p1:dsh-forge)—— */
        { id: 'kn-101', scope: 'project', project: 'p1', path: '产品/定位/知识飞轮.md',
          title: '知识资产复利飞轮', abstract: '核心卖点口径:抽取 → 置信度筛选 → 域过滤召回 → 复用再沉淀的闭环;产品占「AI Coding 研发流程的知识资产层」交叉位。',
          keywords: ['定位', '飞轮', '差异化'], status: 'approved', author: 'faner',
          created: ago(14), modified: ago(4), body: '## 飞环\n\n1. **抽取**:用户主动 / agent 自动,从会话沉淀知识;\n2. **置信度筛选**:四信号动态计算,未审核中等、闲置衰减;\n3. **域过滤召回**:目录路径前缀 + 关键词细分 + 置信阈值;\n4. **复用再沉淀**:agent 采纳反馈回流置信度,新经验再抽取。\n\n对照 Linear 管协作不管经验资产、AI 客户端管会话不管沉淀 —— 本产品占交叉位。' },
        { id: 'kn-102', scope: 'project', project: 'p1', path: '产品/边界/只读纪律.md',
          title: '薄状态层与只读边界', abstract: '应用只做结构化状态 + 只读引用 + 会话编排入口 + 知识全链路;代码仓与文档位置零写入;知识目录经宿主能力面写入。',
          keywords: ['边界', '只读', 'SoT'], status: 'approved', author: 'faner',
          created: ago(14), modified: ago(7), body: '## 写入边界\n\n- 代码仓与文档位置(PRD/设计/测试资产):**只读** —— 渲染展示、路径跳转;\n- 知识目录例外:经宿主能力面(UI 管理面 / 知识插件写入 tool)写入;\n- 不做上下文注入:知识使用由 agent 自行决定。' },
        { id: 'kn-103', scope: 'project', project: 'p1', path: '产品/场景/场景分层.md',
          title: '场景分层:内核 + 场景包', abstract: '场景无关内核(知识全链路 + 状态层 + 宿主能力面)与 AI Coding 场景包(forge 插件 = 管线技能 + 命令 tool);换场景 = 换包不动内核。',
          keywords: ['分层', '插件', '内核', '场景'], status: 'approved', author: 'agent:s2',
          created: ago(12), modified: ago(6), body: '## 版图\n\n- **内核** = 宿主(能力面/状态层/UI)+ 知识插件(内核绑定,随产品交付);\n- **场景包** = forge 插件(SDD 管线技能 + 命令 tool,独立迭代);\n- 任务状态层存储与 API 归内核,场景语义(状态机词汇/管线动词)由场景包定义消费。' },
        { id: 'kn-104', scope: 'project', project: 'p1', path: '架构/数据模型/单一归属.md',
          title: '单一归属,无投影', abstract: '每类资产有且仅有一个 SoT;任务/状态入应用数据库,文档默认仓内,知识两级目录;禁运行时投影/快照/回流。',
          keywords: ['SoT', '投影', '数据模型', '归属'], status: 'approved', author: 'faner',
          created: ago(15), modified: ago(2), body: '## 划界原则\n\n以「生命周期 / 复用域 / 写者」为轴一次划清:\n\n| 资产 | 归属 |\n|---|---|\n| 任务清单/执行记录 | 应用运行时存储 |\n| 状态/挂接/视图 | 应用数据库 |\n| proposal/PRD/design | 默认仓内 |\n| 项目级知识 | 仓外目录(随项目) |\n| 全局知识 | 独立全局库 |\n\nSC2 断言:新分支不存在 watch/回流模块;状态全部数据库直读。' },
        { id: 'kn-105', scope: 'project', project: 'p1', path: '架构/数据模型/工作区外键对账.md',
          title: '项目 ↔ 工作区:外键 + 对账', abstract: '项目记录持 workspaceId 外键,join key = canonical path;会话列表实时读 dsh API 零副本;失配按 path 找回或幂等重建。',
          keywords: ['对账', '外键', 'workspace'], status: 'pending', author: 'agent:s1-1', srcSession: 's1-1',
          created: ago(1), modified: ago(1), body: '## 机制\n\n1. 注册 = 先 dsh(create 幂等)后自家:projects 表只存 workspace_id + 扩展字段;\n2. 启动对账:registry.get(id).path === project.canonical_path,失配按 path 在 list() 找回;\n3. 会话列表渲染时直问本体,零缓存零副本;\n4. 写权在 dsh:应用不写账本。\n\n与 M4 投影的本质区别:概念只剩「外键 + 对账」。' },
        { id: 'kn-106', scope: 'project', project: 'p1', path: '架构/知识内核/置信度四信号.md',
          title: '置信度四信号', abstract: '置信度读取时动态合成:审核状态 + 使用记录 + 显式反馈 + 时间衰减;不落盘,杜绝存储值与信号漂移;低置信降权或不召回。',
          keywords: ['置信度', '信号', '衰减', '阈值'], status: 'approved', author: 'faner',
          created: ago(10), modified: ago(1), body: '## 四信号\n\n1. **审核状态**:frontmatter status;通过 +、拒绝 −;\n2. **使用记录**:召回次数 + 近期性加权;\n3. **显式反馈**:agent 采纳 + / 忽略 −(比隐式计数更强的自演化信号);\n4. **时间衰减**:未审核且长期闲置递减。\n\n读取时计算,存储中无置信度字段(SC9 断言)。' },
        { id: 'kn-107', scope: 'project', project: 'p1', path: '架构/知识内核/召回动词集.md',
          title: '召回分层阅读动词集', abstract: '召回 tool 动词集保持极小且可学习:browse(域树)/ search(域+关键词)/ read-abstract(摘要)/ read-full(正文);默认返回摘要守 token 纪律。',
          keywords: ['动词', '召回', 'token', '预算'], status: 'pending', author: 'agent:s2', srcSession: 's2',
          created: ago(2), modified: ago(2), body: '## 动词\n\n- `browse` —— 域树/列表;\n- `search` —— 域 + 关键词检索,附命中理由;\n- `read-abstract` —— 摘要;\n- `read-full` —— 正文(按需)。\n\n召回结果附命中理由(域路径 + 命中关键词 + 置信度构成);注入遵守 token 预算。' },
        { id: 'kn-108', scope: 'project', project: 'p1', path: '工程/上游适配/版本锁定.md',
          title: 'dsh 0.1.x 版本锁定策略', abstract: '上游 rc 快速演进期:npm 依赖版本精确锁定 + 显式适配任务;升级须过会话主链路 e2e 才可 bump。',
          keywords: ['上游', '版本', '适配', 'dsh'], status: 'approved', author: 'faner',
          created: ago(11), modified: ago(5), body: '## 纪律\n\n- 版本精确锁定(package.json 不用 ^/~);\n- 每次升级 = 显式适配任务,过 SC6 会话主链路 e2e;\n- 中区会话组件适配分叉为中级风险,锁版本是对冲。' },
        { id: 'kn-110', scope: 'project', project: 'p1', path: '工程/上游适配/槽位路线A.md',
          title: 'sidebar 槽位替换路线 A', abstract: '保留官方 sidebar 壳,自有插件替换 sidebar.workspaces 占用者;清单级增删不碰前端构建;壳的折叠/导航/快捷键白拿。',
          keywords: ['槽位', 'sidebar', '复用'], status: 'approved', author: 'agent:s3', srcSession: 's3',
          created: ago(8), modified: ago(8), body: '## 路线\n\n- **A(默认)**:保留官方壳,替换 `sidebar.workspaces` 占用者 —— 自有项目树/知识面板;\n- B:整壳替换 `sidebar` 槽位 —— 须复刻槽位契约,漂移风险自担。\n\n无论 A/B 均为 boot manifest 清单级增删。' },
        { id: 'kn-109', scope: 'project', project: 'p1', path: '共享/相对时间规范.md',
          title: '相对时间显示规范', abstract: '列表时间用相对时间(刚刚/N分钟/N小时/N天),超 7 天显示日期;排序一律用时间戳不用显示文案。',
          keywords: ['时间', '显示', '规范'], status: 'approved', author: 'faner',
          created: ago(120), modified: ago(96), body: '## 规范\n\n- <1min 刚刚;<1h N分钟;<24h N小时;<7d N天;更早显示日期;\n- 排序与比较一律走时间戳。' },
        { id: 'kn-118', scope: 'project', project: 'p1', path: '架构/知识内核/置信度计算口径.md',
          title: '置信度计算口径(抽取稿)', abstract: '新知识初始置信中等;采纳反馈每次 +、忽略每次 −;闲置超阈值按日衰减 —— 抽取自会话 s1,待与《置信度四信号》合并审阅。',
          keywords: ['置信度', '衰减', '反馈'], status: 'pending', author: 'agent:s1', srcSession: 's1',
          created: ago(0, 2), modified: ago(0, 2), body: '## 口径(会话 s1 沉淀)\n\n- 初始 0.45(未审核 = 中等);\n- 人工审核通过 +0.18;\n- 使用次数对数加权,封顶;\n- 采纳 +0.04/次,忽略 −0.06/次(封顶 ±0.10);\n- 闲置 >14 天按日线性衰减。\n\n> 与既有《置信度四信号》条目高度近似,进入合并审核队列。' },
        /* 晋升重定向记录(项目侧;目标在全局库) */
        { id: 'kn-097', scope: 'project', project: 'p1', path: '专家/流程/变更须走显式提案.md', redirect: true, targetId: 'g-097',
          title: '变更须走显式提案(已晋升)', modified: ago(16) },

        /* —— 全局库(独立全局知识库,多项目共享)—— */
        { id: 'g-201', scope: 'global', project: null, path: '编程/前端/安全/XSS输出转义.md',
          title: 'XSS 输出转义约束', abstract: '所有模板输出必须经上下文转义;Vue 用 {{}} 默认转义、禁 v-html;DOM 注入用 textContent;富文本走白名单 sanitizer。',
          keywords: ['xss', '转义', 'vue', '安全'], status: 'approved', author: 'faner',
          created: ago(90), modified: ago(3), body: '## 约束\n\n- 模板输出:上下文感知转义(HTML/attr/JS/URL 各别);\n- Vue:`{{ }}` 安全,`v-html` 禁用(评审必拦);\n- DOM API:`textContent` 注入,不拼 HTML 字符串;\n- 富文本:服务端白名单 sanitizer,不允许前端自行 filter。' },
        { id: 'g-202', scope: 'global', project: null, path: '编程/前端/性能/首屏基线.md',
          title: '首屏与交互性能基线', abstract: '状态/看板数据首屏 ≤2s @500 任务(数据库直读,无文件扫描);交互反馈 100ms 内;长列表虚拟化阈值 200 行。',
          keywords: ['性能', '首屏', '基线'], status: 'approved', author: 'faner',
          created: ago(80), modified: ago(20), body: '## 基线\n\n- 看板首屏 ≤2s @500 任务(状态直读);\n- 交互反馈 ≤100ms(乐观更新 + 回滚);\n- 列表 >200 行虚拟化。' },
        { id: 'g-203', scope: 'global', project: null, path: '编程/go/并发/errgroup惯用法.md',
          title: 'errgroup 并发惯用法', abstract: '并发任务用 errgroup.Group + SetLimit 控并发;ctx 超时穿透;先启动后收集,错误短路;禁止裸 sync.WaitGroup + 手工 error 收集。',
          keywords: ['go', 'errgroup', '并发'], status: 'approved', author: 'agent:f1', srcSession: 'f1',
          created: ago(60), modified: ago(12), body: '## 惯用法\n\n```go\ng, ctx := errgroup.WithContext(ctx)\ng.SetLimit(4)\nfor _, t := range tasks {\n  t := t\n  g.Go(func() error { return run(ctx, t) })\n}\nerr := g.Wait()\n```\n\nctx 取消即短路;错误只保留第一个。' },
        { id: 'g-205', scope: 'global', project: null, path: '专家/提案写作/六段式结构.md',
          title: '提案六段式结构', abstract: '提案六段:Problem/Evidence/Solution/Scope/Risks/SC;SC 须可机械判定;宪法级约束显式标注「须显式提案推翻」。',
          keywords: ['提案', '结构', 'SC'], status: 'approved', author: 'faner',
          created: ago(70), modified: ago(9), body: '## 六段\n\n1. Problem(一句话根因);\n2. Evidence(教训/证据编号);\n3. Solution(方案与宪法级约束);\n4. Scope(产品线边界);\n5. Risks(矩阵);\n6. Success Criteria(可机械判定)。' },
        { id: 'g-206', scope: 'global', project: null, path: '通用/写作/术语表纪律.md',
          title: '术语表纪律', abstract: '全文同一概念只用一个术语(SoT = 单一事实源,不混用「主数据」);新增术语先进术语表再入文。',
          keywords: ['术语', '写作'], status: 'approved', author: 'faner',
          created: ago(65), modified: ago(40), body: '## 纪律\n\n- 一概念一术语;引入前查表;\n- 缩写首次出现给全称;' },
        { id: 'g-207', scope: 'global', project: null, path: '通用/协作/评审反馈三档.md',
          title: '评审反馈三档', abstract: '评审反馈分三档:必须修改(阻断)/ 建议(记录)/ 赞赏(强化);反馈指向断言或行号便于闭环。',
          keywords: ['评审', '反馈'], status: 'approved', author: 'agent:s4', srcSession: 's4',
          created: ago(55), modified: ago(33), body: '## 三档\n\n1. **必须修改** —— 阻断合入;\n2. **建议** —— 记录不阻断;\n3. **赞赏** —— 强化好实践。\n\n反馈一律指向断言编号/行号。' },
        { id: 'g-097', scope: 'global', project: null, path: '专家/流程/变更须走显式提案.md', promotedFrom: 'p1',
          title: '变更须走显式提案', abstract: '宪法级约束(定位/边界/路书)的修改须显式提案推翻;不得在阶段提案内隐性放宽或绕开。',
          keywords: ['流程', '提案', '约束'], status: 'approved', author: 'faner',
          created: ago(30), modified: ago(16), body: '## 纪律\n\n- 总纲的宪法级约束:修改须显式提案推翻;\n- 阶段提案可细化不可弱化;\n- 任何加码(如突破只读边界)须新提案显式推翻既有纪律。' }
      ],

      /* 合并审核队列(抽取去重 + 晋升冲突共用) */
      mergeQueue: [
        { id: 'mq-1', aId: 'kn-118', bId: 'kn-106', origin: 'extract-dedup',
          reason: '关键词重叠 3(置信度/衰减/反馈)· 标题 n-gram 近似 0.58' }
      ],

      /* 状态层事件流:召回使用 + 显式反馈(热度与置信度信号源;SC10 事件表) */
      events: []
    };

    /* 使用事件种子(热度按条数落;ts 决定近期性/衰减) */
    var seedEvents = [
      ['kn-104', 'search', 0.2], ['kn-104', 'read-full', 0.5], ['kn-104', 'search', 1], ['kn-104', 'search', 2],
      ['kn-104', 'read-abstract', 3], ['kn-104', 'search', 5], ['kn-104', 'search', 8], ['kn-104', 'search', 12],
      ['kn-104', 'read-full', 16], ['kn-104', 'search', 21], ['kn-104', 'search', 27], ['kn-104', 'search', 34],
      ['kn-104', 'search', 40], ['kn-104', 'read-full', 47], ['kn-104', 'search', 55], ['kn-104', 'search', 62],
      ['kn-104', 'search', 70], ['kn-104', 'feedback-adopted', 2], ['kn-104', 'feedback-adopted', 34],
      ['kn-101', 'search', 0.3], ['kn-101', 'search', 2], ['kn-101', 'read-abstract', 6], ['kn-101', 'search', 11],
      ['kn-101', 'search', 18], ['kn-101', 'search', 26], ['kn-101', 'read-full', 33], ['kn-101', 'search', 44],
      ['kn-101', 'search', 55], ['kn-101', 'search', 62], ['kn-101', 'search', 69], ['kn-101', 'search', 76],
      ['kn-101', 'search', 83],
      ['kn-102', 'search', 1], ['kn-102', 'read-abstract', 4], ['kn-102', 'search', 9], ['kn-102', 'search', 22],
      ['kn-102', 'search', 36], ['kn-102', 'search', 50], ['kn-102', 'search', 58], ['kn-102', 'read-full', 64],
      ['kn-103', 'search', 3], ['kn-103', 'read-abstract', 10], ['kn-103', 'search', 24], ['kn-103', 'search', 45],
      ['kn-103', 'search', 60],
      ['kn-105', 'search', 0.1],
      ['kn-106', 'search', 0.4], ['kn-106', 'read-full', 1], ['kn-106', 'search', 3], ['kn-106', 'search', 7],
      ['kn-106', 'read-abstract', 13], ['kn-106', 'search', 20], ['kn-106', 'search', 29], ['kn-106', 'search', 38],
      ['kn-106', 'feedback-adopted', 5], ['kn-106', 'feedback-adopted', 29],
      ['kn-107', 'search', 1], ['kn-107', 'read-abstract', 2], ['kn-107', 'feedback-ignored', 2],
      ['kn-108', 'search', 5], ['kn-108', 'search', 19], ['kn-108', 'read-abstract', 35], ['kn-108', 'search', 51],
      ['kn-110', 'search', 8], ['kn-110', 'read-abstract', 17], ['kn-110', 'search', 39],
      ['kn-109', 'search', 96],
      ['kn-118', 'search', 0.1],
      ['g-201', 'search', 0.6], ['g-201', 'read-full', 2], ['g-201', 'search', 4], ['g-201', 'search', 10],
      ['g-201', 'search', 15], ['g-201', 'read-abstract', 25], ['g-201', 'search', 37], ['g-201', 'search', 49],
      ['g-201', 'search', 58], ['g-201', 'feedback-adopted', 10], ['g-201', 'feedback-adopted', 37], ['g-201', 'feedback-adopted', 58],
      ['g-202', 'search', 6], ['g-202', 'search', 23], ['g-202', 'read-abstract', 41],
      ['g-203', 'search', 12], ['g-203', 'read-full', 28], ['g-203', 'search', 44],
      ['g-205', 'search', 9], ['g-205', 'search', 26], ['g-205', 'read-full', 42],
      ['g-206', 'search', 40],
      ['g-207', 'search', 33],
      ['g-097', 'search', 16], ['g-097', 'read-abstract', 24], ['g-097', 'search', 45]
    ];
    db.events = seedEvents.map(function (e, i) {
      /* 事件带 sessionId:会话↔知识关联(状态层;知识召回 tab 与面板会话下钻的数据源) */
      var pool = e[0].charAt(0) === 'g' ? ['s1', 'f1', 's2', 's4'] : ['s1', 's2', 's1', 's1-1', 's3'];
      return { id: 'ev-' + (i + 1), knId: e[0], verb: e[1], ts: ago(e[2]), sessionId: pool[i % pool.length] };
    });

    /* 会话 s1 预置消息(知识召回链路罐头演示) */
    var s1 = db.sessions[0];
    s1.msgs = [
      { role: 'user', ts: ago(0, .6), text: '为 P2 置信度四信号写实现口径。先召回相关约束,再给方案。' },
      { role: 'tool', ts: ago(0, .55), running: false, tool: {
          name: 'knowledge.search', args: '{ domain: "架构/知识内核", keywords: ["置信度", "信号", "衰减"] }',
          summary: '2 条命中 · 已记使用事件',
          hits: ['kn-106', 'kn-107'], open: true } },
      { role: 'tool', ts: ago(0, .5), running: false, tool: {
          name: 'knowledge.read-full', args: '{ id: "kn-106" }',
          summary: '正文 312 tok · 已记使用事件' } },
      { role: 'assistant', ts: ago(0, .4), text: '按召回的《置信度四信号》(置信 0.92,已采纳)与《召回分层阅读动词集》(0.58):\n\n1. 置信度读取时动态合成 —— 审核状态 / 使用记录 / 显式反馈 / 时间衰减四信号,不落盘;\n2. 召回侧只消费置信度做阈值过滤,排序与置信解耦;\n3. 每次召回记使用事件 → 热度与近期性信号闭环。\n\n下面落一条抽取稿进知识库(未审核,中等置信)。' },
      { role: 'tool', ts: ago(0, .35), running: false, tool: {
          name: 'knowledge.extract', args: '{ from: "s1", title: "置信度计算口径", domain: "架构/知识内核" }',
          summary: 'kn-118 已落库(pending)· 检出近似重复 → 合并审核队列' } }
    ];
    var s2 = db.sessions[2];
    s2.msgs = [
      { role: 'user', ts: ago(1, 1), text: '走查召回能力面:域过滤、命中理由、预算截断。' },
      { role: 'assistant', ts: ago(1), text: '走查通过:前端域查询不返回后端域知识(目录前缀过滤);命中理由含域路径/关键词/置信度构成;超预算条目降载。' }
    ];

    /* —— 召回日志:知识召回轨迹(非 dsh 会话日志)——
       每条 trace = 一次召回调用,由 dsh-forge 内核在召回执行时记录(提案口径);
       以下为手写示例种子;运行期由 recall.search/read-abstract/read-full/browse 即时记录,随状态层持久化。 */
    var TRACE_EXAMPLES = [
      /* 今日:读链(检索 → 读摘要 → 读正文)+ 反馈挂接 */
      { verb: 'search', ts: ago(0, 3), projectId: 'p1', sessionId: 's1',
        args: { domain: '产品/定位', keywords: ['定位', '飞轮'], threshold: 0.35, budget: 2000 },
        hits: ['kn-101'], hitCount: 1, below: 0, latencyMs: 58, tokens: 176, status: 'ok' },
      { verb: 'search', ts: ago(0, 2.1), projectId: 'p1', sessionId: 's1',
        args: { domain: '架构/知识内核', keywords: ['置信度', '衰减'], threshold: 0.35, budget: 2000 },
        hits: ['kn-106', 'kn-107', 'kn-118'], hitCount: 3, below: 1, latencyMs: 86, tokens: 512, status: 'ok' },
      { verb: 'read-abstract', ts: ago(0, 2.0), projectId: 'p1', sessionId: 's1',
        args: { id: 'kn-107' }, hits: ['kn-107'], hitCount: 1, below: 0, latencyMs: 9, tokens: 96, status: 'ok' },
      { verb: 'read-full', ts: ago(0, 1.9), projectId: 'p1', sessionId: 's1',
        args: { id: 'kn-106' }, hits: ['kn-106'], hitCount: 1, below: 0, latencyMs: 21, tokens: 312, status: 'ok',
        feedback: { knId: 'kn-106', kind: 'adopted', ts: ago(0, 1.5) } },
      /* p2 插件项目:召回全局库知识 + 采纳反馈 */
      { verb: 'search', ts: ago(0, 5), projectId: 'p2', sessionId: 'f1',
        args: { domain: '编程', keywords: ['并发', 'errgroup'], threshold: 0.4, budget: 1500 },
        hits: ['g-203'], hitCount: 1, below: 0, latencyMs: 64, tokens: 208, status: 'ok',
        feedback: { knId: 'g-203', kind: 'adopted', ts: ago(0, 4.6) } },
      { verb: 'read-full', ts: ago(0, 4.8), projectId: 'p2', sessionId: 'f1',
        args: { id: 'g-203' }, hits: ['g-203'], hitCount: 1, below: 0, latencyMs: 18, tokens: 460, status: 'ok' },
      /* 预算截断 + 高延迟示例(小预算 800,5 命中截 3) */
      { verb: 'search', ts: ago(2, 3), projectId: 'p1', sessionId: 's2',
        args: { domain: null, keywords: ['架构'], threshold: 0.35, budget: 800 },
        hits: ['kn-104', 'kn-105', 'kn-106', 'kn-107', 'kn-110'], hitCount: 5, below: 0, truncated: 3,
        latencyMs: 1240, tokens: 800, status: 'ok' },
      /* 空结果成因一:关键词/域无匹配 */
      { verb: 'search', ts: ago(3, 1), projectId: 'p1', sessionId: 's3',
        args: { domain: '产品', keywords: ['向量检索', 'embedding'], threshold: 0.35, budget: 2000 },
        hits: [], hitCount: 0, below: 0, latencyMs: 41, tokens: 0, status: 'empty' },
      /* 空结果成因二:有匹配但全部低于置信阈值 */
      { verb: 'search', ts: ago(4, 6), projectId: 'p1', sessionId: 's4',
        args: { domain: '工程', keywords: ['版本'], threshold: 0.6, budget: 2000 },
        hits: [], hitCount: 0, below: 2, latencyMs: 37, tokens: 0, status: 'empty' },
      /* 浏览域:p2 前端域 / p1 全域(后者无会话记录 = 面板/API 触发) */
      { verb: 'browse', ts: ago(1, 7), projectId: 'p2', sessionId: 'f2',
        args: { domain: '编程/前端' }, hits: [], hitCount: 3, below: 0, latencyMs: 11, tokens: 0, status: 'ok' },
      { verb: 'browse', ts: ago(2, 8), projectId: 'p1', sessionId: null,
        args: { domain: null }, hits: [], hitCount: 12, below: 0, latencyMs: 8, tokens: 0, status: 'ok' },
      /* p3 无自有知识:召回池 = 全局库,仍可命中 */
      { verb: 'search', ts: ago(5, 2), projectId: 'p3', sessionId: 'd1',
        args: { domain: null, keywords: ['术语'], threshold: 0.35, budget: 2000 },
        hits: ['g-206'], hitCount: 1, below: 0, latencyMs: 55, tokens: 160, status: 'ok' },
      /* 忽略反馈(过时/失真复核信号) */
      { verb: 'search', ts: ago(7, 4), projectId: 'p1', sessionId: 's2',
        args: { domain: '产品/场景', keywords: ['场景', '分层'], threshold: 0.35, budget: 2000 },
        hits: ['kn-103'], hitCount: 1, below: 0, latencyMs: 48, tokens: 174, status: 'ok',
        feedback: { knId: 'kn-103', kind: 'ignored', ts: ago(7, 3.8) } },
      /* 子会话读链:相对时间规范 */
      { verb: 'search', ts: ago(1, 2.3), projectId: 'p1', sessionId: 's1-1',
        args: { domain: '共享', keywords: ['相对时间'], threshold: 0.35, budget: 2000 },
        hits: ['kn-109'], hitCount: 1, below: 0, latencyMs: 44, tokens: 128, status: 'ok' },
      { verb: 'read-abstract', ts: ago(1, 2), projectId: 'p1', sessionId: 's1-1',
        args: { id: 'kn-109' }, hits: ['kn-109'], hitCount: 1, below: 0, latencyMs: 7, tokens: 88, status: 'ok' },
      /* 域树浏览(产品域) */
      { verb: 'browse', ts: ago(1, 9), projectId: 'p1', sessionId: 's2',
        args: { domain: '产品' }, hits: [], hitCount: 3, below: 0, latencyMs: 10, tokens: 0, status: 'ok' },
      /* p2:前端安全知识召回 + 读正文 */
      { verb: 'search', ts: ago(2, 1), projectId: 'p2', sessionId: 'f1',
        args: { domain: '编程/前端', keywords: ['安全', 'XSS'], threshold: 0.4, budget: 1500 },
        hits: ['g-201'], hitCount: 1, below: 0, latencyMs: 52, tokens: 192, status: 'ok' },
      { verb: 'read-full', ts: ago(2, 0.8), projectId: 'p2', sessionId: 'f1',
        args: { id: 'g-201' }, hits: ['g-201'], hitCount: 1, below: 0, latencyMs: 16, tokens: 388, status: 'ok' },
      /* p2:提案写作知识 + 采纳 */
      { verb: 'search', ts: ago(3, 5), projectId: 'p2', sessionId: 'f2',
        args: { domain: '专家', keywords: ['提案', '写作'], threshold: 0.35, budget: 2000 },
        hits: ['g-205'], hitCount: 1, below: 0, latencyMs: 47, tokens: 168, status: 'ok',
        feedback: { knId: 'g-205', kind: 'adopted', ts: ago(3, 4.7) } },
      { verb: 'read-full', ts: ago(3, 4.7), projectId: 'p2', sessionId: 'f2',
        args: { id: 'g-205' }, hits: ['g-205'], hitCount: 1, below: 0, latencyMs: 15, tokens: 356, status: 'ok' },
      /* 空结果(盲区):关键词超前于库存 */
      { verb: 'search', ts: ago(6), projectId: 'p1', sessionId: 's4',
        args: { domain: null, keywords: ['向量检索', '语义召回'], threshold: 0.35, budget: 2000 },
        hits: [], hitCount: 0, below: 2, latencyMs: 62, tokens: 0, status: 'empty' },
      /* 边界纪律读链 */
      { verb: 'search', ts: ago(8, 3), projectId: 'p1', sessionId: 's2',
        args: { domain: '产品/边界', keywords: ['只读'], threshold: 0.35, budget: 2000 },
        hits: ['kn-102'], hitCount: 1, below: 0, latencyMs: 43, tokens: 152, status: 'ok' },
      { verb: 'read-abstract', ts: ago(8, 2.8), projectId: 'p1', sessionId: 's2',
        args: { id: 'kn-102' }, hits: ['kn-102'], hitCount: 1, below: 0, latencyMs: 8, tokens: 92, status: 'ok' },
      /* 上游适配域:多命中 + 阈值滤除 */
      { verb: 'search', ts: ago(10, 4), projectId: 'p1', sessionId: 's1',
        args: { domain: '工程/上游适配', keywords: ['上游', '适配'], threshold: 0.45, budget: 2000 },
        hits: ['kn-108', 'kn-110'], hitCount: 2, below: 1, latencyMs: 71, tokens: 302, status: 'ok' },
      { verb: 'read-full', ts: ago(10, 3.8), projectId: 'p1', sessionId: 's1',
        args: { id: 'kn-108' }, hits: ['kn-108'], hitCount: 1, below: 0, latencyMs: 19, tokens: 402, status: 'ok' },
      /* 工程/共享域浏览 */
      { verb: 'browse', ts: ago(5, 1), projectId: 'p1', sessionId: 's3',
        args: { domain: '工程' }, hits: [], hitCount: 2, below: 0, latencyMs: 9, tokens: 0, status: 'ok' },
      /* p3:全域浏览(召回池仅全局库) */
      { verb: 'browse', ts: ago(30, 1), projectId: 'p3', sessionId: 'd1',
        args: { domain: null }, hits: [], hitCount: 7, below: 0, latencyMs: 7, tokens: 0, status: 'ok' },
      /* p3:关键词无匹配(该 workspace 无自有知识) */
      { verb: 'search', ts: ago(30, 2), projectId: 'p3', sessionId: 'd1',
        args: { domain: null, keywords: ['打包', '巡检'], threshold: 0.35, budget: 2000 },
        hits: [], hitCount: 0, below: 0, latencyMs: 33, tokens: 0, status: 'empty' }
    ];
    db.recallLogs = TRACE_EXAMPLES.map(function (ex, i) {
      return Object.assign(
        { id: 'rl-' + (i + 1), traceId: 'trc-' + (0x71a00 + i * 517).toString(16), feedback: null },
        ex);
    });
    db.recallLogs.sort(function (a, b) { return b.ts - a.ts; });
    db.seedVer = RECALL_SEED_VER;

    return db;
  };

  /* ───────────────────────── 内核(读写面) ───────────────────────── */

  var db = null;
  var seq = 200;

  function notify() {
    persist();
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }
  function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* 忽略 */ }
  }
  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        db = JSON.parse(raw);
        /* 迁移:存量会话(无召回日志 / 种子版本落后)→ 补挂内核示例轨迹。
           仅重建 recallLogs,不动其余状态(事件/知识/项目保持原样)。 */
        if (db.seedVer !== RECALL_SEED_VER) {
          db.recallLogs = seedFn().recallLogs;
          db.seedVer = RECALL_SEED_VER;
          persist();
        }
        return true;
      }
    } catch (e) { /* 损坏则重播种子 */ }
    return false;
  }
  function uid(p) { return p + '-' + (++seq).toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  /* —— 时间 —— */
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function relative(ts) {
    var s = Math.max(0, Math.floor((now() - ts) / 1000));
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + '分钟';
    if (s < 86400) return Math.floor(s / 3600) + '小时';
    if (s < 7 * 86400) return Math.floor(s / 86400) + '天';
    return fmtDate(ts);
  }
  function estTokens(str) { return Math.ceil((str || '').length * 0.7); }

  /* —— 知识查询 —— */
  function knGet(id) { return db.kn.find(function (k) { return k.id === id; }); }
  function knList(opts) {
    opts = opts || {};
    return db.kn.filter(function (k) {
      if (opts.scope && opts.scope !== 'all' && k.scope !== opts.scope) return false;
      if (opts.project && k.scope === 'project' && k.project !== opts.project) return false;
      if (opts.includeRedirects === false && k.redirect) return false;
      if (opts.domain) {
        var dom = k.path.indexOf('/') >= 0 ? k.path.slice(0, k.path.lastIndexOf('/')) : '';
        if (dom !== opts.domain && !(dom + '/').startsWith(opts.domain + '/')) return false;
      }
      if (opts.status && k.status !== opts.status) return false;
      if (opts.q) {
        var q = opts.q.toLowerCase();
        var hay = (k.title + ' ' + (k.abstract || '') + ' ' + (k.keywords || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  /* 域树:目录即域(≤3 层),由路径派生,frontmatter 不重复声明 */
  function domainOf(path) { return path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : ''; }
  function domainTree(scope, projectId) {
    var root = { name: '', children: {}, count: 0 };
    knList({ scope: scope, project: projectId, includeRedirects: false }).forEach(function (k) {
      var parts = domainOf(k.path).split('/').filter(Boolean);
      var node = root;
      node.count++;
      parts.forEach(function (p) {
        node.children[p] = node.children[p] || { name: p, children: {}, count: 0 };
        node = node.children[p];
        node.count++;
      });
    });
    return root;
  }
  function allDomains(scope, projectId) {
    var set = {};
    knList({ scope: scope, project: projectId, includeRedirects: false }).forEach(function (k) {
      var d = domainOf(k.path);
      if (d) set[d] = true;
    });
    return Object.keys(set).sort();
  }

  /* —— 热度与事件 —— */
  var RECALL_VERBS = { 'search': 1, 'read-abstract': 1, 'read-full': 1 };
  function heat(id) {
    return db.events.filter(function (e) { return e.knId === id && RECALL_VERBS[e.verb]; }).length;
  }
  function usageStats(id) {
    var uses = [], fbA = 0, fbI = 0, last = null;
    db.events.forEach(function (e) {
      if (e.knId !== id) return;
      if (RECALL_VERBS[e.verb]) { uses.push(e); if (last === null || e.ts > last) last = e.ts; }
      if (e.verb === 'feedback-adopted') fbA++;
      if (e.verb === 'feedback-ignored') fbI++;
    });
    return { count: uses.length, last: last, adopted: fbA, ignored: fbI };
  }
  function recordEvent(knId, verb, sessionId) {
    db.events.push({ id: uid('ev'), knId: knId, verb: verb, ts: now(), sessionId: sessionId || null });
  }
  /* —— 召回日志(知识召回轨迹):由 dsh-forge 内核在召回执行时记录(非 dsh 会话日志)——
     每次召回调用记一条:时间 / trace_id / 所属项目 / 所属会话 / 参数 / 命中 / 耗时,供事后分析 */
  function projectOfSession(sid) {
    var s = sid && db.sessions.find(function (x) { return x.id === sid; });
    var p = s && db.projects.find(function (pp) { return pp.workspaceId === s.ws; });
    return p ? p.id : null;
  }
  function recordRecallLog(entry) {
    db.recallLogs = db.recallLogs || [];
    entry.id = uid('rl');
    entry.traceId = 'trc-' + Math.floor(Math.random() * 0xfffff).toString(16).padStart(5, '0');
    if (!entry.projectId) entry.projectId = projectOfSession(entry.sessionId);
    entry.feedback = entry.feedback || null;
    db.recallLogs.push(entry);
    if (db.recallLogs.length > 500) db.recallLogs = db.recallLogs.slice(-500);
    return entry;
  }
  function attachFeedback(knId, kind, sessionId) {
    var target = db.recallLogs.filter(function (L) {
      return (!sessionId || L.sessionId === sessionId) && L.hits.indexOf(knId) >= 0;
    }).sort(function (a, b) { return b.ts - a.ts; })[0];
    if (target) target.feedback = { knId: knId, kind: kind, ts: now() };
  }

  /* —— 置信度:读取时动态计算(四信号;不落盘) —— */
  function confidence(id) {
    var k = knGet(id);
    if (!k) return null;
    if (k.redirect) return null;
    var st = usageStats(id);
    var parts = [];
    /* ① 审核 */
    var review = k.status === 'approved' ? 0.18 : k.status === 'rejected' ? -0.40 : 0;
    parts.push({ key: '审核状态', delta: review, note: k.status === 'approved' ? '人工审核通过' : k.status === 'rejected' ? '已拒绝' : '未审核' });
    /* ② 使用(次数对数加权,封顶 0.15) */
    var use = Math.min(0.15, 0.05 * Math.log2(1 + st.count));
    parts.push({ key: '使用信号', delta: use, note: st.count + ' 次召回使用' });
    /* ②b 近期性 */
    var idleDays = st.last !== null ? (now() - st.last) / 864e5 : null;
    var recency = 0;
    if (st.count > 0 && idleDays !== null) {
      if (idleDays <= 7) recency = 0.06; else if (idleDays <= 30) recency = 0.03;
    }
    parts.push({ key: '近期性', delta: recency, note: st.count === 0 ? '从未被使用' : '最近使用 ' + Math.max(0, Math.round(idleDays)) + ' 天前' });
    /* ③ 显式反馈 */
    var fb = clamp(st.adopted * 0.04 - st.ignored * 0.06, -0.10, 0.10);
    parts.push({ key: '显式反馈', delta: fb, note: '采纳 ' + st.adopted + ' · 忽略 ' + st.ignored });
    /* ④ 时间衰减 */
    var refDays = idleDays !== null ? idleDays : (now() - (k.created || now())) / 864e5;
    var decay = refDays > 14 ? -Math.min(0.45, (refDays - 14) * 0.004) : 0;
    parts.push({ key: '时间衰减', delta: decay, note: refDays > 14 ? '闲置 ' + Math.round(refDays) + ' 天' : '无衰减' });

    var total = clamp(0.45 + review + use + recency + fb + decay, 0.02, 0.98);
    return { total: total, level: total >= 0.75 ? 'high' : total >= 0.45 ? 'mid' : 'low',
      levelLabel: total >= 0.75 ? '高' : total >= 0.45 ? '中' : '低', parts: parts };
  }

  /* —— 召回引擎(宿主能力面;域过滤 + 相关度排序 + 置信阈值 + 预算) —— */
  function recallPool(projectId) {
    /* 召回范围 = 当前项目级 + 全局(提案:两层知识库) */
    return db.kn.filter(function (k) {
      if (k.redirect || k.status === 'rejected') return false;
      if (k.scope === 'global') return true;
      return !projectId || k.project === projectId;
    });
  }
  function scoreHit(k, keywords) {
    var score = 0, matched = [];
    keywords.forEach(function (kw) {
      var hit = 0;
      if (!kw) return;
      if ((k.title || '').indexOf(kw) >= 0) hit += 3;
      if ((k.keywords || []).some(function (x) { return x.indexOf(kw) >= 0 || kw.indexOf(x) >= 0; })) hit += 2;
      if ((k.abstract || '').indexOf(kw) >= 0) hit += 1;
      if (hit > 0) { score += hit; matched.push(kw); }
    });
    return { score: score, matched: matched };
  }
  var recall = {
    browse: function (opts) {
      opts = opts || {};
      var pool = recallPool(opts.projectId);
      if (opts.domain) pool = pool.filter(function (k) {
        var d = domainOf(k.path);
        return d === opts.domain || (d + '/').startsWith(opts.domain + '/');
      });
      var tree = { children: {}, count: 0 };
      pool.forEach(function (k) {
        var parts = domainOf(k.path).split('/').filter(Boolean);
        var node = tree; node.count++;
        parts.forEach(function (p) {
          node.children[p] = node.children[p] || { name: p, children: {}, count: 0 };
          node = node.children[p]; node.count++;
        });
      });
      recordRecallLog({ ts: now(), verb: 'browse', projectId: opts.projectId || null, sessionId: opts.sessionId || null,
        args: { domain: opts.domain || null }, hits: [], hitCount: pool.length, below: 0,
        latencyMs: 12, tokens: 0, status: 'ok' });
      return { tree: tree, total: pool.length };
    },
    search: function (opts) {
      opts = opts || {};
      var keywords = (opts.keywords || []).filter(Boolean);
      var threshold = opts.threshold != null ? opts.threshold : 0.35;
      var budget = opts.budget != null ? opts.budget : 2000;
      var pool = recallPool(opts.projectId);
      if (opts.domain) pool = pool.filter(function (k) {
        var d = domainOf(k.path);
        return d === opts.domain || (d + '/').startsWith(opts.domain + '/');
      });
      var below = 0;
      var hits = [];
      pool.forEach(function (k) {
        var sc = scoreHit(k, keywords);
        if (keywords.length && sc.score === 0) return;
        var conf = confidence(k.id);
        if (conf.total < threshold) { below++; return; }   /* 置信阈值:低置信不返回 */
        hits.push({ kn: k, score: keywords.length ? sc.score : 1, matched: sc.matched, conf: conf });
      });
      hits.sort(function (a, b) { return b.score - a.score; });  /* 相关度排序;置信度只作阈值(解耦) */
      /* token 预算:摘要累加,超出截断降载 */
      var used = 0, truncated = 0;
      hits.forEach(function (h) {
        var t = estTokens(h.kn.abstract);
        h.tokens = t;
        if (used + t <= budget) { h.within = true; used += t; }
        else { h.within = false; truncated++; }
      });
      hits.forEach(function (h) { recordEvent(h.kn.id, 'search', opts.sessionId); }); /* 每次召回记使用事件 */
      recordRecallLog({ ts: now(), verb: 'search', projectId: opts.projectId || null, sessionId: opts.sessionId || null,
        args: { domain: opts.domain || null, keywords: keywords.slice(), threshold: threshold, budget: budget },
        hits: hits.map(function (h) { return h.kn.id; }), hitCount: hits.length, below: below, truncated: truncated,
        latencyMs: 24 + hits.length * 9, tokens: used, status: hits.length ? 'ok' : 'empty' });
      return { hits: hits, below: below, used: used, budget: budget, truncated: truncated };
    },
    readAbstract: function (id, sessionId) {
      var k = knGet(id); if (!k) return null;
      recordEvent(id, 'read-abstract', sessionId);
      var tok = estTokens(k.abstract);
      recordRecallLog({ ts: now(), verb: 'read-abstract', sessionId: sessionId || null,
        args: { id: id }, hits: [id], hitCount: 1, below: 0, latencyMs: 8, tokens: tok, status: 'ok' });
      return { kn: k, content: k.abstract, tokens: tok };
    },
    readFull: function (id, sessionId) {
      var k = knGet(id); if (!k) return null;
      recordEvent(id, 'read-full', sessionId);
      var tok = estTokens(k.body);
      recordRecallLog({ ts: now(), verb: 'read-full', sessionId: sessionId || null,
        args: { id: id }, hits: [id], hitCount: 1, below: 0, latencyMs: 14, tokens: tok, status: 'ok' });
      return { kn: k, content: k.body, tokens: tok };
    },
    feedback: function (id, kind, sessionId) {
      attachFeedback(id, kind === 'adopted' ? 'adopted' : 'ignored', sessionId);
      recordEvent(id, kind === 'adopted' ? 'feedback-adopted' : 'feedback-ignored', sessionId);
    },
    recentEvents: function (limit) {
      return db.events.slice().reverse().slice(0, limit || 8);
    }
  };

  /* —— 抽取(带契约校验 + 去重检测) —— */
  function dedupCheck(draft) {
    var pool = db.kn.filter(function (k) { return !k.redirect && k.scope === draft.scope && (draft.scope === 'global' || k.project === draft.project); });
    var best = null;
    pool.forEach(function (k) {
      var kwA = new Set(draft.keywords || []);
      var inter = (k.keywords || []).filter(function (x) { return kwA.has(x); }).length;
      var union = new Set((k.keywords || []).concat(draft.keywords || [])).size;
      var jac = union ? inter / union : 0;
      var tA = new Set((draft.title || '').split(''));
      var tB = new Set((k.title || '').split(''));
      var ti = 0; tA.forEach(function (c) { if (tB.has(c)) ti++; });
      var tSim = (tA.size + tB.size) / 2 ? (2 * ti / (tA.size + tB.size)) : 0;
      var sim = Math.max(jac, tSim * 0.8);
      if (!best || sim > best.sim) best = { kn: k, sim: sim, inter: inter };
    });
    return best;
  }
  function extract(draft) {
    /* 契约校验(frontmatter schema:标题/摘要/关键词/域 ≤3 层) */
    if (!draft.title || !draft.abstract || !(draft.keywords || []).length) {
      return { ok: false, error: '契约校验未过:标题/摘要/关键词为必填(frontmatter schema)' };
    }
    var dom = (draft.domain || '').split('/').filter(Boolean);
    if (dom.length > 3) return { ok: false, error: '契约校验未过:目录层级最多三层(一级 = 域)' };
    var dup = dedupCheck(draft);
    var k = {
      id: uid('kn'), scope: draft.scope || 'project', project: draft.scope === 'global' ? null : draft.project,
      path: (dom.length ? dom.join('/') + '/' : '') + draft.title + '.md',
      title: draft.title, abstract: draft.abstract, keywords: draft.keywords.slice(0, 6),
      status: 'pending', author: draft.author || 'user', created: now(), modified: now(),
      srcSession: draft.sessionId || null,
      body: draft.body || draft.abstract, isNew: true
    };
    db.kn.push(k);
    var queued = false;
    if (dup && dup.sim >= 0.35) {
      db.mergeQueue.push({ id: uid('mq'), aId: k.id, bId: dup.kn.id, origin: 'extract-dedup',
        reason: '关键词重叠 ' + dup.inter + ' · 相似度 ' + dup.sim.toFixed(2) });
      queued = true;
    }
    return { ok: true, kn: k, dup: queued ? dup : null };
  }

  /* —— 会话 ↔ 知识关联(状态层事件派生;知识召回 tab 与面板会话下钻的数据源) —— */
  function ofSession(sid) {
    var byKn = {};
    db.events.forEach(function (e) {
      if (e.sessionId !== sid) return;
      if (!RECALL_VERBS[e.verb] && e.verb.indexOf('feedback') !== 0) return;
      var r = byKn[e.knId] = byKn[e.knId] || { knId: e.knId, count: 0, verbs: {}, last: null, adopted: 0, ignored: 0 };
      if (RECALL_VERBS[e.verb]) {
        r.count++;
        r.verbs[e.verb] = (r.verbs[e.verb] || 0) + 1;
        if (r.last === null || e.ts > r.last) r.last = e.ts;
      }
      if (e.verb === 'feedback-adopted') r.adopted++;
      if (e.verb === 'feedback-ignored') r.ignored++;
    });
    var recalled = Object.keys(byKn).map(function (id) { return byKn[id]; })
      .filter(function (r) { return r.count > 0; })
      .sort(function (a, b) { return b.last - a.last; });
    var seen = {};
    recalled.forEach(function (r) { seen[r.knId] = true; });
    var extracted = db.kn.filter(function (k) {
      return !k.redirect && !seen[k.id] && (k.srcSession === sid || k.author === 'agent:' + sid);
    });
    return { recalled: recalled, extracted: extracted };
  }
  function recallCountOf(sid) {
    return db.events.filter(function (e) { return e.sessionId === sid && RECALL_VERBS[e.verb]; }).length;
  }
  function extractCountOf(sid) {
    return db.kn.filter(function (k) { return !k.redirect && (k.srcSession === sid || k.author === 'agent:' + sid); }).length;
  }

  /* —— 对外 API(读写面) —— */
  var api = {
    /* 初始化 */
    init: function () { if (!restore()) { db = seedFn(); persist(); } },
    reset: function () { db = seedFn(); simDays = 0; persist(); },
    subscribe: function (fn) { listeners.push(fn); },
    notify: notify,
    get db() { return db; },
    now: now,
    setSimDays: function (d) { simDays = d; },
    getSimDays: function () { return simDays; },
    uid: uid, fmtDate: fmtDate, fmtTime: fmtTime, relative: relative, estTokens: estTokens,

    /* 知识 */
    kn: {
      get: knGet, list: knList, domainOf: domainOf, domainTree: domainTree, allDomains: allDomains,
      heat: heat, usageStats: usageStats, confidence: confidence,
      ofSession: ofSession, recallCountOf: recallCountOf, extractCountOf: extractCountOf,
      approve: function (id) { var k = knGet(id); if (k && !k.redirect) { k.status = 'approved'; k.modified = now(); notify(); } },
      reject: function (id) { var k = knGet(id); if (k && !k.redirect) { k.status = 'rejected'; k.modified = now(); notify(); } },
      /* 元数据编辑(frontmatter 字段;经宿主能力面 —— UI 管理面 / 知识插件写入 tool 同一 API) */
      updateMeta: function (id, patch) {
        var k = knGet(id);
        if (!k || k.redirect) return { ok: false, error: '条目不存在' };
        if (patch.title != null) {
          var t = String(patch.title).trim();
          if (!t) return { ok: false, error: '标题不可为空(契约校验)' };
          k.title = t;
          var file = k.path.slice(k.path.lastIndexOf('/') + 1);
          k.path = k.path.slice(0, k.path.lastIndexOf('/') + 1) + t + '.md';  /* 文件名同步(能力面单一 API) */
        }
        if (patch.abstract != null) {
          var a = String(patch.abstract).trim();
          if (!a) return { ok: false, error: '摘要不可为空(契约校验)' };
          k.abstract = a;
        }
        if (patch.keywords && patch.keywords.length) k.keywords = patch.keywords.slice(0, 6);
        if (patch.status && ['pending', 'approved', 'rejected'].indexOf(patch.status) >= 0) k.status = patch.status;
        k.modified = now();
        notify();
        return { ok: true };
      },
      /* 结构维护:移动 = 换域(稳定 ID 不变;文件与索引一体,单一 API) */
      move: function (id, newDomain) {
        var k = knGet(id); if (!k || k.redirect) return;
        var file = k.path.slice(k.path.lastIndexOf('/') + 1);
        k.path = (newDomain ? newDomain + '/' : '') + file;
        k.modified = now();
        notify();
      },
      /* 两层晋升流:项目级 → 全局(移动 + 项目侧重定向记录) */
      promote: function (id) {
        var k = knGet(id); if (!k || k.redirect || k.scope !== 'project') return null;
        var pid = k.project;
        k.scope = 'global'; k.project = null; k.modified = now();
        db.kn.push({ id: 'kn-rt-' + id.slice(3), scope: 'project', project: pid, redirect: true,
          targetId: id, path: k.path, title: k.title + '(已晋升)', modified: now() });
        notify();
        return k;
      },
      extract: extract, dedupCheck: dedupCheck,
      merge: function (mqId, keepA) {
        var mq = db.mergeQueue.find(function (m) { return m.id === mqId; }); if (!mq) return;
        var keep = knGet(keepA ? mq.aId : mq.bId), drop = knGet(keepA ? mq.bId : mq.aId);
        if (keep && drop) {
          keep.body += '\n\n## 合并自《' + drop.title + '》\n\n' + (drop.body || '');
          (drop.keywords || []).forEach(function (kw) { if (keep.keywords.indexOf(kw) < 0) keep.keywords.push(kw); });
          keep.modified = now();
          db.kn = db.kn.filter(function (k) { return k.id !== drop.id; });
        }
        db.mergeQueue = db.mergeQueue.filter(function (m) { return m.id !== mqId; });
        notify();
      },
      dismissDup: function (mqId) { db.mergeQueue = db.mergeQueue.filter(function (m) { return m.id !== mqId; }); notify(); },
      /* 外部修改对账:索引 = 可随时重建的派生缓存(非 SoT) */
      simulateExternal: function () {
        db.kn.push({ id: uid('kn'), scope: 'project', project: 'p1', path: '工程/实践/外部草稿.md',
          title: '外部编辑器新增的草稿', abstract: '此文件由外部编辑器直接写入知识目录 —— 未入索引,进入面板时对账重建。',
          keywords: ['外部', '对账'], status: 'pending', author: '外部编辑器',
          created: now(), modified: now(), body: '外部编辑器直改直移演示:启动/进面板对账按 frontmatter id 重新挂载索引。', unindexed: true });
        notify();
      },
      reconcile: function () {
        var n = 0;
        db.kn.forEach(function (k) { if (k.unindexed) { delete k.unindexed; n++; } });
        notify();
        return n;
      },
      unindexedCount: function (pid) {
        return db.kn.filter(function (k) { return k.unindexed && (!pid || k.project === pid); }).length;
      },
      pendingCount: function (pid) {
        return db.kn.filter(function (k) { return !k.redirect && k.status === 'pending' && (!pid || (k.scope === 'project' && k.project === pid) || k.scope === 'global'); }).length;
      }
    },
    recall: recall,

    /* 项目与工作区映射(外键 + 对账;无会话副本) */
    ws: {
      get: function (id) { return db.wsRegistry[id] || null; },
      checkAlignment: function (pid) {
        var p = db.projects.find(function (x) { return x.id === pid; });
        if (!p) return { state: 'none' };
        var ws = db.wsRegistry[p.workspaceId];
        if (!ws) return { state: 'missing', p: p };
        if (ws.canonicalPath === p.canonicalPath) return { state: 'ok', ws: ws, p: p };
        return { state: 'mismatch', ws: ws, p: p };
      },
      /* 演示:目录整体移动(dsh 侧 path 变更 → 应用失配) */
      simulateMove: function (pid) {
        var p = db.projects.find(function (x) { return x.id === pid; });
        var ws = db.wsRegistry[p.workspaceId];
        ws.canonicalPath = ws.canonicalPath + '-moved';
        db.alignDemo = { state: 'moved' };
        notify();
      },
      /* 对账:按 canonical path 在 registry.list() 找回 → 单向修引用 */
      realign: function (pid) {
        var p = db.projects.find(function (x) { return x.id === pid; });
        var found = Object.values(db.wsRegistry).find(function (w) { return w.canonicalPath === p.canonicalPath + '-moved'; });
        if (found) { p.workspaceId = found.id; p.canonicalPath = found.canonicalPath; }
        db.alignDemo = { state: 'ok' };
        notify();
        return !!found;
      }
    },
    sessionsOf: function (wsId) {
      /* 会话列表实时读(渲染时直问 dsh 账本本体;零缓存零副本) */
      return db.sessions.filter(function (s) { return s.ws === wsId && !s.archived; })
        .sort(function (a, b) { return b.ts - a.ts; });
    },
    sessionGet: function (id) { return db.sessions.find(function (s) { return s.id === id; }) || null; },

    /* 任务状态层(应用数据库;经 forge 插件 tool 半身写入 —— 原型等价模拟) */
    tasks: {
      ofProject: function (pid) {
        return Object.values(db.tasks).filter(function (t) { return t.project === pid; })
          .sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      },
      /* 任务视图(列表 / DAG / 泳道)一律 feature 绑定 —— 无全局汇总 */
      ofFeature: function (slug) {
        return Object.values(db.tasks).filter(function (t) { return t.feature === slug; })
          .sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      },
      simulateToolSubmit: function (key) {
        var t = db.tasks[key]; if (!t) return null;
        var next = { pending: 'in_progress', in_progress: 'completed' };
        if (!next[t.status]) return null;
        t.status = next[t.status];
        var f = db.features.find(function (x) { return x.slug === t.feature; });
        if (f) {
          f.done = Object.values(db.tasks).filter(function (x) { return x.feature === f.slug && x.status === 'completed'; }).length;
          if (f.done >= f.total && f.status !== 'completed') f.status = 'in-progress';
          else if (f.done > 0 && f.status === 'prd') f.status = 'in-progress';
        }
        notify();
        return t;
      }
    },
    featuresOf: function (pid) { return db.features.filter(function (f) { return f.project === pid; }); },
    proposalsOf: function (pid) { return db.proposals.filter(function (f) { return f.project === pid; }); },

    /* 项目 */
    projects: {
      switchTo: function (pid) {
        db.projects.forEach(function (p) { p.expanded = p.id === pid; });
        notify();
      },
      toggleExpand: function (pid) {
        var p = db.projects.find(function (x) { return x.id === pid; });
        p.expanded = !p.expanded;
        notify();
      },
      add: function (opts) {
        var dup = db.projects.find(function (p) { return p.canonicalPath === opts.canonicalPath && !p.archived; });
        if (dup) return { ok: false, error: '该路径已注册:' + dup.name };
        var wsId = uid('ws');
        db.wsRegistry[wsId] = { id: wsId, canonicalPath: opts.canonicalPath };   /* 先 dsh:create 幂等 */
        var p = { id: uid('p'), name: opts.name, workspaceId: wsId, canonicalPath: opts.canonicalPath,
          docMode: opts.docMode || 'repo',
          forgeDir: opts.forgeDir || opts.canonicalPath + '\\.forge',          /* 文档位置 = forge 目录:按工作区构建 */
          knowledgeDir: opts.knowledgeDir || opts.canonicalPath + '\\.knowledge',
          defaultRecallDomain: opts.defaultRecallDomain || null, archived: false, expanded: true, isNew: true };
        /* 任务清单与记录不入项目记录:统一存 {dsh-forge-home}/{canonical-path 扁平化(/ 与 \ 替换为 -)},运行时按 canonicalPath 派生 */
        db.projects.push(p);   /* 后自家:外键 + 扩展字段,无会话列表字段 */
        notify();
        return { ok: true, project: p };
      }
    },

    /* 会话发送模拟(dsh 行语言之外,原型罐头往返;带召回链路) */
    send: function (sessionId, text) {
      var s = api.sessionGet(sessionId);
      s.msgs.push({ role: 'user', ts: now(), text: text });
      s.ts = now();
      notify();
      /* 工具行:knowledge.search(500ms) */
      setTimeout(function () {
        s.msgs.push({ role: 'tool', ts: now(), running: true, tool: { name: 'knowledge.search',
          args: '会话关键词自动抽取', summary: '检索中…' } });
        s.ts = now(); notify();
        setTimeout(function () {
          var kws = api.guessKeywords(text);
          var proj = db.projects.find(function (p) { return p.workspaceId === s.ws; });
          var res = recall.search({ projectId: proj ? proj.id : null, keywords: kws, sessionId: s.id });
          var inBudget = res.hits.filter(function (h) { return h.within; }).map(function (h) { return h.kn.id; });
          var m = s.msgs[s.msgs.length - 1];
          m.running = false;
          m.tool.summary = inBudget.length + ' 条命中 · ' + res.used + ' tok · 已记使用事件';
          m.tool.args = '{ keywords: [' + kws.map(function (k) { return '"' + k + '"'; }).join(', ') + '] }';
          m.tool.hits = inBudget;
          s.ts = now(); notify();
          setTimeout(function () {
            var reply;
            if (inBudget.length) {
              var names = inBudget.slice(0, 3).map(function (id) { return '《' + knGet(id).title + '》'; }).join('、');
              reply = '已召回 ' + names + '(附命中理由与置信度,采纳与否由我判断)。\n基于以上约束,我的处理口径:先对齐既有判断,再给增量方案;低置信条目仅作参考。';
            } else {
              reply = '知识库暂无命中 —— 按通用经验处理;若本次形成可复用判断,我会落一条抽取稿(pending,中等置信)供审核。';
            }
            s.msgs.push({ role: 'assistant', ts: now(), text: reply });
            s.ts = now(); notify();
          }, 700);
        }, 800);
      }, 500);
    },
    guessKeywords: function (text) {
      var dict = {};
      db.kn.forEach(function (k) { if (!k.redirect) (k.keywords || []).forEach(function (kw) { dict[kw] = true; }); });
      var found = Object.keys(dict).filter(function (kw) { return text.indexOf(kw) >= 0; });
      if (found.length) return found.slice(0, 4);
      var generic = ['约束', '规范', '流程', '架构', '性能', '安全', '置信度', '召回'];
      return generic.filter(function (g) { return text.indexOf(g) >= 0; }).slice(0, 3).length
        ? generic.filter(function (g) { return text.indexOf(g) >= 0; }).slice(0, 3) : ['架构'];
    },
    newSessionIn: function (wsId, title) {
      var s = { id: uid('s'), ws: wsId, parentId: null, title: title || '新会话', taskKey: null, status: 'ended', ts: now(), msgs: [] };
      db.sessions.push(s);
      notify();
      return s;
    }
  };

  window.FORGE = api;
})();
