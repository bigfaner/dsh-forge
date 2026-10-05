/* M2 UI 原型 v3 · 交互(以现有代码为准:官方 main 面板互换 layout.selectPanel 模拟 /
   conversation.view 页签 / 官方右栏 rightbarViewPlan 联动 / OS 选择器注册流[fix-14/16] /
   fix-42 侧栏行语言)。M2 delta:概览面板(dswf-overview)+ 会话头挂接 pill(双源)+
   派生行(疑似移动拒绝)+ 派发链走查(对话输入「跑任务」)。 */
(function () {
  'use strict'
  var D = window.M2
  var $ = function (s, r) { return (r || document).querySelector(s) }
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  var now = function () { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) }

  var ST_ORDER = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected']
  var ST_LABEL = { pending: '待办', in_progress: '执行中', completed: '已完成', blocked: '阻塞', suspended: '挂起', skipped: '跳过', rejected: '已拒绝' }
  var ST_DOT = { pending: 'idle', in_progress: 'ok live', completed: 'done', blocked: 'err', suspended: 'warn', skipped: 'skip', rejected: 'rej' }
  var ST_TAG = { completed: 'st-completed', in_progress: 'st-in_progress', pending: 'st-pending', blocked: 'st-blocked', suspended: 'st-pending', skipped: 'st-pending', rejected: 'st-blocked' }
  var TERM = function (st) { return st === 'completed' || st === 'skipped' }
  /* R5:feature 相位与提案五态中文标签 */
  var FEAT_LABEL = { prd: '需求', design: '设计', tasks: '任务', 'in-progress': '进行中', completed: '已完成', archived: '已归档' }
  var PROP_LABEL = { draft: '草稿', 'under-review': '评审中', accepted: '已接受', rejected: '已拒绝', superseded: '已替代' }
  function featLabel(st) { return FEAT_LABEL[st] || st }
  function propLabel(st) { return PROP_LABEL[st] || st }
  function stMatch(t, q) {
    q = q.toLowerCase()
    return t.title.toLowerCase().indexOf(q) >= 0 || t.key.toLowerCase().indexOf(q) >= 0 ||
      (t.type || '').toLowerCase().indexOf(q) >= 0 || t.status.toLowerCase().indexOf(q) >= 0 ||
      (ST_LABEL[t.status] || '').indexOf(q) >= 0
  }
  /* ── 默认排序:活跃在前,同类按创建序 ── */
  var TASK_SORT = { in_progress: 0, blocked: 1, pending: 2, suspended: 3, completed: 4, skipped: 5, rejected: 6 }
  var PROP_SORT = { 'under-review': 0, draft: 1, accepted: 2, rejected: 3, superseded: 4 }
  var FEAT_SORT = { 'in-progress': 0, tasks: 1, design: 2, prd: 3, completed: 4, archived: 5 }
  function byStatus(sortMap) {
    return function (a, b) {
      var pa = sortMap[a.status] !== undefined ? sortMap[a.status] : 99
      var pb = sortMap[b.status] !== undefined ? sortMap[b.status] : 99
      return pa === pb ? 0 : pa - pb
    }
  }
  /* 按创建时间排序(新→旧) */
  function byCreatedDesc(a, b) {
    var ca = a.created_at || a.key || '', cb = b.created_at || b.key || ''
    return cb.localeCompare(ca)
  }
  /* 统一排序入口:按 S.ov.sort 分发;getSt 可选——从条目提取状态(默认条目.status) */
  var SORT_LABEL = { status: '活跃优先', created: '最新创建' }
  function sortList(arr, sortMap, getSt) {
    var st = getSt || function (x) { return x.status }
    if (S.ov.sort === 'created') return arr.slice().sort(byCreatedDesc)
    return arr.slice().sort(function (a, b) { return byStatus(sortMap)({ status: st(a) }, { status: st(b) }) })
  }
  /* R1:概览 tab 是否激活(正确判定——按 tab kind 查 id 再比 active) */
  function overviewActive() {
    var ov = dockFind('dswf-overview')
    return !!(S.dock.open && ov && S.dock.active === ov.id)
  }

  var S, TR
  function seed() {
    S = {
      panel: 'session', sessionId: 's1', viewTab: 'chat',
      wsSearch: false, wsQ: '', projOpen: { p1: true },
      /* dock = 官方 ui-dockkit(DockSurface):tabs 页签模型(官方 guide entry → openTab(kind, {replaceTab:true})) */
      dock: { open: false, tabs: [{ id: 'g1', kind: 'guide', title: '开始' }], active: 'g1', nextId: 2, remembered: null, fullscreen: false },
      ov: { subtab: 'proposals', feat: 'm2-pipeline', chips: {}, open: {}, view: 'list', q: '', qFocus: false, rowOpen: {}, headOpen: false, sort: 'status' },
      drawer: null, taskDrawer: null, menu: null, suspect: false, dispatching: false
    }
    D.projects.forEach(function (p) { p.archived = false })
    D.tasks.forEach(function (t) { t.status = t._st0 || t.status; if (!t._st0) t._st0 = t.status })
    TR = {
      s1: [
        { who: 'user', text: '继续跑 2.4' },
        { who: 'agent', text: '就绪检查:2.4 前置 2.3 已完成。上一轮 executor 中断(record 缺失)——外环重派:' },
        { who: 'tool', name: 'claim_task', args: '{key:"m2-pipeline/2.4"}', result: '✓ 幂等重入(in_progress 不转移)· 简报重合成 digest 77a0c1e8 · 挂接行保持(s1)' },
        { who: 'sub', text: '〔executor 子会话 · s1-1〕按重合成简报继续执行 2.4 ……' }
      ],
      s2: [{ who: 'user', text: '对照 PRD 核对验收口径' }, { who: 'agent', text: '已核对:SC7/SC-M2 断言与 db-schema §4 单测锚点一致。' }],
      's1-1': [{ who: 'sub', text: '〔executor 子会话 · s1-1〕正在执行 2.4:tool 半身对接(消费 ctx.forgeProjects 同缝)。' }]
    }
    D.links.length = 0
    ;[
      { key: 'm2-pipeline/2.2', session: 's2', kind: 'link' }, { key: 'm2-pipeline/2.2', session: 's2', kind: 'exec' },
      { key: 'm2-pipeline/2.4', session: 's1', kind: 'link' }, { key: 'm2-pipeline/2.4', session: 's1-1', kind: 'exec' },
      { key: 'm2-pipeline/2.5', session: 's1', kind: 'link' }
    ].forEach(function (l) { D.links.push(l) })
  }
  seed()

  function task(k) { return D.tasks.find(function (t) { return t.key === k }) }
  function tasksOf(f) { return D.tasks.filter(function (t) { return t.key.indexOf(f + '/') === 0 }) }
  function feat(f) { return D.features.find(function (x) { return x.slug === f }) }
  function linksOf(k) { return D.links.filter(function (l) { return l.key === k }) }
  function linksOfSession(s) { return D.links.filter(function (l) { return l.session === s }) }
  function session() { return D.sessions.find(function (s) { return s.id === S.sessionId }) }
  function pushRec(k, verb, note) { (D.records[k] = D.records[k] || []).push({ verb: verb, at: '今天 ' + now(), note: note }) }
  function activeProjects() { return D.projects.filter(function (p) { return !p.archived }) }
  function rand() { return Math.random().toString(16).slice(2, 9) }

  /* ── 面板互换(layout.selectPanel 模拟;概览不占中区 = dockkit tab)+ dock 联动(rightbarViewPlan 同径) ── */
  function selectPanel(p) {
    var knowledge = p === 'knowledge'
    if (knowledge && S.dock.open) { S.dock.open = false; S.dock.remembered = true }
    else if (!knowledge && S.panel === 'knowledge' && S.dock.remembered === true) { S.dock.open = true; S.dock.remembered = null }
    S.panel = p
    renderAll()
  }
  /* dock tab 动作(官方形态:openTab(kind, {replaceTab}) / dock.addTab / close) */
  var TAB_KIND_META = {
    guide: { title: '开始' },
    files: { title: '工作区文件' },
    terminal: { title: '终端' },
    browser: { title: '浏览器' },
    'dswf-overview': { title: '项目概览' }
  }
  function dockOpenTab(kind, title, opts) {
    opts = opts || {}
    var d = S.dock
    d.open = true
    /* 文档 tab:按 rel 去重(同文档重开 = 激活已有 tab) */
    if (opts.docRel) {
      var existing = d.tabs.find(function (t) { return t.kind === 'doc' && t.docRel === opts.docRel })
      if (existing) { d.active = existing.id; renderAll(); return }
    }
    var ex = (!opts.docRel && kind !== 'doc') ? d.tabs.find(function (t) { return t.kind === kind }) : null
    if (ex) { d.active = ex.id }
    else if (opts.replaceTab) {
      var idx = d.tabs.findIndex(function (t) { return t.id === d.active })
      var tab = { id: 't' + d.nextId++, kind: kind, title: title, docRel: opts.docRel || null }
      if (idx >= 0) d.tabs[idx] = tab; else d.tabs.push(tab)
      d.active = tab.id
    } else {
      var tab2 = { id: 't' + d.nextId++, kind: kind, title: title, docRel: opts.docRel || null }
      d.tabs.push(tab2); d.active = tab2.id
    }
    renderAll()
  }
  function dockAddTab() {
    var d = S.dock
    var g = d.tabs.find(function (t) { return t.kind === 'guide' })
    if (g) { d.active = g.id } else { d.tabs.push({ id: 't' + d.nextId++, kind: 'guide', title: '开始' }); d.active = d.tabs[d.tabs.length - 1].id }
    d.open = true
    renderAll()
  }
  function dockCloseTab(id) {
    var d = S.dock
    var tab = d.tabs.find(function (t) { return t.id === id })
    if (!tab) return
    if (tab.kind === 'guide' && d.tabs.length === 1) return   /* guide 为唯一 tab 时不关(dock 底板) */
    d.tabs = d.tabs.filter(function (t) { return t.id !== id })
    if (d.active === id) d.active = d.tabs.length ? d.tabs[d.tabs.length - 1].id : null
    if (!d.tabs.length) { d.tabs.push({ id: 't' + d.nextId++, kind: 'guide', title: '开始' }); d.active = d.tabs[0].id }
    renderAll()
  }
  function dockFind(kind) { return S.dock.tabs.find(function (t) { return t.kind === kind }) }
  function phase() { return activeProjects().length === 0 ? 'hero' : S.panel }

  /* ── 渲染总入口 ── */
  function renderAll() {
    renderSidebar(); renderCenter(); renderRightbar(); renderOverlays()
  }

  function renderSidebar() {
    $('#row-knowledge').classList.toggle('active', S.panel === 'knowledge')
    $('#ws-searchrow').hidden = !S.wsSearch
    var q = S.wsQ.trim().toLowerCase()
    var html = ''
    D.projects.forEach(function (p) {
      var sess = D.sessions.filter(function (s) { return s.parent === null })
      if (q && p.name.toLowerCase().indexOf(q) < 0 && !sess.some(function (s) { return s.title.toLowerCase().indexOf(q) >= 0 })) return
      var open = !!S.projOpen[p.id]
      html += '<div class="proj-row" data-act="proj-toggle" data-p="' + p.id + '" role="treeitem" aria-expanded="' + open + '">' +
        '<span class="proj-caret">' + (open ? '▾' : '▸') + '</span><span aria-hidden="true">' + (open ? '📂' : '📁') + '</span>' +
        '<span class="ellipsis" style="flex:1;min-width:0">' + esc(p.name) + '</span>' +
        (p.archived ? '<span class="state-dot warn" title="已归档(只读)"></span>' : '<span class="state-dot ok breathing" title="有运行中会话"></span>') +
        '<button class="icon-btn sess-more" data-act="proj-menu" data-p="' + p.id + '" title="项目动作" aria-label="项目动作">⋯</button></div>'
      if (open) {
        var kids = D.sessions.filter(function (s) { return (s.parent === null) || (S.sessionId && s.parent === S.sessionId) })
        kids = kids.filter(function (s) {
          if (s.parent) return true
          return !q || s.title.toLowerCase().indexOf(q) >= 0 || p.name.toLowerCase().indexOf(q) >= 0
        })
        html += kids.map(function (s) {
          var sub = !!s.parent
          return '<div class="sess-row' + (sub ? ' sub' : '') + (s.id === S.sessionId ? ' active' : '') + '" data-act="sess-open" data-s="' + esc(s.id) + '">' +
            '<span class="state-dot ' + (s.running ? 'ok breathing' : 'idle') + '" title="' + (s.running ? '运行中' : '已结束') + '"></span>' +
            '<span class="ellipsis" style="flex:1;min-width:0" title="' + esc(s.title) + '">' + (sub ? '· ' : '') + esc(s.title) + '</span>' +
            '<button class="icon-btn sess-more" data-act="sess-menu" data-s="' + esc(s.id) + '" aria-label="会话动作">⋯</button></div>'
        }).join('')
      }
    })
    $('#ws-list').innerHTML = html || '<div class="kb-empty" style="padding:14px">无匹配</div>'
  }

  function renderCenter() {
    var ph = phase()
    $('#center').setAttribute('data-panel', ph)
    $('#conv-panel').hidden = ph !== 'session'
    $('#kn-panel').hidden = ph !== 'knowledge'
    $('#hero-panel').hidden = ph !== 'hero'
    if (ph === 'session') renderConv()
  }

  /* ── 会话面板(官方 ConversationRoot 形态)+ M2 挂接 pill ── */
  function renderConv() {
    var s = session()
    $('#conv-title').textContent = s ? s.title : '新会话'
    /* M2 delta:session.header actions 位 = 挂接 pills(双数据源并集,≤2 + 溢出) */
    var ls = s ? linksOfSession(s.id) : []
    var pills = ls.slice(0, 2).map(function (l) {
      var t = task(l.key)
      return '<button class="pill is-button" data-act="task-goto" data-key="' + esc(l.key) + '" title="挂接任务(' + (l.kind === 'link' ? '派发会话 · claim 挂接行' : '执行会话 · records.session_id') + ')——点击定位概览">⟞ ' + esc(l.key.split('/').pop()) +
        ' · <span class="state-dot ' + (t ? ST_DOT[t.status] : 'idle') + '"></span>' + (t ? ' ' + esc(ST_LABEL[t.status]) : '') + '</button>'
    }).join('')
    if (ls.length > 2) pills += '<button class="pill is-button" data-act="links-overflow" title="全部挂接">+' + (ls.length - 2) + '</button>'
    $('#conv-actions').innerHTML = pills

    $$('.seg-tab').forEach(function (b) {
      var on = b.getAttribute('data-v') === S.viewTab
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on)
    })
    var body = $('#conv-body')
    if (S.viewTab === 'chat') {
      body.innerHTML = (TR[S.sessionId] || []).map(function (m) {
        if (m.who === 'tool') return '<div class="toolrow"><span class="tname">⚙ ' + esc(m.name) + '</span><span class="targs">' + esc(m.args) + '</span><span class="tres">' + esc(m.result) + '</span></div>'
        if (m.who === 'sub') return '<div class="msg sub"><span class="who">' + esc(m.text.split('〕')[0] + '〕') + '</span><div>' + esc(m.text.replace(/^〔[^〕]*〕/, '')) + '</div></div>'
        return '<div class="msg ' + m.who + '"><div>' + esc(m.text) + '</div></div>'
      }).join('') || '<div class="traj-empty">发送消息开始会话(输入「跑任务」演示 M2 派发链)</div>'
      body.scrollTop = body.scrollHeight
    } else if (S.viewTab === 'traj') {
      body.innerHTML = '<div class="traj-empty">轨迹 = 官方 trajectory 视图(fix-29 直用)——执行台账略。</div>'
    } else {
      body.innerHTML = '<div class="recall-empty">知识召回 = 产品 dswf-recall 页签(P1 交付面)——本原型略。</div>'
    }
  }

  /* ── 概览 tab:P1-P5 全面打磨版 ──
     P4:ov-head 折叠(默认两行);子 tab 任务前置;sticky 子 tab+搜索
     P1:任务行主行收敛(ID+标题+状态tag);副行 11px tertiary(类型/优先级/前置/挂接/fix) */
  function renderOverview() {
    var SUB = [['proposals', '提案'], ['feature', 'feature'], ['tasks', '任务']]
    var p = D.projects[0]
    var activeFeat = D.features.find(function (x) { return x.status !== 'completed' }) || D.features[0]
    var running = D.sessions.filter(function (s) { return s.running }).length
    var doneToday = D.tasks.filter(function (t) { return t.status === 'completed' }).length
    var headOpen = S.ov.headOpen
    var info =
      '<div class="ov-head"><div class="ov-name">' + esc(p.name) +
      ' <span class="ov-status-line">' + esc(activeFeat ? activeFeat.slug : '—') + ' · <span class="state-dot ok breathing"></span>' + running + ' 会话 · ' + doneToday + ' 完成</span>' +
      (headOpen ? '' : ' <button class="btn btn-ghost btn-sm" data-act="ov-head-toggle" title="展开位置详情">▾</button>') + '</div>' +
      (headOpen
        ? '<div class="ov-info">' +
          '<div class="ov-info-row"><span class="ov-info-k">工作区</span><span class="ov-info-v ellipsis">' + esc(D.ws) + '</span></div>' +
          '<div class="ov-info-row"><span class="ov-info-k">文档位置</span><span class="ov-info-v ellipsis">' + esc(D.ws + '\\.forge') + '</span></div>' +
          '<div class="ov-info-row"><span class="ov-info-k">知识目录</span><span class="ov-info-v ellipsis">' + esc(D.ws + '\\.knowledge') + '</span></div>' +
          '<div class="ov-info-row"><span class="ov-info-k">任务清单</span><span class="ov-info-v ellipsis" title="' + esc(D.taskStore(D.ws)) + '">' + esc(D.taskStore(D.ws)) + '</span></div>' +
          '</div><div style="text-align:right"><button class="btn btn-ghost btn-sm" data-act="ov-head-toggle">▴ 收起</button></div>'
        : '') + '</div>' +
      /* P4/P5:sticky 区 = 子 tab + 搜索栏 */
      '<div class="ov-sticky">' +
      '<div class="ov-subtabs" role="tablist" aria-label="概览子视图">' + SUB.map(function (k) {
        return '<button class="ov-subtab' + (S.ov.subtab === k[0] ? ' active' : '') + '" role="tab" aria-selected="' + (S.ov.subtab === k[0]) + '" data-act="ov-subtab" data-st="' + k[0] + '">' + k[1] + '</button>'
      }).join('') + '</div>' +
      '<div class="ov-searchrow"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="ov-q" type="text" placeholder="搜索' + (S.ov.subtab === 'tasks' ? '标题/类型/状态(中英)' : S.ov.subtab === 'feature' ? 'feature/文档' : '提案/slug/状态') + '…" aria-label="概览搜索" value="' + esc(S.ov.q || '') + '">' +
      (S.ov.q ? '<button class="icon-btn" data-act="ov-q-clear" title="清除" aria-label="清除"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' : '') +
      '</div>' +
      '<div class="ov-sortrow"><button class="pill is-button ov-sort-pill" data-act="ov-sort-toggle" title="切换排序方式">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>' +
      SORT_LABEL[S.ov.sort] + '</button></div>' +
      '<div class="ov-content" id="ov-content"></div>'
    $('#rb-body').innerHTML = info
    var el = $('#ov-content')
    if (S.ov.subtab === 'tasks') el.innerHTML = ovTasks()
    else if (S.ov.subtab === 'feature') el.innerHTML = ovFeature()
    else el.innerHTML = ovProposals()
    var q = $('#ov-q')
    if (q && S.ov.qFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length) }
  }
  function ovTasks() {
    var f = S.ov.feat
    var all = tasksOf(f)
    /* P2:搜索同时匹配中英 */
    var q = (S.ov.q || '').trim().toLowerCase()
    var ts = q ? all.filter(function (t) { return stMatch(t, q) }) : all
    var done = all.filter(function (t) { return t.status === 'completed' }).length
    var html = '<div class="ov-taskbar">' +
      '<button class="pill is-button task-feat-pill" data-act="feat-menu"><span class="fp-name ellipsis">' + esc(f) + '</span>' +
      '<span class="chip">' + esc(feat(f).status) + ' ' + done + '/' + all.length + '</span> ▾</button>' +
      '<span class="task-count-note">' + (q ? ts.length + '/' + all.length : all.length + ' 条') + '</span><span class="spacer"></span>' +
      '<div class="seg task-viewseg">' + [['list', '列表'], ['dag', 'DAG'], ['swim', '泳道']].map(function (v) {
        return '<button class="seg-btn' + (S.ov.view === v[0] ? ' active' : '') + '" data-act="ov-task-view" data-v="' + v[0] + '">' + v[1] + '</button>'
      }).join('') + '</div></div>'
    if (!all.length) return html + '<div class="kb-empty">本 feature 暂无任务<span class="t-aux">任务由 run-tasks / add_task 产生</span></div>' + ovFoot()
    if (!ts.length) return html + '<div class="kb-empty">无匹配「' + esc(S.ov.q) + '」的任务</div>' + ovFoot()
    /* P5:七态 chips 三视图统一过滤 */
    var on = ST_ORDER.filter(function (st) { return S.ov.chips[st] })
    var vis = on.length ? ts.filter(function (t) { return on.indexOf(t.status) >= 0 }) : ts
    var counts = {}
    ST_ORDER.forEach(function (st) { counts[st] = all.filter(function (t) { return t.status === st }).length })
    html += '<div class="m2-stchips">' + ST_ORDER.map(function (st) {
      var zero = counts[st] === 0
      return '<button class="st-chip' + (S.ov.chips[st] ? ' is-on' : '') + (zero ? ' is-zero' : '') + '" data-act="st-chip" data-st="' + st + '"' + (zero ? ' disabled title="无此状态任务"' : '') + '><span class="state-dot ' + ST_DOT[st] + '"></span>' + ST_LABEL[st] + '<span class="cnt">' + counts[st] + '</span></button>'
    }).join('') + (on.length ? '<button class="st-chip" data-act="st-clear">✕ 清过滤</button>' : '') + '</div>'
    if (!vis.length) return html + '<div class="kb-empty">当前过滤组合无任务</div>' + ovFoot()
    /* 排序:按 S.ov.sort 分发(活跃优先 / 最新创建) */
    vis = sortList(vis, TASK_SORT)
    if (S.ov.view === 'dag') return html + renderDag(vis) + ovFoot()
    if (S.ov.view === 'swim') return html + renderSwim(vis) + ovFoot()
    /* P1:列表视图——主行 ID+标题+状态,副行 11px 元数据 */
    var running = vis.filter(function (t) { return t.status === 'in_progress' || t.status === 'blocked' })
    if (running.length) html += '<div class="task-group-label">执行中(' + running.length + ')</div>' + running.map(row).join('')
    var rest = vis.filter(function (t) { return running.indexOf(t) < 0 })
    if (rest.length && running.length) html += '<div class="task-group-label">其余</div>'
    html += rest.map(row).join('')
    return html + ovFoot()
    function row(t) {
      var ls = linksOf(t.key)
      var r = '<div class="task-item' + (S.taskDrawer === t.key ? ' is-open' : '') + '" data-act="task-toggle" data-key="' + esc(t.key) + '" tabindex="0" role="button">' +
        '<div class="task-row' + (S.taskDrawer === t.key ? ' is-open' : '') + '" data-key="' + esc(t.key) + '">' +
        '<span class="task-id" title="' + esc(t.key) + '">' + esc(t.key.split('/').pop()) + '</span>' +
        '<span class="task-title ellipsis" title="' + esc(t.title) + '">' + esc(t.title) + '</span>' +
        '<span class="status-tag ' + ST_TAG[t.status] + '" title="' + esc(t.status) + '">' + esc(ST_LABEL[t.status]) + '</span>' +
        '<button class="icon-btn task-more" data-act="task-more" data-key="' + esc(t.key) + '" title="行操作">⋯</button></div>' +
        '<div class="task-sub">' +
        (t.type ? esc(t.type) : '') + (t.priority ? ' · ' + esc(t.priority) : '') +
        (t.deps.length ? ' · ←' + t.deps.length + ' 前置' : '') +
        (ls.length ? ' · <span data-act="task-links" data-key="' + esc(t.key) + '" style="color:var(--dsw-alias-link);cursor:pointer">⟞' + ls.length + ' 挂接</span>' : '') +
        (t.fix ? ' · fix→' + esc((t.source || '').split('/').pop()) : '') +
        '</div></div>'
      return r
    }
    function detail(t) {
      var tl = (D.records[t.key] || []).map(function (r) {
        return '<div class="tl-row"><span class="tl-verb' + (r.verb === 'auto-restore' ? ' v-restore' : r.verb === 'auto-block' ? ' v-block' : '') + '">' + esc(r.verb) + '</span><span class="tl-at">' + esc(r.at) + '</span><span class="tl-note ellipsis" title="' + esc(r.note) + '">' + esc(r.note) + '</span></div>'
      }).join('') || '<div class="tl-row"><span class="tl-note">(暂无执行记录)</span></div>'
      var ls = linksOf(t.key).map(function (l) {
        var s = D.sessions.find(function (x) { return x.id === l.session })
        return '<div class="tl-row"><span class="tl-verb">' + (l.kind === 'link' ? '派发 ⟞' : '执行 ⟞') + '</span><span class="tl-note"><span data-act="sess-open" data-s="' + esc(l.session) + '" style="color:var(--dsw-alias-link);cursor:pointer">' + esc(s ? s.title : l.session) + '</span></span></div>'
      }).join('')
      return '<div class="m2-task-detail">' + tl + ls + '<div class="task-detail-actions"><button class="btn btn-soft btn-sm" data-act="trans" data-key="' + esc(t.key) + '">转移状态…</button></div></div>'
    }
  }

  /* ── DAG 视图(P5:边加箭头;节点点击切列表展开) ── */
  function renderDag(ts) {
    var byKey = {}; ts.forEach(function (t) { byKey[t.key] = t })
    var level = {}
    function lvl(k) {
      if (level[k] != null) return level[k]
      var t = byKey[k]; if (!t) return 0
      var ds = (t.deps || []).filter(function (d) { return byKey[d] })
      level[k] = ds.length ? Math.max.apply(null, ds.map(lvl)) + 1 : 0
      return level[k]
    }
    ts.forEach(function (t) { lvl(t.key) })
    var cols = []
    ts.forEach(function (t) { var l = level[t.key]; cols[l] = cols[l] || []; cols[l].push(t) })
    cols.forEach(function (c) { c.sort(function (a, b) { return a.key < b.key ? -1 : 1 }) })
    var W = 170, H = 64, GX = 14, GY = 40, PAD = 8
    var pos = {}, maxPer = 0
    cols.forEach(function (c, li) { maxPer = Math.max(maxPer, c.length); c.forEach(function (t, ri) { pos[t.key] = { x: PAD + ri * (W + GX), y: PAD + li * (H + GY) } }) })
    var cw = PAD * 2 + maxPer * (W + GX) - GX, ch = PAD * 2 + cols.length * (H + GY) - GY
    /* P5:SVG defs 定义箭头 marker */
    var defs = '<defs><marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--dsw-alias-border-l3)"/></marker>' +
      '<marker id="dag-arrow-done" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--dsw-alias-state-success-primary)"/></marker></defs>'
    var edges = ''
    ts.forEach(function (t) {
      (t.deps || []).forEach(function (d) {
        if (!byKey[d] || !pos[d]) return
        var a = pos[d], b = pos[t.key]
        var x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y
        var my = Math.max(12, (y2 - y1) / 2)
        var done = byKey[d].status === 'completed'
        edges += '<path class="' + (done ? 'is-done' : '') + '" d="M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + my) + ',' + x2 + ' ' + (y2 - my) + ',' + x2 + ' ' + y2 + '" marker-end="url(#' + (done ? 'dag-arrow-done' : 'dag-arrow') + ')"/>'
      })
    })
    var nodes = ts.map(function (t) {
      var p = pos[t.key]
      var dot = ST_DOT[t.status] || 'idle'
      return '<div class="dag-node' + (t.status === 'completed' ? ' is-completed' : '') + '" style="left:' + p.x + 'px;top:' + p.y + 'px;height:' + H + 'px;width:' + W + 'px" data-act="dag-node-click" data-key="' + esc(t.key) + '" title="' + esc(t.title) + '">' +
        '<div class="dag-node-top"><span class="state-dot ' + dot + '"></span><span class="dag-node-key">' + esc(t.key.split('/').pop()) + '</span>' +
        (t.fix ? '<span class="chip" style="font-size:9px">fix</span>' : '') + '</div>' +
        '<div class="dag-node-title">' + esc(t.title.slice(0, 30)) + '</div></div>'
    }).join('')
    return '<div class="dag-wrap"><div class="dag-canvas" style="width:' + cw + 'px;height:' + ch + 'px">' +
      '<svg class="dag-svg" viewBox="0 0 ' + cw + ' ' + ch + '" preserveAspectRatio="none" aria-hidden="true">' + defs + edges + '</svg>' + nodes + '</div></div>' +
      '<div class="dag-legend"><span>前置在上 · 箭头指向后续任务</span><span><span class="state-dot done"></span> 完成</span><span><span class="state-dot ok live"></span> 执行中</span><span><span class="state-dot err"></span> 阻塞</span><span>点击节点 → 列表展开</span></div>'
  }

  /* ── 泳道视图(P5:0 计数列折叠) ── */
  function renderSwim(ts) {
    return '<div class="swim-wrap">' + ST_ORDER.map(function (st) {
      var cards = ts.filter(function (t) { return t.status === st })
      var dot = ST_DOT[st]
      /* P5:0 计数列折叠为窄头部(不可点,仅显示状态+0) */
      if (!cards.length) {
        return '<div class="swim-col swim-col-empty"><div class="swim-col-head" title="无此状态任务"><span class="state-dot ' + dot + '"></span><span>' + ST_LABEL[st] + '</span><span class="cnt">0</span></div></div>'
      }
      var body = cards.map(function (t) {
        var ls = linksOf(t.key)
        return '<div class="swim-card" data-act="dag-node-click" data-key="' + esc(t.key) + '" title="' + esc(t.title) + '">' +
          '<div class="sc-key">' + esc(t.key.split('/').pop()) + (t.fix ? ' <span class="chip" style="font-size:9px">fix</span>' : '') + '</div>' +
          '<div class="sc-title">' + esc(t.title.slice(0, 26)) + '</div>' +
          '<div class="sc-foot">' + (t.type ? '<span class="t-aux" style="font-size:9.5px">' + esc(t.type) + '</span>' : '') +
          (ls.length ? ' <span class="task-links" style="font-size:9.5px">⟞' + ls.length + '</span>' : '') + '</div></div>'
      }).join('')
      return '<div class="swim-col"><div class="swim-col-head"><span class="state-dot ' + dot + '"></span><span>' + ST_LABEL[st] + '</span><span class="cnt">' + cards.length + '</span></div>' + body + '</div>'
    }).join('') + '</div>'
  }
  function ovFoot() { return '<p class="ov-footnote">任务视图 feature 绑定(无全局汇总)· 应用不发起编排(只看不管);行点击展开执行时间线;转移状态 = 人类通道(from≠to + 原因必填);挂接会话见展开详情。</p>' }
  /* ── feature 子tab:feature 行(可展开元数据)+ 文档行(状态标签 + 操作按钮)——与提案子tab交互一致 ── */
  function ovFeature() {
    var q = (S.ov.q || '').trim().toLowerCase()
    var html = ''
    sortList(D.featureDocs, FEAT_SORT, function (fd) { return feat(fd.slug).status }).forEach(function (fd) {
      var f = feat(fd.slug)
      var docs = q ? fd.docs.filter(function (d) {
        return d.rel.toLowerCase().indexOf(q) >= 0 || d.kind.toLowerCase().indexOf(q) >= 0 || d.summary.toLowerCase().indexOf(q) >= 0
      }) : fd.docs
      var fMatch = !q || f.slug.toLowerCase().indexOf(q) >= 0 || (f.label || '').toLowerCase().indexOf(q) >= 0 || (f.summary || '').toLowerCase().indexOf(q) >= 0
      if (!fMatch && !docs.length) return
      var ts = tasksOf(fd.slug)
      var done = ts.filter(function (t) { return t.status === 'completed' }).length
      var isOpen = !!S.ov.rowOpen['feat:' + fd.slug]
      html += ovParentRow({
        open: isOpen, key: 'feat:' + fd.slug,
        title: f.slug, statusChip: featLabel(f.status) + ' ' + done + '/' + ts.length, statusRaw: f.status,
        toggleAct: 'ov-row-toggle'
      })
      if (isOpen) {
        var prop = D.proposals.find(function (p) { return p.slug === f.proposal_id })
        html += ovParentMeta([
          ['摘要', f.summary || '—'],
          ['来源提案', prop ? prop.title + '(' + propLabel(prop.status) + ')' : '—'],
          ['任务', done + '/' + ts.length + ' 完成 · ' + ST_ORDER.map(function (st) { var n = ts.filter(function (t) { return t.status === st }).length; return n ? ST_LABEL[st] + ' ' + n : '' }).filter(Boolean).join(' · ')],
          ['文档', fd.docs.length + ' 篇(' + fd.docs.filter(function (d) { return d.dangling }).length + ' 悬空)'],
          ['创建/更新', (f.created_at || '—') + ' / ' + (f.updated_at || '—')]
        ])
      }
      docs.forEach(function (d) { html += ovDocRow(d, q) })
    })
    return html + '<p class="ov-footnote2">docs/features/ · 仓内只读;行点击展开元数据;文档不含提案(提案子tab专属)。</p>'
  }

  /* ── 提案子tab:提案行(可展开元数据)+ 文档行(状态标签 + 操作按钮)——与 feature 子tab交互一致 ── */
  function ovProposals() {
    var q = (S.ov.q || '').trim().toLowerCase()
    var list = sortList(q ? D.proposals.filter(function (p) {
      return p.slug.toLowerCase().indexOf(q) >= 0 || p.title.toLowerCase().indexOf(q) >= 0 ||
        p.status.toLowerCase().indexOf(q) >= 0 || (PROP_LABEL[p.status] || '').indexOf(q) >= 0 || (p.summary || '').toLowerCase().indexOf(q) >= 0
    }) : D.proposals, PROP_SORT)
    var html = ''
    list.forEach(function (p) {
      var isOpen = !!S.ov.rowOpen['prop:' + p.id]
      html += ovParentRow({
        open: isOpen, key: 'prop:' + p.id,
        title: p.title || p.slug, statusChip: propLabel(p.status), statusRaw: p.status,
        toggleAct: 'ov-row-toggle'
      })
      if (isOpen) {
        var fs = D.features.filter(function (f) { return f.proposal_id === p.id })
        html += ovParentMeta([
          ['slug', p.slug],
          ['摘要', p.summary || '—'],
          ['作者', p.author || '—'],
          ['创建', p.created_at || '—'],
          ['裁决', p.decided_at ? p.decided_at + ' → ' + propLabel(p.status) : '—(评审中)'],
          ['谱系', fs.length ? '→ ' + fs.map(function (f) { return f.slug + '(' + featLabel(f.status) + ')' }).join(', ') : '—(无 feature)']
        ])
      }
      html += ovDocRow({ kind: 'proposal', rel: p.doc_path, summary: p.summary, dangling: false }, q)
    })
    if (!list.length) html += '<div class="kb-empty">无匹配「' + esc(S.ov.q) + '」的提案</div>'
    return html + '<p class="ov-footnote2">docs/proposals/ · 五态 · 仓内只读(SC8);行点击展开元数据。</p>'
  }

  /* ── 共用:父行(feature/提案——展开/收起元数据) ── */
  function ovParentRow(o) {
    return '<div class="tree-row dir ov-parent' + (o.open ? ' is-open' : '') + '" data-act="' + o.toggleAct + '" data-key="' + esc(o.key) + '" tabindex="0" role="button" aria-expanded="' + !!o.open + '">' +
      '<span class="proj-caret">' + (o.open ? '▾' : '▸') + '</span>' +
      '<span class="ellipsis" style="flex:1;min-width:0">' + esc(o.title) + '</span>' +
      '<span class="chip" title="' + esc(o.statusRaw || '') + '">' + esc(o.statusChip) + '</span>' +
      '<button class="icon-btn task-more" data-act="ov-row-more" data-key="' + esc(o.key) + '" title="操作">⋯</button></div>'
  }
  /* ── 共用:父行展开的元数据块 ── */
  function ovParentMeta(rows) {
    return '<div class="m2-task-detail" style="margin:2px 8px 6px 26px">' +
      rows.map(function (r) {
        return '<div class="tl-row"><span class="tl-verb">' + esc(r[0]) + '</span><span class="tl-note">' + esc(r[1]) + '</span></div>'
      }).join('') + '</div>'
  }
  /* ── 共用:文档行(P3:整行可点开抽屉;名称 + 状态标签紧贴 + › 箭头) ── */
  function ovDocRow(d, q) {
    var name = d.rel.split('/').pop()
    if (q && name.toLowerCase().indexOf(q) < 0 && d.kind.toLowerCase().indexOf(q) < 0 && (d.summary || '').toLowerCase().indexOf(q) < 0) return ''
    return '<div class="tree-row file ov-doc' + (d.dangling ? ' is-dangling' : '') + '" data-act="doc-open" data-rel="' + esc(d.rel) + '" data-dangling="' + (d.dangling ? '1' : '') + '" data-kind="' + esc(d.kind) + '" data-summary="' + esc(d.summary) + '" tabindex="0" role="button">' +
      '<span aria-hidden="true" style="padding-left:22px">' + (d.dangling ? '⚠' : '📄') + '</span>' +
      '<span class="ellipsis" style="min-width:0;flex:none;max-width:45%" title="' + esc(d.summary) + '">' + esc(name) + '</span>' +
      '<span class="chip' + (d.dangling ? ' chip-dangling' : '') + '">' + esc(d.dangling ? '悬空' : d.kind) + '</span>' +
      '<span class="spacer"></span><span class="ov-doc-arrow" aria-hidden="true">›</span></div>'
  }

  /* ── 右栏 = 官方 ui-dockkit(DockSurface):tabs 页签条 + ＋;开始 tab = dsh 官方 GuideBody;概览 tab = 总纲原型形态(M2 delta) ── */
  function renderRightbar() {
    var rb = $('#rightbar')
    rb.classList.toggle('is-collapsed', !S.dock.open)
    rb.classList.toggle('is-fullscreen', !!S.dock.fullscreen)
    if (!S.dock.open) return
    var d = S.dock
    $('#rb-chips').innerHTML = d.tabs.map(function (t) {
      return '<div class="rb-chip' + (d.active === t.id ? ' active' : '') + '" data-act="dock-tab" data-id="' + esc(t.id) + '" role="tab" aria-selected="' + (d.active === t.id) + '" title="' + esc(t.title) + (t.kind === 'dswf-overview' ? '(M2 dockkit tab——任务看板 / 文档浏览)' : '页(dock.addTab)') + '">' +
        (t.kind === 'guide' ? '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="currentColor"/><path d="M10.6101 5.39014L8.99014 8.99014L5.39014 10.6101L7.01014 7.01014L10.6101 5.39014Z" fill="currentColor"/></svg>' : '') +
        '<span class="ellipsis">' + esc(t.title) + '</span>' + (t.kind === 'dswf-overview' ? '<span class="chip chip-m2">M2</span>' : '') +
        '<span class="chip-x" data-act="dock-close" data-id="' + esc(t.id) + '" role="button" aria-label="关闭"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></span></div>'
    }).join('')
    var active = d.tabs.find(function (t) { return t.id === d.active })
    if (!active) { renderGuide(); return }
    switch (active.kind) {
      case 'dswf-overview': renderOverview(); break
      case 'files': renderFilesTab(); break
      case 'terminal': renderTerminalTab(); break
      case 'browser': renderBrowserTab(); break
      case 'doc': renderDocTab(active); break
      default: renderGuide()
    }
  }

  /* ── 文档 tab:只读 Markdown 渲染 + mermaid 占位卡(dsh 原生不支持 mermaid——产品扩展点) ── */
  function renderDocTab(tab) {
    var rel = tab.docRel
    var isDangling = !!tab.docDangling
    var full = rel
    var head = '<div class="doc-tab-head">' +
      '<span aria-hidden="true">' + (isDangling ? '⚠' : '📄') + '</span><span class="doc-title ellipsis">' + esc(rel.split('/').pop()) + '</span>' +
      '<span class="chip" title="应用对代码仓与文档位置零写入(SC3)">只读</span>' +
      (isDangling ? '<span class="chip chip-dangling">悬空</span>' : '') + '</div>'
    var pathbar = '<div class="doc-pathbar"><span class="p ellipsis" title="' + esc(full) + '">' + esc(full) + '</span>' +
      '<button class="icon-btn" data-act="doc-editor" data-path="' + esc(full) + '" title="在编辑器中打开(系统关联 · 应用零写入)">📁</button>' +
      '<button class="icon-btn" data-act="doc-reread" title="重新读取(只读)">↻</button></div>'
    if (isDangling) {
      $('#rb-body').innerHTML = head + pathbar +
        '<div class="doc-dangling"><div class="warn-ico">⚠</div><div class="t-title">文档引用悬空</div>' +
        '<p class="t-aux" style="margin-top:6px">文件不在当前分支或已被移动——只读缺省渲染,不崩溃、不写入、不删行;<br>切回含此文件的分支后 ↻ 重读即可。</p></div>'
      return
    }
    var content = D.docs[rel] || '# ' + rel.split('/').pop() + '\n\n(占位内容)'
    var abs = tab.docSummary ? '<div class="doc-abs" style="margin:0 0 10px;padding:8px 12px;border-radius:var(--r-card);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:12.5px">' + esc(tab.docSummary) + '</div>' : ''
    $('#rb-body').innerHTML = head + pathbar + abs +
      '<div class="doc-tab-body">' + mdWithDiagrams(content) + '</div>'
  }

  /* Markdown 渲染 + mermaid 代码块占位卡 */
  function mdWithDiagrams(src) {
    var lines = String(src).split('\n'), out = '', inCode = false, inMermaid = false, codeLang = '', codeBuf = [], para = []
    function fp() { if (para.length) { out += '<p>' + para.join(' ') + '</p>'; para = [] } }
    function flushCode() {
      if (inMermaid) {
        out += '<div class="mermaid-card" data-mermaid="1"><div class="mc-head"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3h3v3H3zM10 3h3v3h-3zM3 10h3v3H3zM10 10h3v3h-3z"/><path d="M6 4.5h4M4.5 6v4M11.5 6v4"/></svg> Diagram</div><pre class="mc-code">' + esc(codeBuf.join('\n')) + '</pre><div class="mc-note">dsh 原生不支持 mermaid——产品扩展点(tech-design 裁决渲染方案)</div></div>'
      } else if (codeBuf.length) {
        out += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'
      }
      codeBuf = []; inMermaid = false; inCode = false; codeLang = ''
    }
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i]
      var fence = l.match(/^```(\w*)/)
      if (fence) {
        if (inCode) { flushCode() }
        else { fp(); inCode = true; codeLang = fence[1] || ''; if (codeLang === 'mermaid') inMermaid = true }
        continue
      }
      if (inCode) { codeBuf.push(l); continue }
      if (/^## /.test(l)) { fp(); out += '<h2>' + esc(l.slice(3)) + '</h2>' }
      else if (/^# /.test(l)) { fp(); out += '<h1>' + esc(l.slice(2)) + '</h1>' }
      else if (/^> /.test(l)) { fp(); out += '<blockquote>' + esc(l.slice(2)) + '</blockquote>' }
      else if (/^- /.test(l)) { fp(); out += '<ul><li>' + esc(l.slice(2)) + '</li></ul>' }
      else if (l.trim() === '') { fp() }
      else para.push(esc(l))
    }
    if (inCode) flushCode()
    fp()
    return out
  }

  /* ── 原生 tab 类型(dsh 现态——与原生行为一致:入口卡点击 → openTab(replaceTab) → 在本 dock 开出) ── */
  function renderFilesTab() {
    /* 工作区文件:浏览当前项目工作区的文件(与 dsh sidebar-files 行为一致) */
    var p = D.projects[0]
    var tree = [
      { depth: 0, icon: '📂', name: '.forge', hint: 'forge 目录(只读引用)' },
      { depth: 1, icon: '📄', name: 'tasks/', hint: '' },
      { depth: 0, icon: '📂', name: 'docs', hint: '' },
      { depth: 1, icon: '📂', name: 'proposals', hint: '' },
      { depth: 2, icon: '📄', name: 'dsh-forge-m2-pipeline', hint: '' },
      { depth: 1, icon: '📂', name: 'features', hint: '' },
      { depth: 0, icon: '📂', name: '.knowledge', hint: '知识库目录' },
      { depth: 0, icon: '📄', name: 'package.json', hint: '' },
      { depth: 0, icon: '📄', name: 'README.md', hint: '' }
    ]
    $('#rb-body').innerHTML =
      '<div class="panel-head" style="padding:10px 2px 4px"><span class="t-title">工作区文件</span>' +
      '<span class="t-aux ellipsis" style="flex:1;min-width:0">' + esc(D.ws) + '</span></div>' +
      '<div class="ov-content">' + tree.map(function (n) {
        return '<div class="tree-row file" style="padding-left:' + (8 + n.depth * 16) + 'px" data-act="noop">' +
          '<span aria-hidden="true">' + n.icon + '</span><span class="ellipsis" style="flex:1">' + esc(n.name) + '</span>' +
          (n.hint ? '<span class="t-aux" style="font-size:10px">' + esc(n.hint) + '</span>' : '') + '</div>'
      }).join('') + '</div>'
  }
  function renderTerminalTab() {
    $('#rb-body').innerHTML =
      '<div class="panel-head" style="padding:10px 2px 4px"><span class="t-title">终端</span>' +
      '<span class="t-aux">PowerShell · 工作区 shell 会话</span></div>' +
      '<div class="ov-content"><pre style="font-family:var(--font-code);font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:8px 10px;background:var(--dsw-alias-interactive-bg-hover);border-radius:var(--r-card);overflow:auto;min-height:160px">PS ' + esc(D.ws) + '&gt; _</pre></div>'
  }
  function renderBrowserTab() {
    $('#rb-body').innerHTML =
      '<div class="panel-head" style="padding:10px 2px 4px"><span class="t-title">浏览器</span></div>' +
      '<div style="padding:0 4px"><input style="width:100%;border:var(--hairline) solid var(--dsw-alias-border-l3);border-radius:10px;padding:7px 10px;background:var(--dsw-specific-input-major);font-size:13px" placeholder="输入 HTTP(S) 地址…(Ctrl+T)"></div>' +
      '<div class="ov-content"><div class="kb-empty" style="padding-top:36px">输入地址开始浏览<span class="t-aux">dsh sidebar-browser(原型示意)</span></div></div>'
  }

  /* 开始 tab = dsh 官方 GuideBody 逐形态 + M2 delta 入口卡追加(非替换原生)。
     原生 entries 来自各 sidebar-* 插件 sidebarRightTabs.register({ guide: [...] }) 的 guide 数组;
     M2 经同一 API 追加 kind:"dswf-overview" 的 tab type + guide entry(项目概览)——不覆盖原生。 */
  var COMPASS = '<svg viewBox="0 0 16 16" width="56" height="56" fill="none" aria-hidden="true"><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="currentColor"/><path d="M10.6101 5.39014L8.99014 8.99014L5.39014 10.6101L7.01014 7.01014L10.6101 5.39014Z" fill="currentColor"/></svg>'
  function renderGuide() {
    var entries = [
      /* dsh-forge M2 delta(排序最前——产品核心入口) */
      { kind: 'dswf-overview', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v5M9.5 12.5h5"/></svg>', title: '项目概览', desc: '任务看板 / 文档浏览(SC4)——feature 绑定 · 七态过滤 · 派发链', m2: true, act: 'dock-open-overview' },
      /* dsh 原生 entries(各 sidebar-* 插件经 sidebarRightTabs.register({ guide: [...] }) 注册;
         点击 → openTab(kind, {replaceTab:true}) —— 与 dsh 原生行为一致) */
      { kind: 'files', icon: '<svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.5 3h4l1.5 2h7.5v8a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5V3z"/></svg>', title: '工作区文件', desc: '浏览会话工作区的文件', shortcut: 'Ctrl+P', act: 'dock-open-tab', tabKind: 'files', native: true },
      { kind: 'terminal', icon: '<svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2.5L4 11M8 11h4"/></svg>', title: '新建终端', desc: '在会话工作区运行命令', shortcut: '', act: 'dock-open-tab', tabKind: 'terminal', native: true },
      { kind: 'browser', icon: '<svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c-3.2 3.4-3.2 9 0 12.4M8 1.8c3.2 3.4 3.2 9 0 12.4"/></svg>', title: '浏览器', desc: '浏览网页', shortcut: 'Ctrl+T', act: 'dock-open-tab', tabKind: 'browser', native: true }
    ]
    $('#rb-body').innerHTML =
      '<div class="dsw-guide" data-sidebar-right-guide="true">' +
      '<span class="dsw-guide-hero" aria-hidden="true">' + COMPASS + '</span>' +
      entries.map(function (e) {
        return '<div class="dsw-guide-cell"><button type="button" class="dsw-guide-entry" data-sidebar-right-guide-entry="' + esc(e.kind) + '" data-act="' + esc(e.act) + '"' + (e.tabKind ? ' data-tab-kind="' + esc(e.tabKind) + '"' : '') + '>' +
          '<span class="entry-icon">' + e.icon + '</span>' +
          '<span class="entry-text"><span class="entry-title">' + esc(e.title) +
          (e.m2 ? ' <span class="chip chip-m2">M2</span>' : '') +
          (e.native ? ' <span class="chip" style="font-size:9.5px;color:var(--dsw-alias-label-tertiary)">dsh</span>' : '') +
          '</span>' +
          (e.desc ? '<span class="entry-desc">' + esc(e.desc) + '</span>' : '') + '</span>' +
          (e.shortcut ? '<span class="dsw-shortcut">' + esc(e.shortcut) + '</span>' : '') +
          '</button></div>'
      }).join('') + '</div>'
  }

  /* ── 派发链走查(「跑任务」):transcript 演进 + 任务库即时写入 ── */
  function runDispatch() {
    if (S.dispatching) { toast('派发进行中……'); return }
    S.dispatching = true
    var tr = TR[S.sessionId] = TR[S.sessionId] || []
    var steps = [
      function () {
        tr.push({ who: 'user', text: '跑任务' })
        tr.push({ who: 'agent', text: '进入 run-tasks 派发循环——领取就绪任务:' })
        renderConv()
      },
      function () {
        var t = task('m2-pipeline/2.4')
        tr.push({ who: 'tool', name: 'claim_task', args: '{key:"m2-pipeline/2.4"}', result: '✓ ' + (t.status === 'in_progress' ? '幂等重入(in_progress 不转移)· 简报重合成 digest ' + rand() : 'pending → in_progress · digest ' + rand()) + ' · 挂接行 upsert(s1)' })
        pushRec('m2-pipeline/2.4', 'claim', '幂等重入(外环重派)· digest ' + rand() + '(会话 s1)')
        renderConv()
      },
      function () {
        tr.push({ who: 'agent', text: '以 dispatchPrompt 为初始提示词同步派发匿名 executor(阻塞):' })
        tr.push({ who: 'sub', text: '〔executor 子会话 · s1-1〕执行 2.4:质量门 compile ✓ / fmt ✓ / lint ✓ / test ✓' })
        renderConv()
      },
      function () {
        var t = task('m2-pipeline/2.4')
        t._st0 = t.status = 'completed'
        pushRec('m2-pipeline/2.4', 'submit', 'gate ✓ compile/fmt/lint/test · commit ' + rand() + '(执行会话 s1-1)')
        if (!linksOf('m2-pipeline/2.4').some(function (l) { return l.kind === 'exec' })) D.links.push({ key: 'm2-pipeline/2.4', session: 's1-1', kind: 'exec' })
        tr.push({ who: 'tool', name: 'submit_task', args: 'result=success · gate ✓ · commit', result: '✓ 2.4 in_progress → completed · 恢复钩子:2.5 前置含 fix-1(未终态)→ 不恢复' })
        tr.push({ who: 'agent', text: '2.4 完成。下一轮:fix-1 就绪(fix 链,block-source 边)→ 领取:' })
        renderConv(); if (overviewActive()) renderOverview()
      },
      function () {
        var f = task('m2-pipeline/fix-1')
        f._st0 = f.status = 'in_progress'
        pushRec('m2-pipeline/fix-1', 'claim', 'digest ' + rand() + '(会话 s1 · 挂接行 upsert)')
        D.links.push({ key: 'm2-pipeline/fix-1', session: 's1', kind: 'link' })
        tr.push({ who: 'tool', name: 'claim_task', args: '{key:"m2-pipeline/fix-1"}', result: '✓ fix-1 pending → in_progress · BLOCKERS 快照:源 2.4 已完成 · digest ' + rand() })
        tr.push({ who: 'sub', text: '〔executor 子会话 · s1-2〕执行 fix-1:修正工具注册名形(下划线形)→ gate 全过' })
        renderConv(); if (overviewActive()) renderOverview()
      },
      function () {
        var f = task('m2-pipeline/fix-1')
        f._st0 = f.status = 'completed'
        pushRec('m2-pipeline/fix-1', 'submit', 'gate ✓ · commit ' + rand() + '(执行会话 s1-2)')
        D.links.push({ key: 'm2-pipeline/fix-1', session: 's1-2', kind: 'exec' })
        tr.push({ who: 'tool', name: 'submit_task', args: 'result=success · gate ✓', result: '✓ fix-1 → completed' })
        renderConv(); if (overviewActive()) renderOverview()
      },
      function () {
        var t25 = task('m2-pipeline/2.5')
        var allTerm = t25.deps.every(function (d) { return TERM(task(d).status) }) && (!t25.source || TERM(task(t25.source).status))
        if (allTerm && t25.status === 'blocked') {
          t25._st0 = t25.status = 'pending'
          pushRec('m2-pipeline/2.5', 'auto-restore', '前置全满足(2.4 ✓ + fix-1 ✓)→ blocked→pending(边保留)')
          tr.push({ who: 'tool', name: '〔恢复钩子〕', args: '反查 prerequisite=fix-1', result: '✓ 2.5 blocked → pending(auto-restore · 边保留)——重派就绪' })
        }
        tr.push({ who: 'agent', text: '本轮完成:2.4 ✓ · fix-1 ✓ · 2.5 已恢复待领。概览面板即时可见(应用零编排)。' })
        S.dispatching = false
        renderConv(); if (overviewActive()) renderOverview()
        toast('派发链走查完成——概览任务列表即时刷新(单次重取即见)')
      }
    ]
    var i = 0
    ;(function next() {
      if (i >= steps.length) return
      steps[i++]()
      setTimeout(next, 700)
    })()
  }

  /* ── 弹层 ── */
  function renderOverlays() {
    var host = $('#layer-root')
    var html = ''
    if (S.menu) html += '<div class="layer" data-act="layer-close"></div><div class="menu" style="left:' + S.menu.x + 'px;top:' + S.menu.y + 'px">' + S.menu.html + '</div>'
    if (S.dialog) html += '<div class="dialog-mask" data-act="layer-close"><div class="dialog">' + S.dialog.html + '</div></div>'
    host.innerHTML = html
    /* 任务详情抽屉(S.taskDrawer) */
    var tdRoot = $('#task-drawer-root')
    if (!tdRoot) { tdRoot = document.createElement('div'); tdRoot.id = 'task-drawer-root'; document.body.appendChild(tdRoot) }
    tdRoot.innerHTML = S.taskDrawer ? taskDrawerHtml(S.taskDrawer) : ''
    /* 文档抽屉(S.drawer——保留用于悬空详情等;文档主路径已改为 dock tab) */
    var drawer = $('#doc-drawer-root')
    if (!drawer) { drawer = document.createElement('div'); drawer.id = 'doc-drawer-root'; document.body.appendChild(drawer) }
    drawer.innerHTML = S.drawer ? drawerHtml(S.drawer) : ''
  }
  /* ── 任务详情抽屉(模块化:通用区 + 按类型条件区 + 状态条件区 + 共用底部) ── */
  var TYPE_CATEGORY = { coding: '编码', doc: '文档', test: '测试', eval: '评估', validation: '验证', gate: '质量门', 'code-quality': '代码质量' }
  var TYPE_CAT_COLOR = { coding: 'var(--dsw-alias-link)', doc: 'rgb(139,92,246)', test: 'rgb(8,145,178)', eval: 'rgb(225,29,72)', validation: 'rgb(217,119,6)', gate: 'rgb(34,197,94)', 'code-quality': 'rgb(234,88,12)' }
  function typeCategory(t) { return (t.type || '').split('.')[0] }
  function isFixType(t) { return t.type === 'coding.fix' || t.type === 'doc.fix' }
  function isTestableType(t) { var c = typeCategory(t); return c === 'coding' || c === 'code-quality' }
  function isTestType(t) { var c = typeCategory(t); return c === 'test' }
  function isEvalType(t) { var c = typeCategory(t); return c === 'eval' || c === 'validation' }
  function isGateType(t) { return t.type === 'gate' }

  function taskDrawerHtml(key) {
    var t = task(key)
    if (!t) return ''
    var ls = linksOf(t.key)
    var cat = typeCategory(t)
    var catLabel = TYPE_CATEGORY[cat] || cat
    var catColor = TYPE_CAT_COLOR[cat] || 'var(--dsw-alias-label-tertiary)'
    var h = ''

    /* ── 通用区(全部类型) ── */
    h += '<aside class="task-drawer" role="dialog" aria-label="任务详情">'
    h += '<div class="task-drawer-head">' +
      '<button class="icon-btn" data-act="task-drawer-close" title="关闭(Esc)" aria-label="关闭"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<span class="state-dot ' + ST_DOT[t.status] + '"></span>' +
      '<span class="doc-title ellipsis" style="font-family:var(--font-code);font-size:13px">' + esc(t.key) + '</span>' +
      '<span class="status-tag ' + ST_TAG[t.status] + '">' + esc(ST_LABEL[t.status]) + '</span></div>'
    h += '<div style="padding:4px 16px 8px;font-size:14px;font-weight:500">' + esc(t.title) + '</div>'
    h += '<div style="padding:0 16px 12px;display:flex;gap:6px;flex-wrap:wrap">' +
      '<span class="chip" style="color:' + catColor + ';border-color:' + catColor + '">' + esc(catLabel) + ' · ' + esc(t.type) + '</span>' +
      (t.priority ? '<span class="chip">' + esc(t.priority) + '</span>' : '') +
      (t.est ? '<span class="chip">预估 ' + esc(t.est) + '</span>' : '') +
      (t.complexity ? '<span class="chip">' + esc(t.complexity) + '</span>' : '') +
      (t.breaking ? '<span class="chip" style="color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)">breaking</span>' : '') +
      '</div>'

    /* ── 状态条件区:blocked 原因 ── */
    if (t.status === 'blocked' && t.blocked_reason) {
      h += section('阻塞原因', '<div class="tl-row"><span class="tl-note" style="color:var(--dsw-alias-state-error-primary)">⚠ ' + esc(t.blocked_reason) + '</span></div>')
    }

    /* ── 前置依赖(通用) ── */
    if (t.deps.length) {
      h += section('前置依赖', t.deps.map(function (d) {
        var dt = task(d)
        return '<div class="tl-row"><span class="tl-verb">' + esc(d.split('/').pop()) + '</span><span class="tl-note">' + (dt ? ST_LABEL[dt.status] : '—') + '</span></div>'
      }).join(''))
    }

    /* ── 按类型条件区 ── */
    /* fix 链(coding.fix / doc.fix) */
    if (isFixType(t) && t.source) {
      var src = task(t.source)
      h += section('Fix 链', [
        '<div class="tl-row"><span class="tl-verb">来源任务</span><span class="tl-note">' + (src ? esc(src.key.split('/').pop()) + ' · ' + ST_LABEL[src.status] : esc(t.source)) + '</span></div>',
        t.root_cause ? '<div class="tl-row"><span class="tl-verb">根因</span><span class="tl-note">' + esc(t.root_cause) + '</span></div>' : '',
        t.source_files ? '<div class="tl-row"><span class="tl-verb">源文件</span><span class="tl-note t-code" style="font-size:10.5px">' + esc(t.source_files) + '</span></div>' : '',
        t.test_script ? '<div class="tl-row"><span class="tl-verb">测试脚本</span><span class="tl-note t-code" style="font-size:10.5px">' + esc(t.test_script) + '</span></div>' : ''
      ].join(''))
    }
    /* 覆盖率(coding.* / code-quality.*) */
    if (isTestableType(t) && t.coverage !== undefined) {
      var covColor = t.coverage >= 80 ? 'var(--dsw-alias-state-success-primary)' : t.coverage >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-error-primary)'
      h += section('覆盖率', '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">' +
        '<div style="flex:1;height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover)"><div style="width:' + t.coverage + '%;height:100%;border-radius:3px;background:' + covColor + '"></div></div>' +
        '<span style="font-family:var(--font-code);font-size:12px;color:' + covColor + '">' + t.coverage + '%</span></div>')
    }
    /* 测试面(test.*) */
    if (isTestType(t)) {
      h += section('测试面', [
        t.surface_key ? '<div class="tl-row"><span class="tl-verb">Surface</span><span class="tl-note">' + esc(t.surface_key) + ' (' + esc(t.surface_type || '?') + ')</span></div>' : '',
        '<div class="tl-row"><span class="tl-verb">测试类型</span><span class="tl-note">' + esc(t.type.includes('gen-journeys') ? 'Journey 生成' : t.type.includes('gen-contracts') ? 'Contract 生成' : t.type.includes('gen-scripts') ? '脚本生成' : '测试运行') + '</span></div>'
      ].join(''))
    }
    /* 质量门(gate) */
    if (isGateType(t) && t.gate_checks) {
      var gc = t.gate_checks
      var gcPct = gc.total ? Math.round(gc.passed / gc.total * 100) : 0
      h += section('质量门检查', '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">' +
        '<div style="flex:1;height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover)"><div style="width:' + gcPct + '%;height:100%;border-radius:3px;background:var(--dsw-alias-state-success-primary)"></div></div>' +
        '<span style="font-family:var(--font-code);font-size:12px">' + gc.passed + '/' + gc.total + '</span></div>')
    }
    /* 评估/验证(eval.* / validation.*) */
    if (isEvalType(t)) {
      var evalRows = []
      if (t.main_session) evalRows.push('<div class="tl-row"><span class="tl-verb">执行方式</span><span class="tl-note">🔑 主会话(不分发 executor)</span></div>')
      if (t.score !== undefined) evalRows.push('<div class="tl-row"><span class="tl-verb">得分</span><span class="tl-note" style="color:' + (t.score >= 70 ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)') + '">' + t.score + '/100</span></div>')
      if (t.severity) evalRows.push('<div class="tl-row"><span class="tl-verb">严重度</span><span class="tl-note">' + esc(t.severity) + '</span></div>')
      if (evalRows.length) h += section('评估结果', evalRows.join(''))
    }

    /* ── 共用底部:执行时间线 + 挂接 + 操作 ── */
    var tl = (D.records[t.key] || []).map(function (r) {
      return '<div class="tl-row"><span class="tl-verb' + (r.verb === 'auto-restore' ? ' v-restore' : r.verb === 'auto-block' ? ' v-block' : '') + '">' + esc(r.verb) + '</span><span class="tl-at">' + esc(r.at) + '</span><span class="tl-note">' + esc(r.note) + '</span></div>'
    }).join('') || '<div class="tl-row"><span class="tl-note">(暂无执行记录)</span></div>'
    h += section('执行时间线', tl)

    if (ls.length) {
      h += section('挂接会话', ls.map(function (l) {
        var s = D.sessions.find(function (x) { return x.id === l.session })
        return '<div class="tl-row"><span class="tl-verb">' + (l.kind === 'link' ? '派发 ⟞' : '执行 ⟞') + '</span><span class="tl-note"><span data-act="sess-open" data-s="' + esc(l.session) + '" style="color:var(--dsw-alias-link);cursor:pointer">' + esc(s ? s.title : l.session) + '</span></span></div>'
      }).join(''))
    }

    h += '<div style="padding:12px 16px"><button class="btn btn-soft btn-sm" data-act="trans" data-key="' + esc(t.key) + '">转移状态…</button></div>'
    h += '</aside>'
    return h
  }
  function section(title, body) {
    return '<div style="padding:0 16px;margin-bottom:8px"><div class="menu-label" style="padding:0 0 4px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary)">' + title + '</div>' + body + '</div>'
  }

  function drawerHtml(d) {
    var full = d.rel
    var head = '<div class="doc-drawer-head">' +
      '<button class="icon-btn" data-act="drawer-close" title="关闭(Esc)" aria-label="关闭"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<span aria-hidden="true">' + (d.dangling ? '⚠' : '📄') + '</span><span class="doc-title ellipsis">' + esc(d.rel.split('/').pop()) + '</span>' +
      '<span class="chip" title="应用对代码仓与文档位置零写入(SC3)">只读</span>' +
      (d.dangling ? '<span class="chip chip-dangling">悬空</span>' : '') + '</div>'
    var pathbar = '<div class="doc-pathbar"><span class="p ellipsis" title="' + esc(full) + '">' + esc(full) + '</span>' +
      '<button class="icon-btn" data-act="doc-editor" data-path="' + esc(full) + '" title="在编辑器中打开(系统关联 · 应用零写入)">📁</button>' +
      '<button class="icon-btn" data-act="doc-reread" title="重新读取(只读)">↻</button></div>'
    if (d.dangling) {
      return '<aside class="doc-drawer" role="dialog" aria-label="文档">' + head + pathbar +
        '<div class="doc-dangling"><div class="warn-ico">⚠</div><div class="t-title">文档引用悬空</div>' +
        '<p class="t-aux" style="margin-top:6px">文件不在当前分支或已被移动——只读缺省渲染,不崩溃、不写入、不删行;<br>切回含此文件的分支后 ↻ 重读即可。</p></div></aside>'
    }
    var abs = d.summary ? '<div class="doc-abs" style="margin:0 16px 10px;padding:8px 12px;border-radius:var(--r-card);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:12.5px">' + esc(d.summary) + '</div>' : ''
    return '<aside class="doc-drawer" role="dialog" aria-label="文档">' + head + pathbar + abs +
      '<div class="doc-drawer-body doc-body">' + md(D.docs[d.rel] || '# ' + d.rel.split('/').pop() + '\n\n(占位内容)') + '</div></aside>'
  }
  function openMenu(anchor, html) {
    var r = anchor.getBoundingClientRect()
    var m = { x: Math.min(r.left, window.innerWidth - 350), y: r.bottom + 6, html: html }
    if (m.y + 280 > window.innerHeight) m.y = Math.max(12, r.top - 284)
    S.menu = m; renderOverlays()
  }
  function closeLayers() { S.menu = null; S.dialog = null; renderOverlays() }
  function openDialog(html, keep) {
    S.menu = null
    S.dialog = { html: html, keep: !!keep }
    renderOverlays()
  }
  function toast(msg) {
    var wrap = $('.toast-wrap')
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap) }
    var t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; wrap.appendChild(t)
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .25s' }, 2800)
    setTimeout(function () { t.remove() }, 3100)
  }
  function md(src) {
    var lines = String(src).split('\n'), out = '', inCode = false, inList = false, para = []
    function fp() { if (para.length) { out += '<p>' + para.join(' ') + '</p>'; para = [] } }
    function fl() { if (inList) { out += '</ul>'; inList = false } }
    lines.forEach(function (l) {
      if (/^```/.test(l)) { fp(); fl(); out += inCode ? '</pre>' : '<pre>'; inCode = !inCode; return }
      if (inCode) { out += esc(l) + '\n'; return }
      if (/^## /.test(l)) { fp(); fl(); out += '<h2>' + esc(l.slice(3)) + '</h2>' }
      else if (/^# /.test(l)) { fp(); fl(); out += '<h1>' + esc(l.slice(2)) + '</h1>' }
      else if (/^> /.test(l)) { fp(); fl(); out += '<blockquote>' + esc(l.slice(2)) + '</blockquote>' }
      else if (/^- /.test(l)) { fp(); if (!inList) { out += '<ul>'; inList = true } out += '<li>' + esc(l.slice(2)) + '</li>' }
      else if (l.trim() === '') { fp(); fl() }
      else para.push(esc(l))
    })
    fp(); fl(); if (inCode) out += '</pre>'
    return out
  }

  /* ── 注册流(fix-14/16 现态:OS 目录选择器一步 → 表单) ── */
  function openOsPicker() {
    var dirs = [
      { p: 'Z:\\project\\dsh\\demo-proj', hint: 'demo 工程(建议)' },
      { p: 'Z:\\project\\dsh\\dsh-forge', hint: '本仓' },
      { p: 'Z:\\project\\ai\\pm-work-tracker', hint: '仓外(经旧线管理)' }
    ]
    openDialog('<h3>选择工作区目录 <span class="t-aux" style="font-weight:400">系统目录选择器(fix-14/16 现态——桥在场直开)</span></h3>' +
      '<div class="os-pick"><div class="os-pick-list">' + dirs.map(function (d, i) {
        return '<div class="os-pick-item' + (i === 0 ? ' sel' : '') + '" data-os-pick="' + esc(d.p) + '" role="option" aria-selected="' + (i === 0) + '">📁 <span class="t-code">' + esc(d.p) + '</span><span class="t-aux" style="margin-left:auto">' + esc(d.hint) + '</span></div>'
      }).join('') + '</div>' +
      '<div class="dialog-actions" style="margin-top:0"><button class="btn btn-ghost btn-sm" data-act="layer-close">取消</button><button class="btn btn-primary btn-sm" data-act="os-picked">选择</button></div></div>', false)
  }
  function openForm(ws) {
    openDialog('<h3>添加项目</h3>' +
      '<div class="form-row"><label>工作区目录(选择器回填)</label><input class="t-code" readonly value="' + esc(ws) + '"></div>' +
      '<div class="form-row"><label>项目名(自动)</label><input value="' + esc(ws.split('\\').pop()) + '"></div>' +
      '<div class="form-row"><label>文档位置 · forge 目录</label><input value="' + esc(ws + '\\.forge') + '"><span class="t-aux">默认 &lt;工作区&gt;\\.forge · 仓内只读引用</span></div>' +
      '<div class="form-row"><label>知识库目录</label><input value="' + esc(ws + '\\.knowledge') + '"></div>' +
      '<div class="form-row"><label>任务清单与记录(自动 · 无需填写)</label><input class="fb-static" id="ap-tasks" readonly tabindex="-1" value="' + esc(D.taskStore(ws)) + '" title="统一存放于 {dsh-forge-home}/{canonical-path 扁平化}@{hash8 消歧后缀},注册时自动派生(应用侧单源下发)"></div>' +
      '<div class="form-err" id="ap-err" hidden></div>' +
      '<div class="dialog-actions"><button class="btn btn-ghost btn-sm" data-act="layer-close">取消</button><button class="btn btn-primary btn-sm" data-act="form-confirm" data-ws="' + esc(ws) + '">确认</button></div>', true)
  }

  /* ── 事件分发 ── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]')
    if (!el) return
    var act = el.getAttribute('data-act')
    if (act === 'noop') return
    if (act === 'layer-close') {
      /* mask 自身点击才关层;对话框内非动作点击(输入控件聚焦等)不冒泡关闭 */
      if (el.classList.contains('dialog-mask') && e.target !== el) return
      closeLayers(); return
    }
    switch (act) {
      case 'panel': selectPanel(el.getAttribute('data-p')); break
      case 'panel-back': selectPanel('session'); break
      case 'rightbar-toggle': S.dock.open = !S.dock.open; renderRightbar(); break
      case 'dock-open-overview': dockOpenTab('dswf-overview', '项目概览', { replaceTab: true }); break
      case 'dock-open-tab': {
        var tk = el.getAttribute('data-tab-kind')
        dockOpenTab(tk, TAB_KIND_META[tk] ? TAB_KIND_META[tk].title : tk, { replaceTab: true })
        break
      }
      case 'dock-tab': S.dock.open = true; S.dock.active = el.getAttribute('data-id'); renderRightbar(); break
      case 'dock-add': dockAddTab(); break
      case 'dock-fullscreen': S.dock.fullscreen = !S.dock.fullscreen; renderRightbar(); if (overviewActive()) renderOverview(); break
      case 'dock-close': e.stopPropagation(); dockCloseTab(el.getAttribute('data-id')); break
      case 'new-session': selectPanel('session'); S.sessionId = null; TR[S.sessionId] = []; renderConv(); break
      case 'view-tab': S.viewTab = el.getAttribute('data-v'); renderConv(); break
      case 'proj-toggle': S.projOpen[el.getAttribute('data-p')] = !S.projOpen[el.getAttribute('data-p')]; renderSidebar(); break
      case 'proj-menu': openMenu(el, '<div class="menu-label">项目动作(fix-42 行语言)</div><div class="menu-item" data-act="noop">重命名…</div><div class="menu-item" data-act="noop">归档</div><div class="menu-item" data-act="noop">新建会话(startSession)</div>'); break
      case 'sess-open': S.sessionId = el.getAttribute('data-s'); selectPanel('session'); S.viewTab = 'chat'; break
      case 'sess-menu': openMenu(el, '<div class="menu-label">会话动作</div><div class="menu-item" data-act="noop">重命名…</div><div class="menu-item" data-act="noop">归档</div>'); break
      case 'ws-search': S.wsSearch = !S.wsSearch; renderSidebar(); if (S.wsSearch) $('#ws-q').focus(); break
      case 'ws-view-menu': openMenu(el, '<div class="menu-label">视图选项(fix-42)</div><div class="menu-item" data-act="noop">按项目树(缺省)</div><div class="menu-item" data-act="noop">平铺列表</div><div class="menu-sep"></div><div class="menu-item" data-act="noop">归档:仅显示 / 全部 / 隐藏</div>'); break
      case 'add-project': closeLayers(); openOsPicker(); break
      case 'os-picked': {
        var sel = document.querySelector('.os-pick-item.sel')
        if (!sel) { toast('请先选择一个目录'); return }
        openForm(sel.getAttribute('data-os-pick'))
        break
      }
      case 'form-confirm': {
        var err = $('#ap-err')
        if (S.suspect) {
          err.hidden = false
          err.innerHTML = '<div class="t">⚠ 检测到同主体旧目录——疑似工作区被移动,注册被拒</div>' +
            '<div class="t-aux" style="margin-top:4px">旧目录:<span class="t-code">' + esc(D.orphan) + '</span>(同扁平化主体 · 异 hash8)</div>' +
            '<div class="t-aux" style="margin-top:4px">请删除上述旧目录,或将工作区目录改回原名后重试——应用不自动迁移任务数据。</div>'
          toast('注册被拒:疑似工作区移动——按指引处理后重试(零副作用,不清理不认领)')
          return
        }
        var ws = el.getAttribute('data-ws')
        closeLayers()
        toast('已注册 · 任务库建于 <span class="t-code">' + esc(D.taskStore(ws)) + '</span>(与表单展示逐字一致)')
        break
      }
      case 'suspect-toggle': S.suspect = !S.suspect; toast(S.suspect ? '已模拟「疑似移动」——注册确认将被拒绝并给出手工指引' : '疑似移动模拟已关闭'); break
      case 'goto-hero': D.projects.forEach(function (p) { p.archived = true }); selectPanel('session'); toast('全部项目已归档 → 零项目 = hero 相位(panel-model.sessionZonePhase)'); break
      case 'theme-toggle': document.body.toggleAttribute('data-ds-dark-theme'); break
      case 'reset': seed(); renderAll(); toast('种子数据已还原'); break
      case 'send': doSend(); break
      /* 概览任务域 */
      case 'ov-subtab': S.ov.subtab = el.getAttribute('data-st'); S.ov.open = {}; S.ov.q = ''; S.ov.chips = {}; renderOverview(); break
      case 'ov-head-toggle': S.ov.headOpen = !S.ov.headOpen; renderOverview(); break
      case 'ov-sort-toggle': S.ov.sort = S.ov.sort === 'status' ? 'created' : 'status'; renderOverview(); break
      case 'ov-task-view': S.ov.view = el.getAttribute('data-v'); renderOverview(); break
      case 'ov-q-clear': S.ov.q = ''; renderOverview(); break
      case 'dag-node-click': {
        var dk = el.getAttribute('data-key')
        S.taskDrawer = dk
        renderOverlays()
        break
      }
      case 'ov-row-toggle': {
        if (e.target.closest('[data-act="ov-row-more"]')) break
        var rk = el.getAttribute('data-key')
        if (!rk) break
        S.ov.rowOpen[rk] = !S.ov.rowOpen[rk]; renderOverview(); break
      }
      case 'ov-row-more': {
        e.stopPropagation()
        var mk = el.getAttribute('data-key')
        var isFeat = mk.indexOf('feat:') === 0
        var slug = isFeat ? mk.slice(5) : ''
        openMenu(el, '<div class="menu-label">' + esc(isFeat ? slug : '提案') + ' 操作</div>' +
          '<div class="menu-item" data-act="noop">查看任务</div>' +
          '<div class="menu-item" data-act="noop">查看文档</div>' +
          '<div class="menu-sep"></div>' +
          '<div class="menu-item" data-act="noop">复制 slug</div>')
        break
      }
      case 'feat-menu': openMenu(el, '<div class="menu-label">feature 绑定(无全局汇总)</div>' + D.features.map(function (f) {
        var ts = tasksOf(f.slug), dn = ts.filter(function (t) { return t.status === 'completed' }).length
        return '<button class="menu-item' + (f.slug === S.ov.feat ? ' is-cur' : '') + '" data-act="feat-pick" data-f="' + esc(f.slug) + '"><span style="flex:1;min-width:0" class="ellipsis">' + esc(f.slug) + '</span><span class="chip">' + esc(f.status) + ' ' + dn + '/' + ts.length + '</span></button>'
      }).join('')); break
      case 'feat-pick': S.ov.feat = el.getAttribute('data-f'); S.ov.open = {}; closeLayers(); renderOverview(); break
      case 'st-chip': { var st = el.getAttribute('data-st'); S.ov.chips[st] = !S.ov.chips[st]; renderOverview(); break }
      case 'st-clear': S.ov.chips = {}; renderOverview(); break
      case 'task-toggle': {
        if (e.target.closest('[data-act="task-links"],[data-act="task-more"],[data-act="task-tool"],[data-act="trans"],[data-act="sess-open"]')) break
        var k = el.getAttribute('data-key')
        if (!k) break
        S.taskDrawer = S.taskDrawer === k ? null : k
        renderOverlays()
        if (overviewActive()) renderOverview()
        break
      }
      case 'task-tool': {
        /* ⚡ 模拟 forge 插件 tool 半身提交(消费宿主能力面):claim → submit + 审计 + 恢复钩子 */
        e.stopPropagation()
        var tk = task(el.getAttribute('data-key'))
        if (!tk) break
        var before = tk.status
        if (tk.status === 'pending') {
          tk._st0 = tk.status = 'in_progress'
          pushRec(tk.key, 'claim', 'digest ' + rand() + '(会话 ' + (S.sessionId || 's1') + ' · 挂接行 upsert)')
          D.links.push({ key: tk.key, session: S.sessionId || 's1', kind: 'link' })
        } else if (tk.status === 'in_progress') {
          tk._st0 = tk.status = 'completed'
          pushRec(tk.key, 'submit', 'gate ✓ compile/fmt/lint/test · commit ' + rand() + '(执行会话子会话)')
          var exec = D.sessions.find(function (s) { return s.parent === (S.sessionId || 's1') }) || D.sessions.find(function (s) { return s.id !== (S.sessionId || 's1') })
          D.links.push({ key: tk.key, session: exec ? exec.id : (S.sessionId || 's1'), kind: 'exec' })
          autoRestore()
        } else { toast('任务已终态(' + tk.status + ')'); break }
        renderOverview()
        toast('⚡ tool → 宿主能力面 → 任务库:' + tk.key.split('/').pop() + ' ' + before + ' → ' + tk.status + '(看板即时反映,应用零编排)')
        break
      }
      case 'task-more': {
        e.stopPropagation()
        var k2 = el.getAttribute('data-key'), t = task(k2)
        openMenu(el, '<div class="menu-label">行操作 · ' + esc(k2) + '(当前 ' + ST_LABEL[t.status] + ')</div>' +
          '<button class="menu-item" data-act="task-toggle" data-key="' + esc(k2) + '">查看详情</button>' +
          (linksOf(k2).length ? '<button class="menu-item" data-act="task-links" data-key="' + esc(k2) + '">查看挂接会话(⟞' + linksOf(k2).length + ')</button>' : '') +
          '<div class="menu-sep"></div>' +
          '<div class="menu-label">转移状态…</div>' +
          ST_ORDER.filter(function (st) { return st !== t.status }).map(function (st) {
            return '<button class="menu-item" data-act="trans" data-key="' + esc(k2) + '" data-preset="' + st + '">转 ' + ST_LABEL[st] + '</button>'
          }).join(''))
        break
      }
      case 'task-links': {
        e.stopPropagation()
        openMenu(el, '<div class="menu-label">挂接会话(派发 = 挂接表 · 执行 = records.session_id)</div>' + linksOf(el.getAttribute('data-key')).map(function (l) {
          var s = D.sessions.find(function (x) { return x.id === l.session })
          return '<button class="menu-item" data-act="sess-open" data-s="' + esc(l.session) + '"><span>' + (l.kind === 'link' ? '派发 ⟞' : '执行 ⟞') + '</span><span style="flex:1;min-width:0" class="ellipsis">' + esc(s ? s.title : l.session) + '</span></button>'
        }).join(''))
        break
      }
      case 'links-overflow': openMenu(el, '<div class="menu-label">本会话挂接任务(双数据源并集)</div>' + linksOfSession(S.sessionId).map(function (l) {
        var t = task(l.key)
        return '<button class="menu-item" data-act="task-goto" data-key="' + esc(l.key) + '"><span>' + (l.kind === 'link' ? '⟞ 派发 ' : '⟞ 执行 ') + esc(l.key) + '</span><span class="t-aux" style="margin-left:auto">' + esc(t ? ST_LABEL[t.status] : '') + '</span></button>'
      }).join('')); break
      case 'task-goto': {
        var key = el.getAttribute('data-key')
        S.ov.feat = key.slice(0, key.indexOf('/'))
        S.ov.subtab = 'tasks'
        S.taskDrawer = key
        closeLayers()
        if (!dockFind('dswf-overview')) dockOpenTab('dswf-overview', '项目概览')
        else { S.dock.open = true; S.dock.active = dockFind('dswf-overview').id; renderAll() }
        renderOverlays()
        break
      }
      case 'trans': openTransDialog(el.getAttribute('data-key'), el.getAttribute('data-preset')); break
      case 'trans-apply': {
        var to = $('#m2-to').value, why = $('#m2-why').value.trim()
        var key3 = el.getAttribute('data-key'), t3 = task(key3)
        if (!why) { toast('原因必填——人类通道审计要求'); return }
        if (to === t3.status) { toast('目标状态须不同于当前状态(from ≠ to)'); return }
        var from = t3.status
        t3._st0 = t3.status = to
        pushRec(key3, 'transition', from + ' → ' + to + ' · reason: ' + why)
        closeLayers()
        if (TERM(to)) autoRestore()
        renderAll()
        toast('已转移 ' + key3.split('/').pop() + ':' + from + ' → ' + to + '(reason 已留审计)')
        break
      }
      case 'doc-open': {
        var dRel = el.getAttribute('data-rel')
        var dDangling = el.getAttribute('data-dangling') === '1'
        var dKind = el.getAttribute('data-kind') || 'doc'
        var dSummary = el.getAttribute('data-summary') || ''
        var docTitle = dRel.split('/').pop()
        dockOpenTab('doc', docTitle, { docRel: dRel, docDangling: dDangling, docKind: dKind, docSummary: dSummary })
        break
      }
      case 'task-drawer-close': S.taskDrawer = null; renderOverlays(); if (overviewActive()) renderOverview(); break
      case 'drawer-close': S.drawer = null; renderOverlays(); break
      case 'doc-editor': toast('已请求系统编辑器打开(应用零写入):' + esc(el.getAttribute('data-path'))); break
      case 'doc-reread': toast('已重新读取(只读)'); break
      case 'proto-collapse': $('#proto-body').hidden = !$('#proto-body').hidden; break
    }
  })
  function openTransDialog(key, preset) {
    closeLayers()
    var t = task(key)
    var opts = ST_ORDER.filter(function (st) { return st !== t.status }).map(function (st) {
      return '<option value="' + st + '"' + (st === preset ? ' selected' : '') + '>' + ST_LABEL[st] + '(' + st + ')</option>'
    }).join('')
    openDialog('<h3>转移状态 · 人类通道 <span class="t-code t-aux" style="font-weight:400">' + esc(key) + '</span></h3>' +
      '<div class="sub">from ≠ to 任意 + 原因必填;与 agent 写入同门(core 动词),本操作留审计记录(transitionTask 不进 tool 面——UI 专属)。</div>' +
      '<div class="form-row"><label>当前状态</label><div>' + ST_LABEL[t.status] + '(' + t.status + ')</div></div>' +
      '<div class="form-row"><label>目标状态</label><select class="m2sel" id="m2-to">' + opts + '</select></div>' +
      '<div class="form-row"><label>原因(必填)</label><textarea class="m2reason" id="m2-why" placeholder="如:重开补一个遗漏的断言 / 人工跳过废弃方案…"></textarea></div>' +
      '<div class="dialog-actions"><button class="btn btn-ghost btn-sm" data-act="layer-close">取消(Esc)</button><button class="btn btn-primary btn-sm" data-act="trans-apply" data-key="' + esc(key) + '">确认转移</button></div>', true)
  }
  function autoRestore() {
    D.tasks.forEach(function (t) {
      if (t.status !== 'blocked') return
      var ok = t.deps.every(function (d) { return TERM(task(d).status) }) && (!t.source || TERM(task(t.source).status))
      if (ok) {
        t._st0 = t.status = 'pending'
        pushRec(t.key, 'auto-restore', '前置全满足 → blocked→pending(边保留)')
        toast('↻ auto-restore:' + t.key + ' blocked → pending(前置全满足)')
      }
    })
  }
  function doSend() {
    var input = $('#composer-input')
    var text = (input.textContent || '').trim()
    if (!text) return
    if (!S.sessionId) {
      var s = { id: 's' + rand(), parent: null, title: text.slice(0, 14), running: true }
      D.sessions.push(s); S.sessionId = s.id; TR[s.id] = []
      renderSidebar()
    }
    input.textContent = ''
    if (/跑任务|run-tasks/i.test(text)) { runDispatch(); return }
    TR[S.sessionId].push({ who: 'user', text: text })
    TR[S.sessionId].push({ who: 'agent', text: '(原型罐头应答)M2 交互焦点:输入「跑任务」走查派发链——claim_task → executor 子会话 → submit_task(gate)→ 概览即时刷新。' })
    renderConv()
  }
  /* R6:IME 安全——搜索输入只更新列表区,不重建搜索行(中文组合态不被打断) */
  document.addEventListener('input', function (e) {
    if (e.target.id === 'ws-q') { S.wsQ = e.target.value; renderSidebar(); var q = $('#ws-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length) }
    if (e.target.id === 'ov-q') {
      S.ov.q = e.target.value
      /* R6:只更新 ov-content + 清除按钮可见性(IME 安全——不重建搜索行) */
      var el = $('#ov-content')
      if (el) {
        if (S.ov.subtab === 'tasks') el.innerHTML = ovTasks()
        else if (S.ov.subtab === 'feature') el.innerHTML = ovFeature()
        else el.innerHTML = ovProposals()
      }
      /* 切换清除按钮可见性(手动,不重建搜索行) */
      var clearBtn = e.target.parentElement.querySelector('[data-act="ov-q-clear"]')
      if (!clearBtn && S.ov.q) {
        var btn = document.createElement('button')
        btn.className = 'icon-btn'; btn.setAttribute('data-act', 'ov-q-clear'); btn.title = '清除'
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'
        e.target.parentElement.appendChild(btn)
      } else if (clearBtn && !S.ov.q) {
        clearBtn.remove()
      }
    }
  })
  /* 键盘:Enter/Space 激活所有 tabindex=0 行(task-toggle / ov-row-toggle / doc-open / dag-node-click / dock-tab) */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (S.dialog || S.menu) closeLayers()
      else if (S.taskDrawer) { S.taskDrawer = null; renderOverlays(); if (overviewActive()) renderOverview() }
      else if (S.drawer) { S.drawer = null; renderOverlays() }
    }
    if (e.key === 'Enter') {
      if (e.target.id === 'composer-input') { e.preventDefault(); doSend() }
      if (e.target.id === 'm2-why') { var b = $('[data-act="trans-apply"]'); if (b) b.click() }
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('tabindex') === '0') {
      var act = e.target.getAttribute('data-act')
      if (act && act !== 'noop') { e.preventDefault(); e.target.click() }
    }
  })
  document.addEventListener('click', function (e) {
    var item = e.target.closest('[data-os-pick]')
    if (!item) return
    $$('.os-pick-item').forEach(function (x) { x.classList.remove('sel'); x.setAttribute('aria-selected', 'false') })
    item.classList.add('sel'); item.setAttribute('aria-selected', 'true')
  })

  renderAll()
})()
