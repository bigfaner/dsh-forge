/* ==========================================================================
   dsh-forge M4 原型模拟数据(data.js)
   单一数据源:项目 / feature / 任务 / 会话树(含消息)/ 文档树 / 提案。
   页面经 FORGE.* 读写;变更通知订阅方重渲染。
   持久:sessionStorage(同标签页跨页/刷新保留 —— 归档会话 → 设置页解除
   归档等跨页链路可走通);新标签页还原种子数据。
   v2.9 增:workspace 字段、ts 相对时间序、归档会话、会话改名/分叉/归档
   mutator、proposals/docTree/docs 罐头、shells。
   ========================================================================== */
(function () {
  'use strict';

  var listeners = [];
  var seq = 100;
  var STORAGE_KEY = 'proto-forge-db';

  function now() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  var db = {
    projects: [
      { id: 'p1', name: 'dsh-forge', workspace: 'Z:\\project\\dsh', path: 'Z:\\project\\dsh\\dsh-forge', archived: false,
        featureLabel: 'dsh-forge-m4 · in-progress', codeHealth: 'ok', docHealth: 'ok' },
      { id: 'p2', name: 'forge', workspace: 'Z:\\project\\ai\\forge', path: 'Z:\\project\\ai\\forge\\forge-cli', archived: false,
        featureLabel: 'forge-4.2-eval · design', codeHealth: 'ok', docHealth: 'warn',
        docWarn: 'Z:\\project\\ai\\forge\\docs 目录只读' },
      { id: 'p3', name: 'dsh-desktop', workspace: 'Z:\\project\\dsh', path: 'Z:\\project\\dsh\\dsh-desktop', archived: true, archivedAt: '2026-09-19' }
    ],

    features: [
      { slug: 'dsh-forge-m4', project: 'p1', status: 'in-progress', label: '项目中心 IA', done: 12, total: 41 },
      { slug: 'dsh-forge-m3', project: 'p1', status: 'tasks', label: '任务分解移植', done: 0, total: 41 },
      { slug: 'dsh-forge-m2', project: 'p1', status: 'completed', label: 'vendor 闭环', done: 53, total: 53 },
      { slug: 'forge-4.2-eval', project: 'p2', status: 'design', label: '评估管线', done: 2, total: 8 }
    ],

    tasks: {
      '4.2.1': { id: '4.2.1', project: 'p1', feature: 'dsh-forge-m4', title: '实现会话列表增强', status: 'in-progress',
        desc: '复用上游 workspace 会话列表组件,注入 forge 增强层:任务归属 Pill、血缘展开;默认收起,展开态进布局记忆。',
        deps: '4.1.3 视图键注册 → 4.2.1(本任务) → 4.2.2 空态与降级文案',
        record: '5.12 提交:增强层挂载点;5.14 提交:血缘展开渲染。' },
      '4.2.2': { id: '4.2.2', project: 'p1', feature: 'dsh-forge-m4', title: '会话列表空态与降级文案', status: 'pending',
        desc: '空态 / 血缘降级两套文案与视觉,同步 prd-ui-functions C3 口径。',
        deps: '依赖 4.2.1', record: '—' },
      '4.3.2': { id: '4.3.2', project: 'p1', feature: 'dsh-forge-m4', title: '血缘推断运行时索引', status: 'in-progress',
        desc: '运行时血缘索引:派发 prompt 特征 → subagent 会话归属;推断 >100ms 自动降级。',
        deps: '—', record: '索引结构选型中。' },
      '4.4.1': { id: '4.4.1', project: 'p1', feature: 'dsh-forge-m4', title: '知识区禁用态说明', status: 'in-progress',
        desc: '知识区 tab 恒 disabled、零内容面板挂载(SC2 断言口径);tooltip「知识库后续引入」。',
        deps: '—', record: '—' },
      '4.1.3': { id: '4.1.3', project: 'p1', feature: 'dsh-forge-m4', title: '视图键注册与孤儿清零', status: 'completed',
        desc: '视图键注册表 + 孤儿视图清零策略。',
        deps: '—', record: '已合入 main。' },
      '5.1.2': { id: '5.1.2', project: 'p1', feature: 'dsh-forge-m4', title: '投影对账降级排查', status: 'in-progress',
        desc: '启动 / 打开页事件对账降级路径排查:投影写入失败 → 降级运行不阻断。',
        deps: '—', record: '复现中。' }
    },

    /* 会话树(扁平 + parentId;血缘后代递归派生;ts = 相对时间排序序,大者新) */
    sessions: [
      { id: 's1', project: 'p1', parentId: null, title: '实现会话列表增强 — 派发', taskId: '4.2.1', status: 'running', updated: '14:32', ts: 900,
        msgs: [
          { role: 'user', time: '14:32', text: '派发 task 4.2.1 实现会话列表增强:按 prd-ui-functions C3,增强层注入任务归属与血缘展开。' },
          { role: 'assistant', time: '14:32', text: '已接收派发。拆为三个子任务:实现、样式令牌对齐、血缘索引构建;subagent 会话创建后经血缘推断回联(⟂)。' }
        ] },
      { id: 's1-1', project: 'p1', parentId: 's1', title: '4.2.1 实现会话列表增强', taskId: '4.2.1', status: 'running', updated: '14:33', ts: 901,
        msgs: [
          { role: 'user', time: '14:33', text: 'task 4.2.1 实现会话列表增强\n## 任务说明\n复用上游 workspace 会话列表组件,注入 forge 增强层…\n(forge prompt get-by-task-id 完整输出逐字符注入,原型节选)' },
          { role: 'assistant', time: '14:34', text: '已定位挂载点:packages/plugins/forge-workbench/…/session-list。增强层按行注入任务归属,血缘后代默认收起、可递归展开。' },
          { role: 'tool', time: '14:36', text: '编辑 session-list 增强层(进行中)', running: true }
        ] },
      { id: 's1-2', project: 'p1', parentId: 's1', title: '4.2.1 会话列表样式令牌对齐', taskId: '4.2.1', status: 'ended', updated: '13:40', ts: 820,
        msgs: [
          { role: 'user', time: '13:30', text: '样式令牌对齐:行高/状态点/焦点环与上游 DESIGN.md 令牌一致。' },
          { role: 'assistant', time: '13:40', text: '已对齐:行高 32、状态点优先级、focus 2px offset 2;对比度自查通过。' }
        ] },
      { id: 's1-3', project: 'p1', parentId: 's1', title: '4.2.1 血缘推断索引构建', taskId: '4.2.1', status: 'ended', updated: '12:05', ts: 700,
        msgs: [
          { role: 'user', time: '11:50', text: '构建血缘推断索引:运行时按 prompt 特征回联 subagent 会话。' },
          { role: 'assistant', time: '12:05', text: '索引落地:taskId + title 命名双因子;>100ms 降级仅顶层行。' }
        ] },
      { id: 's1-3-1', project: 'p1', parentId: 's1-3', title: '4.2.1 评审:列表增强验收', taskId: '4.2.1', status: 'ended', updated: '12:40', ts: 740,
        msgs: [
          { role: 'user', time: '12:30', text: '按验收清单评审列表增强实现。' },
          { role: 'assistant', time: '12:40', text: '结论:通过;两处建议已汇总(状态点优先级 / 展开态入布局记忆)。' }
        ] },
      { id: 's1-3-1-1', project: 'p1', parentId: 's1-3-1', title: '4.2.1 评审记录汇总', taskId: '4.2.1', status: 'ended', updated: '12:52', ts: 752,
        msgs: [
          { role: 'user', time: '12:45', text: '汇总评审记录到任务执行记录。' },
          { role: 'assistant', time: '12:52', text: '已写入 4.2.1 执行记录(forge task submit --data)。' }
        ] },
      { id: 's1-4', project: 'p1', parentId: 's1', title: '4.2.1 降级路径自测', taskId: '4.2.1', status: 'running', updated: '14:50', ts: 940, msgs: [] },
      { id: 's1-5', project: 'p1', parentId: 's1', title: '4.2.1 样式走查', taskId: '4.2.1', status: 'ended', updated: '13:12', ts: 800, msgs: [] },
      { id: 's1-6', project: 'p1', parentId: 's1', title: '4.2.1 文档更新', taskId: '4.2.1', status: 'ended', updated: '11:55', ts: 660, msgs: [] },
      { id: 's1-7', project: 'p1', parentId: 's1', title: '4.2.1 单测补齐', taskId: '4.2.1', status: 'ended', updated: '11:20', ts: 640, msgs: [] },

      { id: 's2', project: 'p1', parentId: null, title: '投影对账降级排查 — 派发', taskId: '5.1.2', status: 'running', updated: '11:08', ts: 600,
        msgs: [
          { role: 'user', time: '11:08', text: '派发 task 5.1.2 投影对账降级排查:复现写入失败 → 降级运行路径。' },
          { role: 'assistant', time: '11:08', text: '已建 subagent 会话复现;结论将回写执行记录。' }
        ] },
      { id: 's2-1', project: 'p1', parentId: 's2', title: '5.1.2 投影对账降级排查', taskId: '5.1.2', status: 'running', updated: '11:09', ts: 601,
        msgs: [
          { role: 'user', time: '11:09', text: '复现:启动对账窗口内投影写入失败。' },
          { role: 'assistant', time: '11:20', text: '复现成功:写入失败 → 状态降级,注册/改名/归档不受阻断;与 BIZ 口径一致。' },
          { role: 'tool', time: '11:22', text: '读取对账日志(进行中)', running: true }
        ] },
      { id: 's3', project: 'p1', parentId: null, title: '探索:知识区布局 spike', taskId: null, status: 'ended', updated: '昨天', ts: 400,
        msgs: [
          { role: 'user', time: '昨天', text: '知识区布局 spike:右栏立柱是否兼容后续知识面板。' },
          { role: 'assistant', time: '昨天', text: '结论:兼容;知识区延后不阻塞 M4,右栏选项注册制即可。' }
        ] },
      { id: 's4', project: 'p1', parentId: null, title: '初版会话列表接入(历史)', taskId: '4.2.1', status: 'ended', updated: '09-20', ts: 200,
        msgs: [
          { role: 'user', time: '09-20', text: '初版会话列表接入(已被 4.2.1 增强层替代)。' }
        ] },
      { id: 's4-1', project: 'p1', parentId: 's4', title: '4.2.1 初版列表挂载(历史快照)', taskId: '4.2.1', status: 'ended', updated: '09-20', ts: 190, msgs: [] },

      /* 已归档会话(设置页「已归档会话」恢复用种子) */
      { id: 's7', project: 'p1', parentId: null, title: 'M3 收口走查(已归档)', taskId: null, status: 'ended', updated: '09-12', ts: 100, archived: true,
        msgs: [{ role: 'user', time: '09-12', text: 'M3 收口走查(归档示范会话)。' }] },
      { id: 's8', project: 'p1', parentId: null, title: 'vendor 闭环回归(已归档)', taskId: null, status: 'ended', updated: '09-10', ts: 90, archived: true, msgs: [] },

      { id: 's5', project: 'p2', parentId: null, title: 'forge-4.2-eval 评审 spike', taskId: null, status: 'ended', updated: '周一', ts: 300,
        msgs: [
          { role: 'user', time: '周一', text: '评估管线评审 spike:rubric 权重与迭代门限。' },
          { role: 'assistant', time: '周一', text: '建议:门限 950 / 3 轮维持;新增 journey 契约评测单列。' }
        ] },

      { id: 's6', project: 'p3', parentId: null, title: '桌面壳集成联调', taskId: null, status: 'ended', updated: '09-18', ts: 150,
        msgs: [
          { role: 'user', time: '09-18', text: '桌面壳与 dsh 内核联调(归档前最后会话)。' },
          { role: 'assistant', time: '09-18', text: '联调通过;项目随后归档,会话仍按项目分组保留。' }
        ] }
    ],

    /* 提案目录(右栏概览 · 提案子 tab;状态徽标) */
    proposals: [
      { slug: 'dsh-forge-m4', project: 'p1', status: 'Accepted', files: [{ name: 'proposal.md', docId: 'm4-prop' }] },
      { slug: 'dsh-forge-m5', project: 'p1', status: 'Draft', files: [{ name: 'proposal.md', docId: 'm5-prop' }] },
      { slug: 'dsh-forge-m7', project: 'p1', status: 'Draft·未提交', collapsed: true, files: [{ name: 'proposal.md', docId: 'm7-prop' }] }
    ],

    /* feature 文档目录(右栏概览 · feature 子 tab) */
    docTree: [
      { slug: 'dsh-forge-m4', project: 'p1', files: [
        { name: 'manifest.md', docId: 'm4-man' },
        { name: 'prd/prd-spec.md', docId: 'm4-prd' },
        { name: 'ui/ui-design.md', docId: 'm4-ui' }] },
      { slug: 'dsh-forge-m3', project: 'p1', collapsed: true, files: [{ name: 'manifest.md', docId: 'm3-man' }] },
      { slug: 'dsh-forge-m2', project: 'p1', collapsed: true, files: [{ name: 'manifest.md', docId: 'm2-man' }] },
      { slug: 'forge-4.2-eval', project: 'p2', files: [{ name: 'manifest.md', docId: 'f42-man' }] }
    ],

    /* 文档罐头(文档 tab 正文;path 为展示全路径) */
    docs: {
      'm4-prop': { path: 'docs/proposals/dsh-forge-m4/proposal.md', body: '# dsh-forge-m4 项目中心 IA · 提案\n\n## 1 问题\nM3 前工作台以会话为默认上下文,项目归属靠记忆。\n\n## 2 方案\n三区容器 + 单向投影 + 任务↔会话反查;右栏 dockkit 页签化。\n\n(原型罐头正文,只读渲染)' },
      'm5-prop': { path: 'docs/proposals/dsh-forge-m5/proposal.md', body: '# dsh-forge-m5 任务调度补全 · 提案\n\n## 1 问题背景\n事件对账缺失导致任务状态与实际会话脱节。\n\n## 2 方案\n事件对账 + bug 看板 + todo 便签(用户便签语义)。\n\n(原型罐头正文)' },
      'm7-prop': { path: 'docs/proposals/dsh-forge-m7/proposal.md', body: '# dsh-forge-m7 模式化管线 · 提案(未提交)\n\nSDD / Quick SDD 模式化管线,顺延执行。\n\n(原型罐头正文)' },
      'm4-man': { path: 'docs/features/dsh-forge-m4/manifest.md', body: '# dsh-forge-m4 manifest\n\n- 状态:in-progress(12/41)\n- C1 项目列表 / C2 三区工作台 / C3 会话树 / C4 forge 文件区 / C5 任务抽屉\n\n(原型罐头正文)' },
      'm4-prd': { path: 'docs/features/dsh-forge-m4/prd/prd-spec.md', body: '# dsh-forge-m4 PRD\n\n## C2 三区容器\n左 = 项目树侧栏,中 = dsh 会话面板,右 = dockkit 页签栏。\n\n(原型罐头正文)' },
      'm4-ui': { path: 'docs/features/dsh-forge-m4/ui/ui-design.md', body: '# dsh-forge-m4 UI 设计\n\n布局 v2.9:76px header / 内容列 clamp(680–920) 可拖 / 右栏 45%(300–70%)。\n\n(原型罐头正文)' },
      'm3-man': { path: 'docs/features/dsh-forge-m3/manifest.md', body: '# dsh-forge-m3 manifest\n\n任务分解移植(0/41,待执行)。\n\n(原型罐头正文)' },
      'm2-man': { path: 'docs/features/dsh-forge-m2/manifest.md', body: '# dsh-forge-m2 manifest\n\nvendor 闭环(completed 53/53)。\n\n(原型罐头正文)' },
      'f42-man': { path: 'docs/features/forge-4.2-eval/manifest.md', body: '# forge-4.2-eval manifest\n\n评估管线(design 2/8)。\n\n(原型罐头正文)' }
    },

    /* Shell 列表罐头(开始页「新建终端 ⌄」菜单) */
    shells: ['PowerShell', 'CMD', 'Git Bash']
  };

  /* 同标签页跨页/刷新保留(归档→设置解除归档等跨页链路);新标签还原种子 */
  (function restore() {
    try {
      var saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) db = JSON.parse(saved);
    } catch (err) { /* 还原失败用种子 */ }
  })();
  function persist() {
    try {
      /* 评审裁决(2026-09-25):未发送首条消息的新会话不持久化 —— 刷新即还原,避免草稿堆积 */
      var snap = Object.assign({}, db, {
        sessions: db.sessions.filter(function (s) { return s.status !== 'draft'; })
      });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch (err) { /* 忽略 */ }
  }

  /* ---- 查询 ---- */
  function projects() { return db.projects; }
  function project(id) {
    return db.projects.filter(function (p) { return p.id === id; })[0] || null;
  }
  function currentProjectId() {
    var p = new URLSearchParams(location.search).get('p');
    if (project(p)) return p;
    var first = db.projects.filter(function (x) { return !x.archived; })[0];
    return (first || db.projects[0]).id;
  }
  function features(pid) {
    return db.features.filter(function (f) { return f.project === pid; });
  }
  function feature(slug) {
    return db.features.filter(function (f) { return f.slug === slug; })[0] || null;
  }
  function task(id) { return db.tasks[id] || null; }
  function tasksOf(slug) {
    return Object.keys(db.tasks).map(function (k) { return db.tasks[k]; })
      .filter(function (t) { return t.feature === slug; })
      .sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  }
  function live(s) { return !s.archived; }
  function sessionsOf(pid) {
    return db.sessions.filter(function (s) { return s.project === pid && !s.parentId && live(s); });
  }
  function childrenOf(id) {
    return db.sessions.filter(function (s) { return s.parentId === id && live(s); });
  }
  function findSession(id) {
    return db.sessions.filter(function (s) { return s.id === id; })[0] || null;
  }
  /* 项目内既存草稿(新会话单例:已有未发送会话时复用,不再新建) */
  function draftSession(pid) {
    return db.sessions.filter(function (s) {
      return s.project === pid && s.status === 'draft' && !s.archived;
    })[0] || null;
  }
  function descendants(id) {
    var out = [];
    childrenOf(id).forEach(function (c) {
      out.push(c);
      out = out.concat(descendants(c.id));
    });
    return out;
  }
  function counts(id) {
    var d = descendants(id);
    return { running: d.filter(function (x) { return x.status === 'running'; }).length, total: d.length };
  }
  function chainOf(id) { /* 根 → 自身 */
    var s = findSession(id), out = [];
    while (s) { out.unshift(s); s = s.parentId ? findSession(s.parentId) : null; }
    return out;
  }
  /* 全部会话平铺(单列表分组;跨项目,新→旧;subagent 紧随其父) */
  function flatSessions() {
    var tops = db.sessions.filter(function (s) { return !s.parentId && live(s); });
    var rows = [];
    tops.sort(function (a, b) { return b.ts - a.ts; }).forEach(function (t) {
      rows.push(t);
      descendants(t.id).sort(function (a, b) { return b.ts - a.ts; }).forEach(function (d) { rows.push(d); });
    });
    return rows;
  }
  /* 已归档会话(设置页「已归档会话」恢复列表) */
  function archivedSessions(pid) {
    return db.sessions.filter(function (s) { return s.project === pid && s.archived; })
      .sort(function (a, b) { return b.ts - a.ts; });
  }
  /* 执行中任务(运行中会话 × 任务挂接;按任务去重,优先 subagent 会话) */
  function runningTasks(pid) {
    var pick = {};
    db.sessions.forEach(function (s) {
      if (s.project !== pid || s.status !== 'running' || !s.taskId) return;
      if (!pick[s.taskId] || (!pick[s.taskId].parentId && s.parentId)) pick[s.taskId] = s;
    });
    return Object.keys(pick).map(function (tid) {
      var t = task(tid);
      return t ? { id: tid, title: t.title, sessionId: pick[tid].id } : null;
    }).filter(Boolean);
  }
  function sessionsOfTask(tid) { /* 任务挂接的顶层会话(active 优先) */
    return db.sessions.filter(function (s) { return s.taskId === tid && !s.parentId && live(s); })
      .sort(function (a, b) {
        var ra = a.status === 'running' ? 0 : 1, rb = b.status === 'running' ? 0 : 1;
        return ra - rb;
      });
  }
  function proposals(pid) { return db.proposals.filter(function (x) { return x.project === pid; }); }
  function docTree(pid) { return db.docTree.filter(function (x) { return x.project === pid; }); }
  function doc(docId) { return db.docs[docId] || null; }
  function shells() { return db.shells.slice(); }

  /* ---- 变更(各自 notify;通知前落 sessionStorage) ---- */
  function notify() {
    persist();
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* 页面渲染异常不连锁 */ } });
  }
  function newSession(pid, parentId, title) {
    var s = { id: 'n' + (seq++), project: pid, parentId: parentId || null,
      title: title || '新会话', taskId: null, status: 'draft', updated: '刚刚', ts: Date.now(), archived: false, msgs: [] };
    db.sessions.unshift(s);
    notify();
    return s;
  }
  function appendMsg(id, msg) {
    var s = findSession(id);
    if (!s) return;
    s.msgs.push(msg);
    s.updated = '刚刚';
    s.ts = Date.now();
    notify();
  }
  function patchLastTool(id, running) {
    var s = findSession(id);
    if (!s || !s.msgs.length) return;
    var last = s.msgs[s.msgs.length - 1];
    if (last.role === 'tool') { last.running = running; notify(); }
  }
  function setSession(id, patch) {
    var s = findSession(id);
    if (!s) return;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    notify();
  }
  /* 会话重命名(⋯ 菜单;行内编辑在 UI 层,此处生效) */
  function renameSession(id, title) {
    var s = findSession(id);
    if (s && title) { s.title = title; s.ts = Date.now(); notify(); }
  }
  /* 分叉会话:以当前消息历史复制为新的顶层会话(血缘独立) */
  function forkSession(id) {
    var s = findSession(id);
    if (!s) return null;
    var f = { id: 'n' + (seq++), project: s.project, parentId: null,
      title: s.title + ' · 分叉', taskId: s.taskId, status: 'ended', updated: '刚刚', ts: Date.now(), archived: false,
      msgs: s.msgs.map(function (m) { return Object.assign({}, m); }) };
    db.sessions.unshift(f);
    notify();
    return f;
  }
  /* 归档会话:无确认直接归档,行消失;恢复经设置「已归档会话」 */
  function archiveSession(id, flag) {
    var s = findSession(id);
    if (!s) return;
    s.archived = !!flag;
    notify();
  }
  function archiveProject(pid, flag) {
    var p = project(pid);
    if (!p) return;
    p.archived = !!flag;
    p.archivedAt = flag ? '2026-09-25' : null;
    notify();
  }
  function deleteProject(pid) {
    db.projects = db.projects.filter(function (p) { return p.id !== pid; });
    db.sessions = db.sessions.filter(function (s) { return s.project !== pid; });
    notify();
  }
  function renameProject(pid, name) {
    var p = project(pid);
    if (p && name) { p.name = name; notify(); }
  }
  function addProject(data) {
    var p = { id: 'p' + (seq++), name: data.name, workspace: data.workspace || '', path: data.path, archived: false,
      featureLabel: '—', codeHealth: 'ok', docHealth: 'ok' };
    db.projects.unshift(p);
    notify();
    return p;
  }
  function on(fn) { listeners.push(fn); }

  window.FORGE = {
    projects: projects, project: project, currentProjectId: currentProjectId,
    features: features, feature: feature, task: task, tasksOf: tasksOf,
    sessionsOf: sessionsOf, childrenOf: childrenOf, findSession: findSession,
    draftSession: draftSession,
    descendants: descendants, counts: counts, chainOf: chainOf,
    flatSessions: flatSessions, archivedSessions: archivedSessions,
    runningTasks: runningTasks, sessionsOfTask: sessionsOfTask,
    proposals: proposals, docTree: docTree, doc: doc, shells: shells,
    newSession: newSession, appendMsg: appendMsg, patchLastTool: patchLastTool,
    setSession: setSession, renameSession: renameSession, forkSession: forkSession,
    archiveSession: archiveSession, archiveProject: archiveProject, deleteProject: deleteProject,
    renameProject: renameProject, addProject: addProject, on: on, emit: notify,
    now: now
  };
})();
