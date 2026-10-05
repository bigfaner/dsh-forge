/* M2 UI 原型 · 交互（UF-1 概览任务列表 / UF-2 文档页签 / UF-3 会话头挂接 pill / UF-4 表单派生行）
   行语言与交互母本 = 总纲原型（--dsw-* 令牌；pill/chip/state-dot/tree-row/task-row）。
   模拟口径：⚡ 模拟 tool 写入 = 演示「写入返回后单次重取即见新值」（产品无此钮——应用零编排）。 */
(function () {
  'use strict'
  var D = window.M2DATA
  var $ = function (s, r) { return (r || document).querySelector(s) }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }

  var ST_LABEL = { pending: '待办', in_progress: '执行中', completed: '已完成', blocked: '阻塞', suspended: '挂起', skipped: '跳过', rejected: '已拒绝' }
  var ST_ORDER = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected']
  var ST_DOT = { pending: 'idle', in_progress: 'ok', completed: 'ok', blocked: 'err', suspended: 'warn', skipped: 'idle', rejected: 'err' }
  var ST_TAG = { completed: 'st-completed', in_progress: 'st-in_progress', pending: 'st-pending', blocked: 'st-blocked', suspended: 'st-mono', skipped: 'st-mono', rejected: 'st-mono' }
  var TERM = function (st) { return st === 'completed' || st === 'skipped' }

  /* 运行态（重置钮还原） */
  var S
  function seed() {
    S = {
      session: 's-disp-1',
      dock: { open: true, active: 'overview' },
      ov: { feat: 'dsh-forge-m2-pipeline', chips: {}, open: {} },
      doc: { view: 'list', sel: null, fold: {} },
      form: { suspect: false },
      menu: null, modal: null, trans: null, dark: false
    }
    D.tasks.forEach(function (t) { t._st0 = t.status })
    D.tasks.forEach(function (t) { t.status = t._st0 })
  }
  seed()

  function task(key) { return D.tasks.find(function (t) { return t.key === key }) }
  function tasksOf(feat) { return D.tasks.filter(function (t) { return t.key.indexOf(feat + '/') === 0 }) }
  function featStatus(feat) { var f = D.features.find(function (x) { return x.slug === feat }); return f ? f.status : '' }
  function linksOf(key) { return D.links.filter(function (l) { return l.key === key }) }
  function linksOfSession(sid) { return D.links.filter(function (l) { return l.session === sid }) }
  function recs(key) { return D.records[key] || [] }
  function pushRec(key, verb, note) {
    var now = new Date()
    var at = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2)
    ;(D.records[key] = D.records[key] || []).push({ verb: verb, at: '今天 ' + at, note: note })
  }

  /* ── 渲染总入口 ── */
  function renderAll() { renderSidebar(); renderConv(); renderDock(); renderOverlays(); }

  /* ── 左栏（演示基底） ── */
  function renderSidebar() {
    var sess = D.sessions.map(function (s) {
      return '<div class="sess-row' + (s.id === S.session ? ' active' : '') + '" data-act="sess" data-s="' + esc(s.id) + '">' +
        '<span class="state-dot ' + (s.running ? 'ok breathing' : 'idle') + '" title="' + (s.running ? '运行中' : '已结束') + '"></span>' +
        '<span class="ellipsis" style="flex:1;min-width:0" title="' + esc(s.title) + '">' + esc(s.title) + '</span></div>'
    }).join('')
    $('#pj-list').innerHTML =
      '<div class="pj-row active"><span aria-hidden="true">📂</span><span class="ellipsis" style="flex:1">demo-proj</span></div>' + sess
  }

  /* ── UF-3 会话头部挂接 pill ── */
  function renderConv() {
    var s = D.sessions.find(function (x) { return x.id === S.session }) || D.sessions[0]
    $('#conv-crumbs').innerHTML =
      '<span class="crumb">demo-proj</span><span class="crumb-sep">/</span><span class="crumb current">' + esc(s.title) + '</span>'
    var ls = linksOfSession(s.id)
    var pills = ls.slice(0, 2).map(function (l) {
      var t = task(l.key)
      return '<button class="pill is-button" data-act="task-goto" data-key="' + esc(l.key) + '" ' +
        'title="挂接任务（' + (l.kind === 'link' ? '派发会话 · claim 挂接行' : '执行会话 · records.session_id') + '）——点击定位概览">' +
        '⟞ ' + esc(l.key.split('/').pop() === l.key ? l.key : shortKey(l.key)) +
        ' · <span class="state-dot ' + (ST_DOT[t ? t.status : 'idle']) + '"></span> ' + esc(t ? ST_LABEL[t.status] : '') + '</button>'
    }).join('')
    if (ls.length > 2) {
      pills += '<button class="pill is-button" data-act="links-overflow" title="全部挂接">+' + (ls.length - 2) + '</button>'
    }
    var running = s.running ? '<span class="pill"><span class="state-dot ok breathing"></span>运行中</span>' : ''
    $('#conv-actions').innerHTML = pills + running
  }
  function shortKey(key) { var i = key.indexOf('/'); return i < 0 ? key : key.slice(i + 1) }

  /* ── dock ── */
  function renderDock() {
    $('#rb-wrap').classList.toggle('is-collapsed', !S.dock.open)
    var chips =
      chip('overview', '概览', '任务列表（M2；DAG/泳道 = M3）') +
      chip('docs', '文档', 'SC4 只读浏览')
    $('#rb-chips').innerHTML = chips
    $('#rb-body').innerHTML = S.dock.active === 'docs' ? renderDocs() : renderOverview()
  }
  function chip(id, label, title) {
    return '<div class="rb-chip' + (S.dock.active === id ? ' active' : '') + '" data-act="dock-tab" data-id="' + id + '" title="' + esc(title) + '" role="tab" aria-selected="' + (S.dock.active === id) + '">' +
      '<span class="ellipsis">' + esc(label) + '</span></div>'
  }

  /* ── UF-1 概览 · 任务列表 ── */
  function renderOverview() {
    var feat = S.ov.feat
    var ts = tasksOf(feat)
    var done = ts.filter(function (t) { return t.status === 'completed' }).length
    var on = ST_ORDER.filter(function (st) { return S.ov.chips[st] })
    var vis = on.length ? ts.filter(function (t) { return on.indexOf(t.status) >= 0 }) : ts
    var counts = {}
    ST_ORDER.forEach(function (st) { counts[st] = ts.filter(function (t) { return t.status === st }).length })

    var html = '<div class="ov-taskbar">' +
      '<button class="pill is-button task-feat-pill" data-act="feat-menu">' +
      '<span class="fp-name ellipsis">' + esc(feat) + '</span>' +
      '<span class="chip">' + esc(featStatus(feat)) + ' ' + done + '/' + ts.length + '</span><span aria-hidden="true">▾</span></button>' +
      '<span class="task-count-note">' + ts.length + ' 条 · 状态直读（任务库）</span><span class="spacer"></span>' +
      '<div class="seg"><button class="seg-btn active">列表</button><button class="seg-btn" disabled title="M3 交付">DAG</button><button class="seg-btn" disabled title="M3 交付">泳道图</button></div></div>'

    html += '<div class="ov-statuschips">' + ST_ORDER.map(function (st) {
      return '<button class="st-chip' + (S.ov.chips[st] ? ' is-on' : '') + '" data-act="st-chip" data-st="' + st + '">' +
        '<span class="state-dot ' + ST_DOT[st] + '"></span>' + esc(ST_LABEL[st]) +
        '<span class="cnt">' + counts[st] + '</span></button>'
    }).join('') + (on.length ? '<button class="st-chip" data-act="st-clear" title="清过滤">✕ 清过滤</button>' : '') + '</div>'

    if (!ts.length) {
      return html + '<div class="kb-empty">本 feature 暂无任务<span class="t-aux">任务由 run-tasks / addTask 产生——经 plugin-forge tool 写入任务库</span></div>' + foot()
    }
    if (!vis.length) {
      return html + '<div class="kb-empty">当前过滤组合无任务<span class="t-aux">点「✕ 清过滤」恢复全部</span></div>' + foot()
    }
    var running = vis.filter(function (t) { return t.status === 'in_progress' || t.status === 'blocked' })
    if (running.length) html += '<div class="task-group-label">执行中（' + running.length + '）</div>' + running.map(row).join('')
    var rest = vis.filter(function (t) { return running.indexOf(t) < 0 })
    if (rest.length && running.length) html += '<div class="task-group-label">其余</div>'
    html += rest.map(row).join('')
    return html + foot()

    function row(t) {
      var ls = linksOf(t.key)
      var linkTitle = ls.map(function (l) { return (l.kind === 'link' ? '派发 ' : '执行 ') + l.session }).join(' / ')
      var r = '<div class="task-row' + (S.ov.open[t.key] ? ' is-open' : '') + '" data-act="task-toggle" data-key="' + esc(t.key) + '" tabindex="0">' +
        '<span class="task-id" title="' + esc(t.key) + '">' + esc(shortKey(t.key)) + '</span>' +
        '<span class="task-title ellipsis" title="' + esc(t.title) + '">' + esc(t.title) + '</span>' +
        (t.deps.length ? '<span class="task-deps" title="前置：' + esc(t.deps.join('、')) + '">←' + t.deps.length + '</span>' : '') +
        (ls.length ? '<span class="task-links" data-act="task-links" data-key="' + esc(t.key) + '" title="' + esc(linkTitle || '挂接会话') + '">⟞' + ls.length + '</span>' : '') +
        (t.source ? '<span class="chip" title="fix 链源 ' + esc(t.source) + '">fix</span>' : '') +
        '<span class="status-tag ' + ST_TAG[t.status] + '">' + esc(t.status) + '</span>' +
        '<button class="icon-btn task-more" data-act="task-more" data-key="' + esc(t.key) + '" title="行操作" aria-label="行操作">⋯</button></div>'
      if (S.ov.open[t.key]) r += detail(t)
      return r
    }
    function detail(t) {
      var tl = recs(t.key).map(function (r) {
        var cls = r.verb === 'auto-restore' ? ' v-restore' : (r.verb === 'auto-block' ? ' v-block' : '')
        return '<div class="tl-row"><span class="tl-verb' + cls + '">' + esc(r.verb) + '</span><span class="tl-at">' + esc(r.at) + '</span><span class="tl-note ellipsis" title="' + esc(r.note) + '">' + esc(r.note) + '</span></div>'
      }).join('') || '<div class="tl-row"><span class="tl-note">（暂无执行记录）</span></div>'
      var ls = linksOf(t.key).map(function (l) {
        var s = D.sessions.find(function (x) { return x.id === l.session })
        return '<div class="tl-row"><span class="tl-verb">' + (l.kind === 'link' ? '派发 ⟞' : '执行 ⟞') + '</span><span class="tl-note"><span data-act="sess-open" data-s="' + esc(l.session) + '" style="color:var(--dsw-alias-link);cursor:pointer">' + esc(s ? s.title : l.session) + '</span></span></div>'
      }).join('')
      return '<div class="task-detail" data-act="stop">' + tl + ls +
        '<div class="task-detail-actions">' +
        '<button class="btn btn-soft btn-sm" data-act="trans" data-key="' + esc(t.key) + '">转移状态…</button>' +
        (ls.length ? '' : '') + '</div></div>'
    }
    function foot() { return '<p class="ov-footnote">feature 绑定（无全局汇总）· 状态直读 · 应用零编排——tool 写入后本列表即时可见（单次重取）</p>' }
  }

  /* ── UF-2 文档页签 ── */
  function renderDocs() {
    if (S.doc.view === 'detail') return renderDocDetail()
    var html = '<div class="doc-tab-head"><span class="t-title">文档</span><span class="t-aux">docs/features · docs/proposals · 只读</span></div>'
    var total = 0
    html += '<div style="margin-top:10px">'
    html += '<div class="tree-row dir" data-act="fold" data-g="props"><span>' + (S.doc.fold.props ? '▸' : '▾') + '</span><span class="ellipsis">docs/proposals/</span><span class="tree-status t-aux">提案</span></div>'
    if (!S.doc.fold.props) {
      D.proposals.forEach(function (p) {
        total++
        var path = 'docs/proposals/' + p.slug + '/proposal.md'
        html += fileRow(path, 'proposal.md', p.summary, false, '<span class="chip">' + esc(p.status) + '</span>')
      })
    }
    D.featureDocs.forEach(function (f) {
      html += '<div class="tree-row dir" data-act="fold" data-g="f:' + esc(f.slug) + '"><span>' + (S.doc.fold['f:' + f.slug] ? '▸' : '▾') + '</span><span class="ellipsis">' + esc(f.slug) + '/</span><span class="tree-status"><span class="chip">' + esc(f.status) + '</span></span></div>'
      if (!S.doc.fold['f:' + f.slug]) {
        f.docs.forEach(function (d) {
          total++
          html += fileRow(d.rel, d.rel.split('/').pop(), d.summary, d.missing, '<span class="chip">' + esc(d.kind) + '</span>')
        })
      }
    })
    html += '</div>'
    if (!total) html += '<div class="kb-empty">未发现结构化文档<span class="t-aux">目录约定：docs/features/&lt;slug&gt;/ 与 docs/proposals/&lt;slug&gt;/proposal.md</span></div>'
    html += '<p class="ov-footnote">发现面单向吸收建行 · 悬空引用不删行（SC-branch）· 仓外项目同构</p>'
    return html
  }
  function fileRow(path, name, summary, missing, statusHtml) {
    return '<div class="tree-row file' + (missing ? ' is-dangling' : '') + '" data-act="doc-open" data-path="' + esc(path) + '" data-missing="' + (missing ? '1' : '') + '" title="' + esc(summary || '') + '">' +
      '<span aria-hidden="true">' + (missing ? '⚠' : '📄') + '</span><span class="ellipsis" style="flex:1;min-width:0">' + esc(name) + '</span>' +
      (missing ? '<span class="chip dangling" title="引用在、文件缺（分支切换/移动）——只读容错">悬空</span>' : '') +
      '<span class="tree-status">' + statusHtml + '</span></div>'
  }
  function renderDocDetail() {
    var sel = S.doc.sel
    var name = sel.path.split('/').pop()
    var full = D.ws + '\\' + sel.path.replace(/\//g, '\\')
    var head = '<div class="doc-detail-head">' +
      '<button class="icon-btn" data-act="doc-back" title="返回列表（Esc）" aria-label="返回列表"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<span aria-hidden="true">' + (sel.missing ? '⚠' : '📄') + '</span><span class="doc-title ellipsis">' + esc(name) + '</span>' +
      '<span class="chip" title="应用对代码仓与文档位置零写入（SC3 只读纪律）">只读</span></div>'
    var pathbar = '<div class="doc-pathbar"><span class="p ellipsis" title="' + esc(full) + '">' + esc(full) + '</span>' +
      '<button class="icon-btn" data-act="doc-editor" data-path="' + esc(full) + '" title="在编辑器中打开（系统关联 · 应用零写入）" aria-label="在编辑器中打开"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></button>' +
      '<button class="icon-btn" data-act="doc-reread" title="重新读取（只读）" aria-label="重新读取">↻</button></div>'
    if (sel.missing) {
      return head + pathbar +
        '<div class="doc-badges"><span class="chip dangling">引用悬空</span><span class="t-aux">文件不在当前分支或已被移动</span></div>' +
        '<div class="doc-dangling"><div class="warn-ico">⚠</div><div class="t-title">文档引用悬空</div>' +
        '<p class="t-aux" style="margin-top:6px">只读缺省渲染——不崩溃、不写入、不删行；切回含此文件的分支后 ↻ 重读即可。</p></div>'
    }
    var content = D.docs[sel.path] || '（占位内容）'
    var abs = summaryOf(sel.path)
    return head + pathbar +
      '<div class="doc-badges"><span class="chip">' + esc(kindOf(sel.path)) + '</span><span class="t-aux" style="margin-left:auto">页签跟随所属项目</span></div>' +
      (abs ? '<div class="doc-abs">' + esc(abs) + '</div>' : '') +
      '<div class="doc-body">' + md(content) + '</div>'
  }
  function kindOf(path) {
    var m = path.match(/([a-z-]+)\.md$/) || []
    if (path.indexOf('/proposals/') >= 0) return 'proposal'
    return m[1] || 'doc'
  }
  function summaryOf(path) {
    for (var i = 0; i < D.featureDocs.length; i++) {
      for (var j = 0; j < D.featureDocs[i].docs.length; j++) {
        if (D.featureDocs[i].docs[j].rel === path) return D.featureDocs[i].docs[j].summary
      }
    }
    for (var k = 0; k < D.proposals.length; k++) {
      if (path === 'docs/proposals/' + D.proposals[k].slug + '/proposal.md') return D.proposals[k].summary
    }
    return ''
  }
  /* 迷你 Markdown 渲染（演示级） */
  function md(src) {
    var lines = String(src).split('\n')
    var out = '', inCode = false, inList = false, para = []
    function flushP() {
      if (para.length) { out += '<p>' + inline(para.join(' ')) + '</p>'; para = [] }
    }
    function flushL() { if (inList) { out += '</ul>'; inList = false } }
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i]
      if (/^```/.test(l)) { flushP(); flushL(); out += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue }
      if (inCode) { out += esc(l) + '\n'; continue }
      if (/^### /.test(l)) { flushP(); flushL(); out += '<h2>' + inline(l.slice(4)) + '</h2>' }
      else if (/^## /.test(l)) { flushP(); flushL(); out += '<h2>' + inline(l.slice(3)) + '</h2>' }
      else if (/^# /.test(l)) { flushP(); flushL(); out += '<h1>' + inline(l.slice(2)) + '</h1>' }
      else if (/^> /.test(l)) { flushP(); flushL(); out += '<blockquote>' + inline(l.slice(2)) + '</blockquote>' }
      else if (/^- /.test(l)) { flushP(); if (!inList) { out += '<ul>'; inList = true } out += '<li>' + inline(l.slice(2)) + '</li>' }
      else if (l.trim() === '') { flushP(); flushL() }
      else para.push(l)
    }
    flushP(); flushL(); if (inCode) out += '</pre>'
    return out
  }
  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  }

  /* ── 菜单 / 模态 / Toast ── */
  function renderOverlays() {
    var host = $('#layer-root')
    var html = ''
    if (S.menu) html += '<div class="layer" data-act="layer-close"></div><div class="menu" style="left:' + S.menu.x + 'px;top:' + S.menu.y + 'px">' + S.menu.html + '</div>'
    if (S.modal === 'trans') html += transModal()
    if (S.modal === 'form') html += formModal()
    host.innerHTML = html
  }
  function openMenu(anchor, html) {
    var r = anchor.getBoundingClientRect()
    var x = Math.min(r.left, window.innerWidth - 330)
    var y = r.bottom + 6
    if (y + 260 > window.innerHeight) y = Math.max(12, r.top - 264)
    S.menu = { x: x, y: y, html: html }
    renderOverlays()
  }
  function closeMenu() { S.menu = null; renderOverlays() }

  function transModal() {
    var t = task(S.trans.key)
    var opts = ST_ORDER.filter(function (st) { return st !== t.status }).map(function (st) {
      return '<option value="' + st + '">' + esc(ST_LABEL[st]) + '（' + st + '）</option>'
    }).join('')
    return '<div class="modal-mask" data-act="layer-close"><div class="modal" data-act="stop">' +
      '<h3>转移状态 <span class="t-code t-aux" style="font-weight:400">' + esc(t.key) + '</span></h3>' +
      '<div class="sub">人类通道（from ≠ to 任意 + 原因必填）——与 agent 写入同门（core 动词），本操作将留审计记录。</div>' +
      '<div class="form-row"><label>当前状态</label><div>' + esc(ST_LABEL[t.status]) + '（' + esc(t.status) + '）</div></div>' +
      '<div class="form-row"><label>目标状态</label><select class="m2sel" id="trans-to">' + opts + '</select></div>' +
      '<div class="form-row"><label>原因（必填）</label><textarea class="m2reason" id="trans-why" placeholder="如：重开补一个遗漏的断言 / 人工跳过废弃方案…"></textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost btn-sm" data-act="modal-close">取消（Esc）</button>' +
      '<button class="btn btn-primary btn-sm" data-act="trans-apply">确认转移</button></div></div></div>'
  }
  function formModal() {
    var suspect = S.form.suspect
    return '<div class="modal-mask" data-act="layer-close"><div class="modal" data-act="stop" style="width:min(520px,94vw)">' +
      '<h3>注册项目（表单段演示）</h3>' +
      '<div class="sub">两段式第二段——派生行为 M2 升级：任务清单行 = 应用侧单源下发（含 hash8 消歧后缀）。</div>' +
      '<div class="form-row"><label>工作区目录</label><input class="fb-static" value="' + esc(D.ws) + '" readonly tabindex="-1"></div>' +
      '<div class="form-row"><label>任务清单与记录</label><input class="fb-static" id="ap-tasks" value="' + esc(D.taskStore(D.ws)) + '" readonly tabindex="-1" title="统一存放于 {dsh-forge-home}/{canonical-path 扁平化}-{hash8 消歧后缀}，注册时自动派生"></div>' +
      (suspect
        ? '<div class="form-err"><div class="t">⚠ 检测到同主体旧目录——疑似工作区被移动</div>' +
          '<div class="t-aux" style="margin-top:4px">旧目录：<span class="t-code">' + esc(D.orphanDir) + '</span></div>' +
          '<div class="t-aux" style="margin-top:4px">请删除上述旧目录，或将工作区目录改回原名后重试——应用不自动迁移任务数据。</div></div>'
        : '') +
      '<div class="modal-actions"><button class="btn btn-ghost btn-sm" data-act="modal-close">取消</button>' +
      '<button class="btn btn-primary btn-sm" data-act="form-confirm"' + (suspect ? ' disabled' : '') + '>确认' + (suspect ? '（已拒绝）' : '') + '</button></div></div></div>'
  }

  var toastHost
  function toast(msg) {
    if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toast-host'; document.body.appendChild(toastHost) }
    var t = document.createElement('div')
    t.className = 'toast'
    t.textContent = msg
    toastHost.appendChild(t)
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .25s' }, 2600)
    setTimeout(function () { t.remove() }, 2900)
  }

  /* ── 行为：tool 写入模拟（演示即时刷新）+ 恢复钩子 ── */
  function simulateToolWrite() {
    var feat = S.ov.feat
    var ts = tasksOf(feat)
    var ready = ts.filter(function (t) {
      return t.status === 'pending' && t.deps.every(function (d) { return TERM(task(d) ? task(d).status : '') })
    })
    var ip = ts.filter(function (t) { return t.status === 'in_progress' })
    if (ip.length) {
      var t = ip[0]
      t.status = 'completed'
      pushRec(t.key, 'submit', 'gate ✓ compile/fmt/lint/test · commit ' + rand() + '（模拟）')
      toast('⚡ submitTask：' + shortKey(t.key) + ' → completed（gate ✓）——列表单次重取即见')
      autoRestore(feat)
    } else if (ready.length) {
      var t2 = ready[0]
      t2.status = 'in_progress'
      pushRec(t2.key, 'claim', 'dispatch digest ' + rand() + '（会话 s-disp-1 · 挂接行 upsert）')
      D.links.push({ key: t2.key, session: 's-disp-1', kind: 'link' })
      toast('⚡ claimTask：' + shortKey(t2.key) + ' → in_progress（挂接行已写）')
    } else {
      toast('（无可演示转移——pending 已尽或前置未满足；可先转移/完成任务解锁）')
    }
    renderAll()
  }
  function autoRestore(feat) {
    tasksOf(feat).forEach(function (t) {
      if (t.status !== 'blocked') return
      var blockers = t.deps.concat(t.source ? [t.source.replace(/^[^/]+\//, '')] : [])
      var allTerm = blockers.every(function (b) {
        var bt = D.tasks.find(function (x) { return x.key.indexOf(feat + '/') === 0 && x.key !== t.key && (x.key === b || shortKey(x.key) === b) })
        return !bt || TERM(bt.status)
      })
      if (allTerm) {
        t.status = 'pending'
        pushRec(t.key, 'auto-restore', '前置全满足 → blocked→pending（边保留）——恢复钩子')
        toast('↻ auto-restore：' + shortKey(t.key) + ' blocked → pending（前置全满足）')
      }
    })
  }
  function rand() { return Math.random().toString(16).slice(2, 9) }

  /* ── 事件分发 ── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]')
    if (!el) return
    var act = el.getAttribute('data-act')
    if (act === 'stop') { e.stopPropagation(); return }
    if (act === 'layer-close') { S.menu = null; S.modal = null; renderOverlays(); return }
    if (act === 'modal-close') { S.modal = null; S.trans = null; renderOverlays(); return }

    switch (act) {
      /* dock */
      case 'dock-tab': S.dock.open = true; S.dock.active = el.getAttribute('data-id'); S.doc.view = 'list'; renderDock(); break
      case 'dock-toggle': S.dock.open = !S.dock.open; renderDock(); break
      /* 左栏会话 */
      case 'sess': S.session = el.getAttribute('data-s'); renderSidebar(); renderConv(); break
      case 'sess-open': S.session = el.getAttribute('data-s'); S.menu = null; renderSidebar(); renderConv(); break
      /* UF-3 挂接 */
      case 'task-goto': {
        var key = el.getAttribute('data-key')
        S.dock.open = true; S.dock.active = 'overview'
        S.ov.feat = key.slice(0, key.indexOf('/'))
        S.ov.open = {}; S.ov.open[key] = true
        renderDock()
        var rowEl = document.querySelector('.task-row.is-open')
        if (rowEl) rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
        break
      }
      case 'links-overflow': {
        var s0 = D.sessions.find(function (x) { return x.id === S.session })
        var items = linksOfSession(S.session).map(function (l) {
          var t = task(l.key)
          return '<div class="menu-item" data-act="task-goto" data-key="' + esc(l.key) + '">' +
            '<span class="state-dot ' + ST_DOT[t ? t.status : 'idle'] + '"></span><span class="t-code">' + esc(l.key) + '</span>' +
            '<span class="t-aux" style="margin-left:auto">' + (l.kind === 'link' ? '派发' : '执行') + '</span></div>'
        }).join('')
        openMenu(el, '<div class="menu-note">会话「' + esc(s0 ? s0.title : '') + '」的挂接任务（双数据源并集）</div>' + items)
        break
      }
      /* UF-1 概览 */
      case 'feat-menu': {
        var items2 = D.features.map(function (f) {
          var ts = tasksOf(f.slug)
          var done = ts.filter(function (t) { return t.status === 'completed' }).length
          return '<div class="menu-item' + (f.slug === S.ov.feat ? ' is-cur' : '') + '" data-act="feat-pick" data-f="' + esc(f.slug) + '">' +
            '<span class="ellipsis" style="flex:1;min-width:0">' + esc(f.slug) + '</span>' +
            '<span class="chip">' + esc(f.status) + ' ' + done + '/' + ts.length + '</span></div>'
        }).join('')
        openMenu(el, '<div class="menu-note">feature 绑定（无全局汇总）——任务视图锚</div>' + items2)
        break
      }
      case 'feat-pick': S.ov.feat = el.getAttribute('data-f'); S.ov.open = {}; closeMenu(); renderDock(); break
      case 'st-chip': { var st = el.getAttribute('data-st'); S.ov.chips[st] = !S.ov.chips[st]; renderDock(); break }
      case 'st-clear': S.ov.chips = {}; renderDock(); break
      case 'task-toggle': {
        if (e.target.closest('[data-act="task-more"],[data-act="task-links"],[data-act="trans"],[data-act="sess-open"]')) break
        var k = el.getAttribute('data-key'); S.ov.open[k] = !S.ov.open[k]; renderDock(); break
      }
      case 'task-more': {
        e.stopPropagation()
        var k2 = el.getAttribute('data-key'); var t3 = task(k2)
        openMenu(el,
          '<div class="menu-item" data-act="task-toggle" data-key="' + esc(k2) + '">' + (S.ov.open[k2] ? '收起时间线' : '展开时间线') + '</div>' +
          '<div class="menu-sep"></div>' +
          ST_ORDER.filter(function (st) { return st !== t3.status }).slice(0, 4).map(function (st) {
            return '<div class="menu-item" data-act="trans-quick" data-key="' + esc(k2) + '" data-st="' + st + '">转 ' + esc(ST_LABEL[st]) + '…</div>'
          }).join(''))
        break
      }
      case 'trans-quick': closeMenu(); S.trans = { key: el.getAttribute('data-key'), pre: el.getAttribute('data-st') }; S.modal = 'trans'; renderOverlays(); setTimeout(function () { var sel = $('#trans-to'); if (sel && S.trans.pre) sel.value = S.trans.pre; var ta = $('#trans-why'); if (ta) ta.focus() }, 0); break
      case 'trans': S.modal = 'trans'; S.trans = { key: el.getAttribute('data-key') }; renderOverlays(); setTimeout(function () { var ta = $('#trans-why'); if (ta) ta.focus() }, 0); break
      case 'trans-apply': {
        var to = $('#trans-to').value, why = $('#trans-why').value.trim()
        if (!why) { toast('原因必填——人类通道审计要求'); return }
        var t4 = task(S.trans.key)
        if (to === t4.status) { toast('目标状态须不同于当前状态（from ≠ to）'); return }
        var from = t4.status
        t4.status = to
        pushRec(t4.key, 'transition', from + ' → ' + to + ' · reason: ' + why)
        S.modal = null; S.trans = null
        toast('已转移 ' + shortKey(t4.key) + '：' + from + ' → ' + to + '（reason 已留审计）')
        if (TERM(to)) autoRestore(S.ov.feat)
        renderAll(); renderOverlays()
        break
      }
      case 'task-links': {
        e.stopPropagation()
        var k3 = el.getAttribute('data-key')
        var items3 = linksOf(k3).map(function (l) {
          var s2 = D.sessions.find(function (x) { return x.id === l.session })
          return '<div class="menu-item" data-act="sess-open" data-s="' + esc(l.session) + '">' +
            '<span>' + (l.kind === 'link' ? '派发 ⟞' : '执行 ⟞') + '</span><span class="ellipsis" style="flex:1;min-width:0">' + esc(s2 ? s2.title : l.session) + '</span></div>'
        }).join('')
        openMenu(el, '<div class="menu-note">挂接会话（派发 = 挂接表 · 执行 = records.session_id）</div>' + items3)
        break
      }
      /* UF-2 文档 */
      case 'fold': { var g = el.getAttribute('data-g'); S.doc.fold[g] = !S.doc.fold[g]; renderDock(); break }
      case 'doc-open': {
        var p = el.getAttribute('data-path')
        S.doc.sel = { path: p, missing: el.getAttribute('data-missing') === '1' }
        S.doc.view = 'detail'; renderDock(); break
      }
      case 'doc-back': S.doc.view = 'list'; renderDock(); break
      case 'doc-editor': toast('已请求系统编辑器打开（应用零写入）：' + el.getAttribute('data-path')); break
      case 'doc-reread': toast('已重新读取（只读）'); renderDock(); break
      /* 原型工具 */
      case 'theme-toggle': S.dark = !S.dark; document.body.toggleAttribute('data-ds-dark-theme', S.dark); break
      case 'sim-write': simulateToolWrite(); break
      case 'form-open': S.modal = 'form'; renderOverlays(); break
      case 'suspect-toggle': S.form.suspect = !S.form.suspect; renderOverlays(); if (S.form.suspect) toast('已模拟「疑似移动」：确认将被拒绝并给出手工指引'); break
      case 'form-confirm': S.modal = null; renderOverlays(); toast('已注册（演示）——任务库将建于 ' + D.taskStore(D.ws)); break
      case 'reset': seed(); renderAll(); toast('已重置种子数据'); break
    }
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (S.modal) { S.modal = null; S.trans = null; renderOverlays() }
      else if (S.menu) closeMenu()
      else if (S.doc.view === 'detail') { S.doc.view = 'list'; renderDock() }
    }
    if (e.key === 'Enter' && S.modal === 'trans' && e.target && e.target.id === 'trans-why') {
      var btn = $('#trans-apply'); if (btn) btn.click()
    }
  })

  renderAll()
})()
