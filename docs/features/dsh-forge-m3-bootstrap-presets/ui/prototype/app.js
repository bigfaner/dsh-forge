/* M3 原型交互：提案子 tab（五态 chips/裁决/模式更改/对齐建会话）+ Forge设置 + 诊断 + hero 座位 */
(() => {
  const D = window.M3DATA
  const S = {
    subtab: 'proposal', chips: new Set(), featChips: new Set(), expanded: new Set(), search: '', sort: 'active',
    seat: 'expedition', seatLocked: false,
    taskFeature: 'dsh-forge-m2-pipeline',
    task: { view: 'list', chips: new Set() }, taskOpen: new Set(),
    fs: { configured: false, provider: '', model: '', reasoning: 'medium' },
    dialogs: { review: null, mode: null, modePick: null }, lastDiag: null, lastTaskDiag: null,
    nextFeatureToastShown: false
  }
  const $ = (sel) => document.querySelector(sel)
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n }
  const toast = (msg, ms) => {
    const t = $('#toast'); t.textContent = ''; t.className = 'toast'
    t.style.left = ''; t.style.right = ''; t.style.top = ''; t.style.bottom = ''; t.style.transform = ''; t.style.maxWidth = ''
    t.append(document.createTextNode(msg)); t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true }, ms || 2600)
  }
  /* 富 toast（诊断结果）：成功 1s 自消；失败 5s 自消 + 「发送给 agent」动作按钮；锚定诊断按钮左侧（贴近出现） */
  const toastRich = ({ ok, html, ms, anchor, sendAct }) => {
    const t = $('#toast'); t.textContent = ''
    t.className = 'toast rich ' + (ok ? 'ok' : 'bad')
    const box = el('div', 'toast-body'); box.innerHTML = html
    t.append(box)
    if (!ok) {
      const btn = el('button', 'toast-agent-btn', '发送给 agent')
      btn.dataset.act = sendAct || 'diag-send'
      t.append(btn)
    }
    t.hidden = false
    t.style.left = ''; t.style.right = ''; t.style.top = ''; t.style.bottom = ''; t.style.transform = ''; t.style.maxWidth = ''
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      t.style.maxWidth = Math.max(240, r.left - 24) + 'px'
      t.style.left = Math.max(12, r.left - 14) + 'px'
      t.style.transform = 'translateX(-100%)'
      t.style.top = Math.max(10, r.top - 8) + 'px'
      t.style.bottom = 'auto'
    }
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true }, ms)
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /* 打开新会话（共享通道）：切模式 + 中区会话面；上下文默认**预填输入框不发送**（v13——等待用户明确意图），autosend 用于诊断错误直达与派发指令直达（v22） */
  const openSession = (mode, brief, opts) => {
    if (mode) { S.seat = mode; seatRender() }
    $('#hero-zone').hidden = true
    $('#session-feed').hidden = false
    $('#sf-head').innerHTML = '<span class="state-dot ok live"></span> 新会话 · dsh-forge（工作区）' + (mode ? ' · ' + (mode === 'expedition' ? '远征模式' : '突击模式') : '（模式未切换）')
    if (opts && opts.autosend) {
      const bubble = el('div', 'sf-msg user')
      bubble.append(el('div', 'sf-who', '我 · 自动发送'))
      const text = el('div', 'sf-text'); text.textContent = brief
      bubble.append(text)
      $('#sf-list').append(bubble)
    } else {
      const input = $('#sf-input')
      input.value = brief ? brief + '\n\n我的意图：' : '我的意图：'
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }

  /* 跳转既有派发会话（v22）：当前容器执行中任务在场 → 不新建不重发，仅中区切至该会话 */
  const openExistingSession = (label) => {
    $('#hero-zone').hidden = true
    $('#session-feed').hidden = false
    $('#sf-head').innerHTML = '<span class="state-dot ok live"></span> ' + esc(label)
  }

  /* ---------- 任务子 tab 复刻（M2 全量：七态 + 三视图 + 挂接 + fix 链 + 行内详情） ---------- */
  const ST_ORDER = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected']
  const ST_LABEL = { pending: '待办', in_progress: '执行中', completed: '已完成', blocked: '阻塞', suspended: '挂起', skipped: '跳过', rejected: '已拒绝' }
  const ST_DOT = { pending: 'idle', in_progress: 'ok live', completed: 'done', blocked: 'err', suspended: 'warn', skipped: 'skip', rejected: 'rej' }
  const ST_TAG = { completed: 'st-accepted', in_progress: 'st-under-review', pending: 'st-draft', blocked: 'st-rejected', suspended: 'st-draft', skipped: 'st-draft', rejected: 'st-rejected' }
  const TASK_SORT = { in_progress: 0, blocked: 1, pending: 2, suspended: 3, completed: 4, skipped: 5, rejected: 6 }
  const tasksOf = (f) => D.tasks.filter((t) => t.key.indexOf(f + '/') === 0)
  /* 派发（v22）：终态集与相位推导机口径同源（completed/skipped/rejected）；未终态 = pending/in_progress/blocked/suspended */
  const TERMINAL_ST = new Set(['completed', 'skipped', 'rejected'])
  const nonTerminalOf = (slug) => D.tasks.filter((t) => t.key.indexOf(slug + '/') === 0 && !TERMINAL_ST.has(t.status))
  const runningTaskOf = (slug) => D.tasks.filter((t) => t.key.indexOf(slug + '/') === 0 && t.status === 'in_progress').slice(-1)[0]
  /* 任务容器（v20）：feature（远征）+ 突击提案（blitz 直挂任务——无 feature 阶段） */
  const taskContainers = () => {
    const list = D.features.map((f) => ({ slug: f.slug, title: f.title, mode: 'expedition', isFeature: true }))
    D.proposals.forEach((p) => {
      if (p.mode === 'blitz' && D.tasks.some((t) => t.key.indexOf(p.slug + '/') === 0)) list.push({ slug: p.slug, title: p.title, mode: 'blitz', isFeature: false })
    })
    return list
  }
  const containerOf = (slug) => taskContainers().find((c) => c.slug === slug)
  /* 任务容器模式（诊断消息发往对应模式——v20） */
  const containerMode = (key) => {
    const slug = key.split('/')[0]
    const f = D.features.find((x) => x.slug === slug)
    if (f) return 'expedition'
    const p = D.proposals.find((x) => x.slug === slug)
    return (p && p.mode === 'blitz') ? 'blitz' : 'expedition'
  }
  const stMatch = (t, q) => [t.title, t.key, t.type || '', t.status, ST_LABEL[t.status] || ''].join(' ').toLowerCase().includes(q)

  /* ---------- hero 预设座位（平台形态参考） ---------- */
  const seatRender = () => {
    $('#seat-label').textContent = S.seat === 'expedition' ? '远征模式' : '突击模式'
    $('#seat-dot').className = 'seat-dot ' + (S.seat === 'expedition' ? 'mode-exp' : 'mode-blitz')
    const btn = $('[data-act="seat-menu"]')
    btn.disabled = S.seatLocked
    btn.classList.toggle('locked', S.seatLocked)
    $('#seat-lock-hint').hidden = !S.seatLocked
    $('#seat-menu').hidden = true
  }

  /* ---------- 概览：提案子 tab ---------- */
  const propFiltered = () => {
    let list = D.proposals.filter(p => S.chips.size === 0 || S.chips.has(p.status))
    if (S.search) {
      const q = S.search.toLowerCase()
      list = list.filter(p => [p.slug, p.title, p.status, D.statusZh[p.status], p.mode || '', p.mode ? D.modeZh[p.mode] : '未标记', p.abstract].join(' ').toLowerCase().includes(q))
    }
    if (S.sort === 'active') list = [...list].sort((a, b) => D.statusOrder[a.status] - D.statusOrder[b.status])
    else list = [...list].sort((a, b) => b.created.localeCompare(a.created))
    return list
  }

  const modeChip = (p) => {
    const c = el('button', 'mode-chip' + (p.mode ? '' : ' unset'))
    if (p.mode) {
      const dot = el('span', 'seat-dot ' + (p.mode === 'expedition' ? 'mode-exp' : 'mode-blitz'))
      c.append(dot, D.modeZh[p.mode])
      c.title = '点击打开模式更改对话框（唯一正门）'
      c.addEventListener('click', (e) => { e.stopPropagation(); openModeDlg(p) })
    } else {
      c.textContent = '未标记'
      c.disabled = true
      c.title = '扫描吸收的旧提案无溯源'
    }
    return c
  }

  const propRow = (p) => {
    const row = el('div', 'ov-parent')
    row.dataset.slug = p.slug
    const head = el('div', 'parent-head')
    head.append(el('span', 'caret ' + (S.expanded.has(p.slug) ? 'open' : ''), S.expanded.has(p.slug) ? '▾' : '▸'))
    head.append(el('span', 'ellipsis', p.title))
    head.append(modeChip(p))
    const tag = el('span', 'status-tag st-' + p.status, D.statusZh[p.status])
    head.append(tag)
    const open = el('button', 'btn small open-session', '打开新会话')
    open.title = p.mode ? '创建新会话并切换至' + D.modeZh[p.mode] + '模式（注入现状上下文）' : '无溯源——新会话不切换模式'
    open.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!p.mode) {
        openSession(null, '@docs/proposals/' + p.slug + '/' +
          '\n名称：' + p.title +
          '\n摘要：' + p.abstract +
          '\n状态：' + D.statusZh[p.status] + '（无溯源——扫描吸收的旧提案）')
        toast('无溯源不可对齐——已创建新会话（模式未切换）')
        return
      }
      const docLines = (p.docs || []).map((d) => '· ' + d.name + '（' + d.state + '）').join('\n') || '·（暂无）'
      const brief = '@docs/proposals/' + p.slug + '/' +
        '\n名称：' + p.title +
        '\n摘要：' + p.abstract +
        '\n状态：' + D.statusZh[p.status] +
        '\n已生成文档：\n' + docLines
      openSession(p.mode, brief)
      toast('已创建新会话（提案渠道 → ' + D.modeZh[p.mode] + '模式）——现状上下文已预填输入框，输入意图后发送')
    })
    head.append(open)
    const more = el('button', 'more-btn', '⋯')
    more.title = '提案动作'
    more.addEventListener('click', (e) => { e.stopPropagation(); propMenu(e, p) })
    head.append(more)
    head.addEventListener('click', () => { S.expanded.has(p.slug) ? S.expanded.delete(p.slug) : S.expanded.add(p.slug); render() })
    row.append(head)
    if (S.expanded.has(p.slug)) row.append(metaBlock(p))
    return row
  }

  const metaBlock = (p) => {
    const m = el('div', 'meta-block')
    const abs = el('div', 'meta-row full')
    abs.append(el('span', 'meta-k', '摘要'), el('span', 'meta-v', p.abstract))
    m.append(abs)
    const grid = el('div', 'meta-grid')
    const cell = (k, v) => { const r = el('div', 'meta-row'); r.append(el('span', 'meta-k', k), el('span', 'meta-v', v)); return r }
    /* 标识紧接摘要下一行左侧（v11）；模式|谱系同行（v9） */
    grid.append(cell('标识', p.slug), cell('作者', p.author), cell('模式', p.mode ? D.modeZh[p.mode] : '未标记'), cell('谱系', p.lineage), cell('创建', p.created), cell('裁决', p.verdict || '—'))
    m.append(grid)
    m.append(el('div', 'doc-hier-head', '文档（' + (p.docs || []).length + ' 篇）'))
    ;(p.docs || []).forEach(d => {
      const dr = el('div', 'doc-row')
      dr.append(el('span', '', '📄 ' + d.name), el('span', 'doc-state', '[' + d.state + ']'), el('span', 'doc-arrow', '›'))
      dr.addEventListener('click', () => toast('dock 开文档 tab（docRel 去重）——沿 M2 UF-2'))
      m.append(dr)
    })
    return m
  }

  const kvChip = (k, v) => { const c = el('span', 'kv-chip'); c.append(el('span', 'kv-k', k + ' : '), el('span', 'kv-v', v)); return c }

  const propMenu = (e, p) => {
    document.querySelectorAll('.pop-menu').forEach(n => n.remove())
    const menu = el('div', 'pop-menu')
    const item = (label, fn) => { const b = el('button', 'pop-item', label); b.addEventListener('click', () => { menu.remove(); fn() }); menu.append(b) }
    item('评审流转…', () => openReviewDlg(p))
    item('更改模式…', () => openModeDlg(p))
    item('打开新会话', () => {
      if (!p.mode) { toast('无溯源不可对齐——hero 自由创建（不切换）'); return }
      S.seat = p.mode; seatRender()
      toast('已创建新会话（提案渠道 → ' + D.modeZh[p.mode] + '模式）——hero 座位已对齐')
    })
    menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px'
    menu.style.top = e.clientY + 'px'
    document.body.append(menu)
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0)
  }

  const renderProposals = () => {
    const c = $('#ov-content'); c.textContent = ''
    const chipsRow = el('div', 'chips-row')
    const counts = {}
    D.proposals.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1 })
    ;['draft', 'under-review', 'accepted', 'rejected', 'superseded'].forEach(st => {
      const n = counts[st] || 0
      const b = el('button', 'st-chip st-' + st + (S.chips.has(st) ? ' on' : ''), D.statusZh[st] + '(' + n + ')')
      b.disabled = n === 0
      b.addEventListener('click', () => { S.chips.has(st) ? S.chips.delete(st) : S.chips.add(st); render() })
      chipsRow.append(b)
    })
    c.append(chipsRow)
    const list = propFiltered()
    if (list.length === 0) {
      const empty = el('div', 'empty-hint', '零命中')
      if (S.chips.size > 0 || S.search) {
        const clear = el('button', 'btn small', '清除过滤')
        clear.addEventListener('click', () => { S.chips.clear(); S.search = ''; $('#ov-search').value = ''; render() })
        empty.append(clear)
      }
      c.append(empty)
      return
    }
    list.forEach(p => c.append(propRow(p)))
  }

  /* ---------- 概览：feature 子 tab（阶段过滤 + 分层文档 + 打开新会话→远征） ---------- */
  const PHASE_TAG = { 'in-progress': 'st-under-review', prd: 'st-draft', design: 'st-under-review', tasks: 'st-superseded', completed: 'st-accepted', archived: 'st-draft' }
  const renderFeatures = () => {
    const c = $('#ov-content'); c.textContent = ''
    const chipsRow = el('div', 'chips-row')
    const counts = {}
    D.features.forEach((f) => { const ph = D.featPhase[f.slug]; counts[ph] = (counts[ph] || 0) + 1 })
    D.PHASE_ORDER.forEach((ph) => {
      const n = counts[ph] || 0
      const b = el('button', 'st-chip ph-chip ph-' + ph + (S.featChips.has(ph) ? ' on' : ''), D.PHASE_LABEL[ph] + '(' + n + ')')
      b.disabled = n === 0
      b.addEventListener('click', () => { S.featChips.has(ph) ? S.featChips.delete(ph) : S.featChips.add(ph); render() })
      chipsRow.append(b)
    })
    c.append(chipsRow)
    const list = D.features.filter((f) => S.featChips.size === 0 || S.featChips.has(D.featPhase[f.slug]))
    if (!list.length) {
      const empty = el('div', 'empty-hint', '当前过滤无 feature')
      const clear = el('button', 'btn small', '清除过滤')
      clear.addEventListener('click', () => { S.featChips.clear(); render() })
      empty.append(clear); c.append(empty); return
    }
    list.forEach((f) => c.append(featureRow(f)))
  }

  const featureRow = (f) => {
    const row = el('div', 'ov-parent')
    row.dataset.slug = f.slug
    const head = el('div', 'parent-head')
    head.append(el('span', 'caret ' + (S.expanded.has(f.slug) ? 'open' : ''), S.expanded.has(f.slug) ? '▾' : '▸'))
    head.append(el('span', 'ellipsis', f.title))
    const mc = el('span', 'mode-chip read')
    mc.append(el('span', 'seat-dot mode-exp'), '远征')
    head.append(mc)
    head.append(el('span', 'status-tag ' + PHASE_TAG[D.featPhase[f.slug]], D.PHASE_LABEL[D.featPhase[f.slug]]))
    const open = el('button', 'btn small open-session', '打开新会话')
    open.title = '创建新会话并切换至远征模式（feature 固定远征·注入现状上下文）'
    open.addEventListener('click', (e) => {
      e.stopPropagation()
      const docLines = []
      ;(D.featDocs[f.slug] || []).forEach((g) => g.docs.forEach((d) => docLines.push('· ' + g.dir + '/' + d.name + '（' + d.state + '）')))
      const brief = '@docs/features/' + f.slug + '/' +
        '\n名称：' + f.title +
        '\n摘要：' + f.abstract +
        '\n阶段：' + D.PHASE_LABEL[D.featPhase[f.slug]] +
        '\n已生成文档：\n' + (docLines.join('\n') || '·（暂无）')
      openSession('expedition', brief)
      toast('已创建新会话（feature 渠道 → 远征模式[固定]）——现状上下文已预填输入框，输入意图后发送')
    })
    head.append(open)
    head.addEventListener('click', () => { S.expanded.has(f.slug) ? S.expanded.delete(f.slug) : S.expanded.add(f.slug); render() })
    row.append(head)
    if (S.expanded.has(f.slug)) row.append(featureMeta(f))
    return row
  }

  const featureMeta = (f) => {
    const m = el('div', 'meta-block')
    const abs = el('div', 'meta-row full')
    abs.append(el('span', 'meta-k', '摘要'), el('span', 'meta-v', f.abstract))
    m.append(abs)
    const grid = el('div', 'meta-grid')
    const cell = (k, v) => { const r = el('div', 'meta-row'); r.append(el('span', 'meta-k', k), el('span', 'meta-v', v)); return r }
    /* 标识紧接摘要下一行左侧（v11）；模式|谱系同行；文档统计并入文档区标题 */
    grid.append(cell('标识', f.slug), cell('阶段', D.PHASE_LABEL[D.featPhase[f.slug]]), cell('模式', D.modeZh[f.mode]), cell('谱系', f.from))
    m.append(grid)
    /* 分层文档（中文分组名；文档行 = 相对 feature 目录真实路径，整行可点 → dock 文档 tab） */
    m.append(el('div', 'doc-hier-head', '文档（' + f.docs + ' 篇）'))
    ;(D.featDocs[f.slug] || []).forEach((g) => {
      m.append(el('div', 'doc-group-title', g.group + '（' + g.docs.length + '）'))
      g.docs.forEach((d) => {
        const dr = el('div', 'doc-row')
        dr.append(el('span', '', '📄 ' + g.dir + '/' + d.name), el('span', 'doc-state', '[' + d.state + ']'), el('span', 'doc-arrow', '›'))
        dr.addEventListener('click', () => toast('dock 开文档 tab（docRel 去重·只读渲染）——沿 M2 UF-2'))
        m.append(dr)
      })
    })
    return m
  }

  const runDiag = (f) => {
    const anchor = document.querySelector('.task-diagseg .seg-btn')
    if (!f.diag.fail) {
      f.diag.state = 'green'
      toastRich({ ok: true, ms: 1000, anchor, html: '<div class="toast-title">子图健康 ✓</div><div class="toast-sub">五类检查全部通过（派生不变量 / 依赖无环 / Liveness / 记录链完整性 / 拓扑可分层）</div>' })
      return
    }
    f.diag.state = 'fail'
    S.lastDiag = { slug: f.slug, title: f.title, abstract: f.abstract, phase: D.PHASE_LABEL[D.featPhase[f.slug]], check: f.diag.fail.check, detail: f.diag.fail.detail }
    const lines = D.diagChecks.map((chk) => {
      const fail = chk === f.diag.fail.check
      return '<div class="toast-line' + (fail ? ' bad' : '') + '">' + (fail ? '✗ ' : '✓ ') + esc(chk) + (fail ? ' — ' + esc(f.diag.fail.detail) : '') + '</div>'
    }).join('')
    toastRich({ ok: false, ms: 5000, anchor, html: '<div class="toast-title">诊断失败 · ' + esc(f.title) + '</div>' + lines })
  }

  /* ---------- 概览：任务子 tab（M2 全量复刻 + 诊断 + 派发 UF-3——容器 pill 语境[feature|突击提案]） ---------- */
  const VIEW_LABEL = { list: '列表', dag: 'DAG', swim: '泳道' }
  const renderTasks = () => {
    const c = $('#ov-content')
    const f = containerOf(S.taskFeature) || taskContainers()[0]
    const all = tasksOf(f.slug)
    const q = S.search.trim().toLowerCase()
    const ts = q ? all.filter((t) => stMatch(t, q)) : all
    const done = all.filter((t) => t.status === 'completed').length
    const nonTerm = nonTerminalOf(f.slug).length
    let html = '<div class="ov-taskbar">' +
      '<button class="pill is-button task-feat-pill" data-act="feat-menu"><span class="seat-dot ' + (f.mode === 'blitz' ? 'mode-blitz' : 'mode-exp') + '"></span><span class="fp-name ellipsis">' + esc(f.title) + '</span>' +
      '<span class="chip">运行中 ' + done + '/' + all.length + '</span> ▾</button>' +
      '<div class="task-viewdrop"><button class="seg-btn viewdrop-btn" data-act="task-view-menu" aria-haspopup="listbox" title="切换任务视图（列表 / DAG / 泳道）——同 M2 三视图，控件形态为下拉">视图：' + VIEW_LABEL[S.task.view] + ' <span class="seat-caret">▾</span></button>' +
      '<div class="viewdrop-menu" role="listbox" hidden>' + [['list', '列表'], ['dag', 'DAG'], ['swim', '泳道']].map((v) =>
        '<button class="viewdrop-item" role="option" data-act="task-view-pick" data-v="' + v[0] + '"><span class="vd-check">' + (S.task.view === v[0] ? '✓' : '') + '</span>' + v[1] + '</button>').join('') + '</div></div>' +
      '<span class="task-count-note">' + (q ? ts.length + '/' + all.length : all.length + ' 条') + (f.isFeature ? '' : ' · 突击提案容器（无 feature 阶段）') + '</span><span class="spacer"></span>' +
      '<div class="taskbar-right">' +
      (f.isFeature
        ? '<div class="seg task-diagseg"><button class="seg-btn" data-act="diag-trigger" title="validateFeatureTasks——校验当前 feature 的任务子图；结果以 toast 呈现">诊断</button></div>'
        : '') +
      '<button class="btn small task-dispatch-btn" data-act="task-dispatch"' + (nonTerm
        ? ' title="派发——构造结构化指令发给 agent，按 DAG 依赖顺序依次领取并执行就绪任务（run-tasks）"'
        : ' disabled title="全部任务已处于终态——无可派发任务"') + '>派发</button>' +
      '</div></div>'
    if (!all.length) { c.innerHTML = html + '<div class="kb-empty">本 feature 暂无任务<span class="t-aux">任务由 run-tasks / addTask 产生</span></div>'; return }
    if (!ts.length) { c.innerHTML = html + '<div class="kb-empty">无匹配「' + esc(S.search) + '」的任务</div>'; return }
    const on = [...S.task.chips]
    const vis0 = on.length ? ts.filter((t) => S.task.chips.has(t.status)) : ts
    const counts = {}
    ST_ORDER.forEach((st) => { counts[st] = all.filter((t) => t.status === st).length })
    html += '<div class="m2-stchips">' + ST_ORDER.map((st) => {
      const zero = counts[st] === 0
      return '<button class="tchip' + (S.task.chips.has(st) ? ' is-on' : '') + (zero ? ' is-zero' : '') + '" data-act="tst-chip" data-st="' + st + '"' + (zero ? ' disabled title="无此状态任务"' : '') + '><span class="state-dot ' + ST_DOT[st] + '"></span>' + ST_LABEL[st] + '<span class="cnt">' + counts[st] + '</span></button>'
    }).join('') + (on.length ? '<button class="tchip" data-act="tst-clear">✕ 清过滤</button>' : '') + '</div>'
    if (!vis0.length) { c.innerHTML = html + '<div class="kb-empty">当前过滤组合无任务</div>'; return }
    const vis = [...vis0]
    if (S.sort === 'created') vis.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    else vis.sort((a, b) => ((TASK_SORT[a.status] ?? 9) - (TASK_SORT[b.status] ?? 9)))
    if (S.task.view === 'dag') { c.innerHTML = html + renderDag(vis); return }
    if (S.task.view === 'swim') { c.innerHTML = html + renderSwim(vis); return }
    const running = vis.filter((t) => t.status === 'in_progress' || t.status === 'blocked')
    if (running.length) html += '<div class="task-group-label">执行中(' + running.length + ')</div>' + running.map(taskRow).join('')
    const rest = vis.filter((t) => running.indexOf(t) < 0)
    if (rest.length && running.length) html += '<div class="task-group-label">其余</div>'
    html += rest.map(taskRow).join('')
    c.innerHTML = html
  }

  const taskRow = (t) => {
    const ls = D.links.filter((l) => l.key === t.key)
    const open = S.taskOpen.has(t.key)
    return '<div class="task-item' + (open ? ' is-open' : '') + '" data-act="task-toggle" data-key="' + esc(t.key) + '" tabindex="0" role="button">' +
      '<div class="task-row' + (open ? ' is-open' : '') + '">' +
      '<span class="task-id" title="' + esc(t.key) + '">' + esc(t.key.split('/').pop()) + '</span>' +
      '<span class="task-title ellipsis" title="' + esc(t.title) + '">' + esc(t.title) + '</span>' +
      '<span class="status-tag ' + ST_TAG[t.status] + '" title="' + esc(t.status) + '">' + esc(ST_LABEL[t.status]) + '</span>' +
      '<button class="icon-btn task-more" data-act="task-more" data-key="' + esc(t.key) + '" title="行操作">⋯</button></div>' +
      '<div class="task-sub">' + esc(t.type || '') + (t.priority ? ' · ' + esc(t.priority) : '') +
      (t.deps.length ? ' · ←' + t.deps.length + ' 前置' : '') +
      (ls.length ? ' · <span style="color:var(--dsw-primary)">⟞' + ls.length + ' 挂接</span>' : '') +
      (t.fix ? ' · fix→' + esc((t.source || '').split('/').pop()) : '') + '</div>' +
      (open ? taskDetail(t) : '') + '</div>'
  }

  const taskDetail = (t) => {
    const tl = (D.records[t.key] || []).map((r) =>
      '<div class="tl-row"><span class="tl-verb">' + esc(r.verb) + '</span><span class="tl-at">' + esc(r.at) + '</span><span class="tl-note ellipsis" title="' + esc(r.note) + '">' + esc(r.note) + '</span></div>').join('') || '<div class="tl-row"><span class="tl-note">(暂无执行记录)</span></div>'
    const ls = D.links.filter((l) => l.key === t.key).map((l) =>
      '<div class="tl-row"><span class="tl-verb">' + (l.kind === 'link' ? '派发 ⟞' : '执行 ⟞') + '</span><span class="tl-note">' + esc(l.session) + '</span></div>').join('')
    /* 任务失败诊断（v19）：blocked/rejected 任务 → 「诊断失败」按钮（失败 toast + 发送给 agent） */
    const failState = t.status === 'blocked' || t.status === 'rejected'
    return '<div class="m2-task-detail">' + tl + ls +
      '<div class="task-detail-actions"><button class="btn small" data-act="trans-demo" data-key="' + esc(t.key) + '">转移状态…</button>' +
      (failState ? '<button class="btn small task-diag-btn" data-act="task-diag" data-key="' + esc(t.key) + '" title="诊断失败原因——toast 呈现，可发送给 agent 修复">诊断失败</button>' : '') +
      '</div></div>'
  }

  /* 任务失败诊断：失败摘要 toast（锚定按钮左侧·含所属背景）+ 发送给 agent（自动发送修复请求——发往任务容器对应模式，v20/v21） */
  const runTaskDiag = (t, anchor) => {
    const recs = (D.records[t.key] || []).slice(-3)
    const reason = t.fix ? 'fix 链任务（源 ' + esc((t.source || '').split('/').pop()) + '）' : (recs.length ? recs[recs.length - 1].note : '（无失败记录）')
    const slug = t.key.split('/')[0]
    const feat = D.features.find((x) => x.slug === slug)
    const prop = D.proposals.find((x) => x.slug === slug)
    const owner = feat
      ? { title: feat.title, kind: 'feature', abstract: feat.abstract, phase: D.PHASE_LABEL[D.featPhase[slug]] }
      : prop ? { title: prop.title, kind: '突击提案', abstract: prop.abstract } : { title: slug, kind: '—', abstract: '（容器信息缺失）' }
    const lines = '<div class="toast-line">所属：' + esc(owner.title) + '（' + esc(owner.kind) + '）' + (owner.phase ? ' · 阶段：' + esc(owner.phase) : '') + '</div>' +
      '<div class="toast-line">摘要：' + esc(owner.abstract) + '</div>' +
      '<div class="toast-line bad">状态：' + esc(ST_LABEL[t.status]) + ' — ' + reason + '</div>' +
      (recs.length ? recs.map((r) => '<div class="toast-line">· ' + esc(r.verb) + ' ' + esc(r.at) + ' — ' + esc(r.note) + '</div>').join('') : '') +
      '<div class="toast-line">任务键：' + esc(t.key) + '</div>'
    S.lastTaskDiag = { key: t.key, title: t.title, featureSlug: slug, status: ST_LABEL[t.status], reason, recs, mode: containerMode(t.key), owner }
    toastRich({ ok: false, ms: 5000, anchor, sendAct: 'task-diag-send', html: '<div class="toast-title">任务失败 · ' + esc(t.title) + '</div>' + lines })
  }

  const taskDiagMessage = (d) => {
    const recLines = d.recs.map((r) => '· ' + r.verb + ' ' + r.at + ' — ' + r.note).join('\n') || '·（暂无）'
    const anchor = d.mode === 'blitz' ? '@docs/proposals/' + d.featureSlug + '/' : '@docs/features/' + d.featureSlug + '/'
    return anchor +
      '\n所属：' + d.owner.title + '（' + d.owner.kind + '）' +
      '\n摘要：' + d.owner.abstract +
      (d.owner.phase ? '\n阶段：' + d.owner.phase : '') +
      '\n任务：' + d.key + ' ' + d.title +
      '\n状态：' + d.status + ' — ' + d.reason +
      '\n失败记录：\n' + recLines +
      '\n请求：请排查修复（任务时间线见概览 → 任务子 tab → 该任务详情）'
  }

  /* 派发指令消息（v23 最小化）：/run-tasks + 容器标识（dispatchTask 唯一必要参数 = contextSlug）；
     池快照冗余（dispatchTask 每次返回自附 PoolSnapshot·裁决⑪）、背景冗余（dispatchPrompt 自带 SOURCE 行）、
     DAG 序 = run-tasks 技能内置纪律——皆非消息义务；自动发送例外成员 */
  const dispatchMessage = (f) => '/run-tasks ' + f.slug

  /* ── DAG 视图（分层 + SVG 贝塞尔 + 箭头 marker） ── */
  const renderDag = (ts) => {
    const byKey = {}; ts.forEach((t) => { byKey[t.key] = t })
    const level = {}
    const lvl = (k) => {
      if (level[k] != null) return level[k]
      const t = byKey[k]; if (!t) return 0
      const ds = (t.deps || []).filter((d) => byKey[d])
      level[k] = ds.length ? Math.max.apply(null, ds.map(lvl)) + 1 : 0
      return level[k]
    }
    ts.forEach((t) => lvl(t.key))
    const cols = []
    ts.forEach((t) => { const l = level[t.key]; cols[l] = cols[l] || []; cols[l].push(t) })
    cols.forEach((col) => col.sort((a, b) => (a.key < b.key ? -1 : 1)))
    const W = 170, H = 64, GX = 14, GY = 40, PAD = 8
    const pos = {}; let maxPer = 0
    cols.forEach((col) => { maxPer = Math.max(maxPer, col.length); col.forEach((t, ri) => { pos[t.key] = { x: PAD + ri * (W + GX), y: PAD + level[t.key] * (H + GY) } }) })
    const cw = PAD * 2 + maxPer * (W + GX) - GX, ch = PAD * 2 + cols.length * (H + GY) - GY
    const defs = '<defs><marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--dsw-border)"/></marker>' +
      '<marker id="dag-arrow-done" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--dsw-ok)"/></marker></defs>'
    let edges = ''
    ts.forEach((t) => {
      (t.deps || []).forEach((d) => {
        if (!byKey[d] || !pos[d]) return
        const a = pos[d], b = pos[t.key]
        const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y
        const my = Math.max(12, (y2 - y1) / 2)
        const isDone = byKey[d].status === 'completed'
        edges += '<path class="' + (isDone ? 'is-done' : '') + '" d="M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + my) + ',' + x2 + ' ' + (y2 - my) + ',' + x2 + ' ' + y2 + '" marker-end="url(#' + (isDone ? 'dag-arrow-done' : 'dag-arrow') + ')"/>'
      })
    })
    const nodes = ts.map((t) => {
      const p = pos[t.key]
      const dot = ST_DOT[t.status] || 'idle'
      return '<div class="dag-node' + (t.status === 'completed' ? ' is-completed' : '') + '" style="left:' + p.x + 'px;top:' + p.y + 'px;height:' + H + 'px;width:' + W + 'px" data-act="dag-node-click" data-key="' + esc(t.key) + '" title="' + esc(t.title) + '">' +
        '<div class="dag-node-top"><span class="state-dot ' + dot + '"></span><span class="dag-node-key">' + esc(t.key.split('/').pop()) + '</span>' +
        (t.fix ? '<span class="chip" style="font-size:9px">fix</span>' : '') + '</div>' +
        '<div class="dag-node-title">' + esc(t.title.slice(0, 30)) + '</div></div>'
    }).join('')
    return '<div class="dag-wrap"><div class="dag-canvas" style="width:' + cw + 'px;height:' + ch + 'px">' +
      '<svg class="dag-svg" viewBox="0 0 ' + cw + ' ' + ch + '" preserveAspectRatio="none" aria-hidden="true">' + defs + edges + '</svg>' + nodes + '</div></div>' +
      '<div class="dag-legend"><span>前置在上 · 箭头指向后续任务</span><span><span class="state-dot done"></span> 完成</span><span><span class="state-dot ok live"></span> 执行中</span><span><span class="state-dot err"></span> 阻塞</span><span>点击节点 → 列表展开</span></div>'
  }

  /* ── 泳道视图（七态横向列 · 0 计数列折叠） ── */
  const renderSwim = (ts) => {
    return '<div class="swim-wrap">' + ST_ORDER.map((st) => {
      const cards = ts.filter((t) => t.status === st)
      const dot = ST_DOT[st]
      if (!cards.length) {
        return '<div class="swim-col swim-col-empty"><div class="swim-col-head" title="无此状态任务"><span class="state-dot ' + dot + '"></span><span>' + ST_LABEL[st] + '</span><span class="cnt">0</span></div></div>'
      }
      const body = cards.map((t) =>
        '<div class="swim-card" data-act="dag-node-click" data-key="' + esc(t.key) + '" title="' + esc(t.title) + '">' +
        '<div class="sc-key">' + esc(t.key.split('/').pop()) + (t.fix ? ' <span class="chip" style="font-size:9px">fix</span>' : '') + '</div>' +
        '<div class="sc-title">' + esc(t.title.slice(0, 26)) + '</div>' +
        '<div class="sc-foot">' + (t.type ? '<span class="t-aux">' + esc(t.type) + '</span>' : '') +
        (D.links.filter((l) => l.key === t.key).length ? ' <span class="task-links">⟞' + D.links.filter((l) => l.key === t.key).length + '</span>' : '') + '</div></div>').join('')
      return '<div class="swim-col"><div class="swim-col-head"><span class="state-dot ' + dot + '"></span><span>' + ST_LABEL[st] + '</span><span class="cnt">' + cards.length + '</span></div>' + body + '</div>'
    }).join('') + '</div>'
  }

  /* ---------- 对话框：评审流转（裁决） ---------- */
  const openReviewDlg = (p) => {
    S.dialogs.review = p
    $('#review-pro-name').textContent = ' · ' + p.title
    const sel = $('#review-target'); sel.textContent = ''
    const allowed = D.allowed[p.status] || []
    if (allowed.length === 0) { sel.disabled = true; sel.append(new Option('（无允许目标态）', '')) }
    else { sel.disabled = false; allowed.forEach(st => sel.append(new Option(D.statusZh[st], st))) }
    $('#review-reason').value = ''
    $('#review-err').hidden = true
    $('#dlg-review').hidden = false
  }

  const confirmReview = () => {
    const p = S.dialogs.review; if (!p) return
    const to = $('#review-target').value
    const reason = $('#review-reason').value.trim()
    if (!reason) { $('#review-err').hidden = false; return }
    p.status = to
    p.verdict = reason
    $('#dlg-review').hidden = true
    render()
    if (to === 'accepted') {
      if (p.mode === 'blitz') {
        toast('突击提案已接受 → 直接进入任务阶段（突击无 feature 阶段——只有提案与任务）：addTask 建任务 + mode 溯源 = blitz')
      } else {
        toast('远征提案已接受 → registerFeature 单步成链（feature 行 + proposal_id 谱系 + feature_records 审计行·原子）')
      }
    } else {
      toast('transitionProposal(' + to + ') ✓ 审计行伴随（与 agent tool 双面同门写库）')
    }
  }

  /* ---------- 对话框：模式更改（律三） ---------- */
  const openModeDlg = (p) => {
    if (!p.mode) { toast('无溯源不可更改（扫描吸收旧提案）'); return }
    S.dialogs.mode = p
    S.dialogs.modePick = p.mode
    $('#mode-pro-name').textContent = ' · ' + p.title
    $('#mode-reason').value = ''
    $('#mode-err').hidden = true
    ;[...$('#mode-seg').children].forEach(b => b.classList.toggle('active', b.dataset.mode === p.mode))
    $('#dlg-mode').hidden = false
  }

  const confirmMode = () => {
    const p = S.dialogs.mode; if (!p) return
    const reason = $('#mode-reason').value.trim()
    if (!reason) { $('#mode-err').hidden = false; return }
    p.mode = S.dialogs.modePick
    $('#dlg-mode').hidden = true
    render()
    toast('溯源字段即时同步（proposal ↔ feature）→ ' + D.modeZh[p.mode] + '；既有任务按创建时快照照旧执行')
  }

  /* ---------- Forge设置（UF-2） ---------- */
  const fsRender = () => {
    $('#fs-provider').value = S.fs.provider
    $('#fs-model').value = S.fs.model
    ;[...$('#fs-reasoning').children].forEach(b => b.classList.toggle('active', b.dataset.v === S.fs.reasoning))
    const filled = S.fs.provider && S.fs.model
    $('#fs-save').disabled = !filled
    $('#fs-unconfigured').hidden = !!filled
  }
  const fsDirty = () => {
    S.fs.provider = $('#fs-provider').value
    S.fs.model = $('#fs-model').value
    fsRender()
  }

  /* ---------- 渲染总入口 ---------- */
  const render = () => {
    document.querySelectorAll('.ov-subtab').forEach(b => b.classList.toggle('active', b.dataset.subtab === S.subtab))
    if (S.subtab === 'proposal') renderProposals()
    else if (S.subtab === 'feature') renderFeatures()
    else renderTasks()
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.task-viewdrop')) document.querySelectorAll('.viewdrop-menu').forEach((m) => { m.hidden = true })
    const act = e.target.closest('[data-act]')?.dataset.act
    if (!act) return
    switch (act) {
      case 'ov-head-toggle': { const i = $('#ov-info'); i.hidden = !i.hidden; break }
      case 'sort-toggle': { S.sort = S.sort === 'active' ? 'created' : 'active'; $('.ov-sort-pill').textContent = S.sort === 'active' ? '⇅ 活跃优先' : '⇅ 最新创建'; render(); break }
      case 'seat-menu': {
        if (S.seatLocked) { toast('首回合后锁定（平台 blank 锁）——不可切换'); return }
        const m = $('#seat-menu'); m.hidden = !m.hidden
        $('[data-act="seat-menu"]').setAttribute('aria-expanded', String(!m.hidden))
        break
      }
      case 'simulate-first-turn': { S.seatLocked = true; $('#seat-menu').hidden = true; seatRender(); toast('首回合已发——座位锁定（平台 blank 锁·UI 表现 = 不可交互）'); break }
      case 'open-settings': { fsRender(); $('#fs-err').hidden = true; $('#dlg-settings').hidden = false; break }
      case 'fs-save': { S.fs.configured = true; $('#fs-err').hidden = true; $('#dlg-settings').hidden = true; toast('已保存（用户 profile 域）——下次 run-tasks 派发经 agentOptions 携带，优先于父会话继承'); break }
      case 'fs-simulate-fail': { $('#fs-err').hidden = false; break }
      case 'settings-close': { $('#dlg-settings').hidden = true; break }
      case 'review-cancel': { $('#dlg-review').hidden = true; break }
      case 'review-confirm': { confirmReview(); break }
      case 'mode-cancel': { $('#dlg-mode').hidden = true; break }
      case 'mode-confirm': { confirmMode(); break }
      case 'theme': { const h = document.documentElement; h.dataset.theme = h.dataset.theme === 'light' ? 'dark' : 'light'; break }
      /* —— 任务子 tab（M2 复刻 + 诊断 + 派发） —— */
      case 'task-view-menu': {
        const menu = e.target.closest('.task-viewdrop').querySelector('.viewdrop-menu')
        menu.hidden = !menu.hidden
        break
      }
      case 'task-view-pick': {
        S.task.view = e.target.closest('[data-act]').dataset.v
        render()
        break
      }
      case 'task-dispatch': {
        const f = containerOf(S.taskFeature); if (!f) break
        const run = runningTaskOf(f.slug)
        if (run) {
          const link = D.links.filter((l) => l.key === run.key && l.kind === 'link').slice(-1)[0]
          const label = link ? link.session : '会话 · 派发链走查'
          openExistingSession(label)
          toast('已跳转到派发会话「' + label + '」——任务 ' + run.key + ' 执行中（不新建会话、不重复发送）')
        } else {
          const mode = f.mode
          openSession(mode, dispatchMessage(f), { autosend: true })
          toast('已新开派发会话（' + (mode === 'blitz' ? '突击' : '远征') + '模式——容器对应模式）并自动发送派发指令（按 DAG 顺序领取执行）')
        }
        break
      }
      case 'tst-chip': { const st = e.target.closest('[data-act]').dataset.st; S.task.chips.has(st) ? S.task.chips.delete(st) : S.task.chips.add(st); render(); break }
      case 'tst-clear': { S.task.chips.clear(); render(); break }
      case 'task-toggle': { const k = e.target.closest('[data-act]').dataset.key; S.taskOpen.has(k) ? S.taskOpen.delete(k) : S.taskOpen.add(k); render(); break }
      case 'task-more': { toast('行操作（M2 交付面——查看详情/转移状态入口同构）'); break }
      case 'trans-demo': { toast('转移状态… = M2 转移对话框（from≠to + reason 必带 + 允许集所见即所得）——本原型不重复演示'); break }
      case 'dag-node-click': { const k = e.target.closest('[data-act]').dataset.key; S.task.view = 'list'; S.taskOpen.add(k); render(); break }
      case 'feat-menu': { featPopover(e); break }
      case 'diag-trigger': { const f = D.features.find((x) => x.slug === S.taskFeature); if (f) runDiag(f); break }
      case 'task-diag': {
        const btn = e.target.closest('[data-act]')
        const t = D.tasks.find((x) => x.key === btn.dataset.key)
        if (t) runTaskDiag(t, btn)
        break
      }
      case 'task-diag-send': {
        const d = S.lastTaskDiag; if (!d) break
        $('#toast').hidden = true; clearTimeout($('#toast')._h)
        openSession(d.mode, taskDiagMessage(d), { autosend: true })
        toast('已打开新会话（' + (d.mode === 'blitz' ? '突击' : '远征') + '模式——任务容器对应模式）并自动发送任务失败诊断')
        break
      }
      case 'diag-send': {
        const d = S.lastDiag; if (!d) break
        $('#toast').hidden = true; clearTimeout($('#toast')._h)
        const checkLines = D.diagChecks.map((chk) => (chk === d.check ? '✗ ' + chk + ' — ' + d.detail : '✓ ' + chk)).join('\n')
        const msg = '@docs/features/' + d.slug + '/' +
          '\n所属：' + d.title + '（feature）' +
          '\n摘要：' + d.abstract +
          (d.phase ? '\n阶段：' + d.phase : '') +
          '\n诊断：validateFeatureTasks 失败\n' + checkLines +
          '\n请求：请排查修复（五类检查 = 派生不变量 / 依赖无环 / Liveness / 记录链完整性 / 拓扑可分层）'
        openSession('expedition', msg, { autosend: true })
        toast('已打开新会话（远征模式）并自动发送诊断错误消息（1 条）')
        break
      }
      case 'sf-send': {
        const input = $('#sf-input')
        const text = input.value.trim()
        if (!text) { toast('消息为空——输入意图后发送'); break }
        const bubble = el('div', 'sf-msg user')
        bubble.append(el('div', 'sf-who', '我'))
        const t = el('div', 'sf-text'); t.textContent = text
        bubble.append(t)
        $('#sf-list').append(bubble)
        input.value = ''
        break
      }
    }
  })
  const featPopover = (e) => {
    document.querySelectorAll('.pop-menu').forEach(n => n.remove())
    const menu = el('div', 'pop-menu')
    taskContainers().forEach((ctr) => {
      const b = el('button', 'pop-item')
      const dot = el('span', 'seat-dot ' + (ctr.mode === 'blitz' ? 'mode-blitz' : 'mode-exp'))
      b.append(dot, document.createTextNode(ctr.title + (ctr.slug === S.taskFeature ? ' ✓' : (ctr.isFeature ? '' : '（突击提案）'))))
      b.addEventListener('click', () => {
        menu.remove()
        if (ctr.slug !== S.taskFeature) { S.taskFeature = ctr.slug; S.taskOpen.clear(); render() }
      })
      menu.append(b)
    })
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px'
    menu.style.top = e.clientY + 'px'
    document.body.append(menu)
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0)
  }
  document.querySelectorAll('.ov-subtab').forEach(b => b.addEventListener('click', () => {
    S.subtab = b.dataset.subtab; S.chips.clear(); S.featChips.clear(); S.task.chips.clear(); S.search = ''; $('#ov-search').value = ''; render()
  }))
  $('#ov-search').addEventListener('input', (e) => { S.search = e.target.value; render() })
  document.querySelectorAll('.seat-opt').forEach(o => o.addEventListener('click', () => {
    S.seat = o.dataset.mode; seatRender()
    toast('已切换至「' + (S.seat === 'expedition' ? '远征模式' : '突击模式') + '」（blank 期可切换；组合投影即时生效）')
  }))
  document.querySelectorAll('#mode-seg .mode-opt').forEach(b => b.addEventListener('click', () => {
    S.dialogs.modePick = b.dataset.mode
    ;[...$('#mode-seg').children].forEach(x => x.classList.toggle('active', x === b))
  }))
  ;['fs-provider', 'fs-model'].forEach(id => { const n = $('#' + id); n.addEventListener('change', fsDirty); n.addEventListener('input', fsDirty) })
  document.querySelectorAll('#fs-reasoning button').forEach(b => b.addEventListener('click', () => {
    S.fs.reasoning = b.dataset.v
    ;[...$('#fs-reasoning').children].forEach(x => x.classList.toggle('active', x === b))
  }))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.dlg-overlay').forEach(d => { d.hidden = true })
  })

  /* ---------- dock 左缘拖拽调宽（概览 tab：诊断/视图切换/feature 切换一行展示） ---------- */
  {
    const frame = document.querySelector('.app-frame')
    const handle = $('#dock-resize')
    let dragging = false
    handle.addEventListener('pointerdown', (e) => {
      dragging = true; handle.classList.add('active')
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      e.preventDefault()
    })
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const w = Math.max(400, Math.min(920, Math.min(window.innerWidth - e.clientX, window.innerWidth - 580)))
      frame.style.gridTemplateColumns = '200px 1fr ' + Math.round(w) + 'px'
    })
    const up = () => { if (dragging) { dragging = false; handle.classList.remove('active') } }
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  seatRender(); render()
})()
