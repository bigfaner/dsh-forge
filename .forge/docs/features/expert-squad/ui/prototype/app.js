/* expert-squad prototype v2 interactions: card grid + view/edit dialog */
const experts = [
  { id: 'code-reviewer', name: '代码评审员', title: '资深评审', enabled: true, updated: '2026-10-18', origin: 'project',
    description: 'Runs code review on diffs/files: correctness, maintainability, token-compliance; severity-ranked findings.',
    desc: '## 职责\n- 承接代码评审任务：对指定 diff 或文件给出正确性、可维护性与令牌合规三方面意见\n- 输出按严重度分级的意见清单（文件:行 + 证据 + 建议）\n## 边界\n- 不代写完整实现；必要时给出最小修复示意\n## 信条\n以最小改动为美，先证后评；对每条意见给出文件:行级依据。',
    skills: ['review', 'tsc', 'oxlint'],
    tools: ['read', 'edit', 'grep'],
    // 1.60 聚组形态：同键低层来源（被遮蔽卡——只读，点击展开对比）
    layers: [
      { origin: 'user', title: '资深评审·用户定制', updated: '2026-10-20', tools: ['read', 'grep'], skills: ['review'],
        description: 'Runs code review on diffs/files.',
        desc: '## 职责\n- 承接代码评审任务：给出正确性与可维护性意见\n## 信条\n先证后评。' },
    ] },
  { id: 'arch-advisor', name: '架构顾问', title: '方案设计', enabled: true, updated: '2026-10-16', origin: 'user',
    description: 'Reviews proposals: clarifies the real need, produces 2-3 options with explicit tradeoffs and seams.',
    desc: '## 职责\n- 承接方案与架构评审：辨析真实需求、给出 2–3 个带取舍的业务方案\n- 识别跨模块交互面；输出含备选空间与推荐项的裁决材料\n## 信条\n权衡显式化，先辨 XY 问题，再谈方案；每个取舍都给备选与代价。',
    skills: ['design', 'tradeoff'],
    tools: ['read', 'grep', 'web'] },
  { id: 'test-gatekeeper', name: '测试工程师', title: '质量门', enabled: false, updated: '2026-10-10', origin: 'project',
    description: 'Executes quality gates run-once; reports real results only; failures settle as blocked with evidence.',
    desc: '## 职责\n- 针对性运行受影响测试，按 run-once 纪律执行门禁\n- 如实上报实测结果；失败以 blocked 结算并附证据\n## 信条\n证据先行，绝不伪造测试结果。',
    skills: ['vitest', 'e2e'],
    tools: ['read', 'edit', 'bash'] },
  { id: 'doc-writer', name: '文档撰稿人', title: '技术写作', enabled: true, updated: '2026-10-08', origin: 'plugin',
    description: 'Writes specs/walkthroughs/ledgers: conclusions only, mermaid-first, no fix-narrative.',
    desc: '## 职责\n- 承接设计与验收文档：PRD/走查记录/台账，mermaid 优先\n- 术语随首现固化；不记录修复叙事\n## 信条\n只写结论与必要上下文，不留过程叙事。',
    skills: ['writing', 'mermaid'],
    tools: ['read', 'edit'] },
]
const $ = s => document.querySelector(s)
const state = { mode: 'data', filter: 'all', q: '', selected: null, editing: false }

const originLabel = o => ({ project: '项目', user: '用户', plugin: '内置' }[o] || o)
const cmpFields = [['title', '岗位'], ['description', '简介'], ['desc', '人设'], ['tools', '工具白名单'], ['skills', '技能']]
const fieldOf = (x, f) => Array.isArray(x[f]) ? x[f].join(',') : String(x[f] ?? '')

function cardHtml(x) {
  return `
    <div class="dswf-xcard ${x.enabled ? '' : 'off'}" onclick="openDialog('${x.id}','view')">
      <div class="xc-head"><span class="dot ${x.enabled ? 'on' : 'off'}"></span><b>${x.name}</b><span class="chip tool">${x.id}</span><span class="origin-badge origin-${x.origin}">${originLabel(x.origin)}</span><span class="eff-badge">生效</span></div>
      <div class="xc-title">${x.title}${x.enabled ? '' : ' · 已禁用'}</div>
      <div class="xc-creed">${x.desc}</div>
      <div>
        <div class="xc-seg">技能标签</div>
        <div class="xc-tags">${x.skills.map(s => `<span class="chip">${s}</span>`).join('')}</div>
      </div>
      <div>
        <div class="xc-seg">工具白名单（子会话强制）</div>
        <div class="xc-tags">${x.tools.map(s => `<span class="chip tool">${s}</span>`).join('')}</div>
      </div>
      <div class="xc-foot"><span>更新于 ${x.updated}</span></div>
    </div>`
}

function compareHtml(x, shadow) {
  return `
    <div class="dswf-xcompare">
      <table class="cmp-table">
        <tr><th>字段</th><th><span class="origin-badge origin-${x.origin}">${originLabel(x.origin)}</span> <span class="eff-badge">生效</span></th><th><span class="origin-badge origin-${shadow.origin}">${originLabel(shadow.origin)}</span></th></tr>
        ${cmpFields.map(([f, label]) => {
          const diff = fieldOf(x, f) !== fieldOf(shadow, f)
          const cell = v => Array.isArray(v) ? v.map(s => `<span class="chip">${s}</span>`).join('') : String(v ?? '')
          return `<tr><th>${label}</th><td class="${diff ? 'diff' : ''}">${cell(x[f])}</td><td class="${diff ? 'diff' : ''}">${cell(shadow[f])}</td></tr>`
        }).join('')}
      </table>
      <div class="cmp-note">与生效卡不同的字段已高亮 · 被遮蔽卡只读</div>
    </div>`
}

function renderGrid() {
  const g = $('#grid')
  if (state.mode === 'loading') { g.innerHTML = '<div class="skeleton-card"></div>'.repeat(6); $('#count').textContent = '扫描专家目录…'; return }
  if (state.mode === 'error') { g.innerHTML = '<div class="errorbar">专家目录扫描失败（权限不足）<button class="btn btn-ghost" onclick="setMode(\'data\')">重试</button></div>'; $('#count').textContent = ''; return }
  if (state.mode === 'empty2') { g.innerHTML = '<div class="empty"><b>还没有专家</b>在会话里对 HR 说「招募一个专家」即可建档</div>'; $('#count').textContent = '0 位专家'; return }
  const items = experts.filter(x => (state.filter === 'all' || (state.filter === 'on') === x.enabled)
    && (!state.q || x.name.includes(state.q) || x.id.includes(state.q) || x.skills.some(s => s.includes(state.q))))
  if (!items.length) { g.innerHTML = '<div class="empty"><b>无匹配专家</b>换个关键词或过滤条件试试</div>'; $('#count').textContent = ''; return }
  // 同键聚组（1.60 用户裁决）：生效卡首张 + 被遮蔽折叠摘要行 + 展开对比（差异格高亮）
  g.innerHTML = items.map(x => {
    const layers = x.layers ?? []
    if (!layers.length) return cardHtml(x)
    const shadowRows = layers.map((sh, i) => `
      <button type="button" class="dswf-xshadow" onclick="toggleCmp('${x.id}',${i})" aria-expanded="false">
        <span class="origin-badge origin-${sh.origin}">${originLabel(sh.origin)}</span>
        <span class="xs-title">${sh.title}</span>
        <span class="xs-updated">${sh.updated}</span>
        <span class="xs-mark">被遮蔽 · 只读</span>
      </button>
      <div class="cmp-slot" id="cmp-${x.id}-${i}" style="display:none">${compareHtml(x, sh)}</div>`).join('')
    return `
      <section class="dswf-xgroup multi" data-expert-key="${x.id}">
        <header class="xg-head"><b class="xg-name">${x.id}</b><span>${layers.length + 1} 个来源</span><button type="button" class="xg-spread" onclick="toggleCmp('${x.id}',0)">展开对比</button></header>
        ${cardHtml(x)}
        ${shadowRows}
      </section>`
  }).join('')
  $('#count').textContent = `${experts.length} 位专家 · 显示 ${items.length}`
}
function toggleCmp(key, i) {
  const slot = document.getElementById(`cmp-${key}-${i}`)
  if (slot) slot.style.display = slot.style.display === 'none' ? '' : 'none'
}
function setMode(m) { state.mode = m; renderGrid() }
function setFilter(f) { state.filter = f; renderGrid() }
$('#q').addEventListener('input', e => { state.q = e.target.value.trim(); renderGrid() })
function toggleX(key) { const x = experts.find(e => e.id === key); x.enabled = !x.enabled; renderGrid(); toast(`${x.name} 已${x.enabled ? '启用' : '禁用'}`); if (state.selected === key && $('#dlgHost').style.display === 'flex') openDialog(key, state.editing ? 'edit' : 'view') }

function openDialog(key, mode) {
  const x = experts.find(e => e.id === key); state.selected = key; state.editing = mode === 'edit'
  $('#dlgName').innerHTML = `<span class="dot ${x.enabled ? 'on' : 'off'}"></span> ${x.name} <span class="chip tool">${x.id}</span>`
  $('#dlgEdit').style.display = state.editing ? 'none' : 'inline-block'
  $('#dlgSave').style.display = state.editing ? 'inline-block' : 'none'
  $('#dlgToggle').textContent = x.enabled ? '禁用' : '启用'
  $('#dlgToggle').style.display = state.editing ? 'none' : 'inline-block'
  if (!state.editing) {
    $('#dlgBody').innerHTML = `
      <div class="meta">${x.title} · ${x.enabled ? '启用中' : '已禁用'}</div>
      <div class="seg-title">简介（何时委派我）</div><div class="meta">${x.description}</div>
      <div class="seg-title">人设（Persona · 派发时注入子会话）</div><div class="meta md">${renderMd(x.desc)}</div>
      <div class="seg-title">工具白名单（子会话强制生效）</div><div class="chips">${x.tools.map(s => `<span class="chip">${s}</span>`).join('')}</div>
      <div class="seg-title">技能标签</div><div class="chips">${x.skills.map(s => `<span class="chip">${s}</span>`).join('')}</div>`
  } else {
    $('#dlgBody').innerHTML = `
      <div class="field" id="fTitle"><label>岗位</label><input type="text" value="${x.title}"><div class="err">岗位不能为空</div></div>
      <div class="field" id="fDescription"><label>简介（模型选人依据：何时委派我 · 默认 2 行，最多 6 行 ≈ 120 字）</label><textarea rows="2" class="autosize" data-min="46" data-max="134" maxlength="120">${x.description}</textarea></div>
      <div class="field" id="fBody"><label>人设（Markdown 自由输入 · 派发时作为 persona 注入子会话：做什么/不做什么 · 怎么做的原则 · 默认 12 行，最多 100 行）</label><textarea rows="12" class="autosize" data-min="266" data-max="2202">${x.desc}</textarea><div class="err">含裸 {{ ——不被允许</div></div>
      <div class="field" id="fTools"><label>工具白名单（子会话强制生效 · 多选）</label></div>
      <div class="field" id="fSkills"><label>技能标签（多选，可新增）</label></div>`
    mountMsel('#fTools', x.tools, ['read', 'edit', 'bash', 'grep', 'web', 'skill'], false)
    mountMsel('#fSkills', x.skills, [...new Set(experts.flatMap(e => e.skills))], true)
    document.querySelectorAll('#dlg textarea.autosize').forEach(autosize)
  }
  $('#ov').style.display = 'flex'
  $('#dlgHost').style.display = 'flex'
}
/* 简化 Markdown 渲染（产品实现走官方 MarkdownDoc，此为原型近似）：标题、加粗、行内代码、列表 */
function renderMd(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = esc(src).split('\n')
  const out = []
  let inList = false
  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code style="font-family:Consolas,monospace;font-size:12px">$1</code>')
    if (/^#{1,3}\s/.test(line)) { if (inList) { out.push('</ul>'); inList = false } out.push(`<b style="display:block;margin-top:4px">${line.replace(/^#+\s/, '')}</b>`) }
    else if (/^[-*]\s/.test(line)) { if (!inList) { out.push('<ul style="margin:2px 0 2px 18px;padding:0">'); inList = true } out.push(`<li>${line.replace(/^[-*]\s/, '')}</li>`) }
    else { if (inList) { out.push('</ul>'); inList = false } if (line.trim()) out.push(`<div>${line}</div>`) }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}
/* textarea 自适应行数：默认 data-min，随内容增长至 data-max 上限，自动换行 */
function autosize(ta) {
  const grow = () => {
    ta.style.height = 'auto'
    ta.style.height = Math.min(Math.max(ta.scrollHeight, +ta.dataset.min), +ta.dataset.max) + 'px'
    ta.style.overflowY = ta.scrollHeight > +ta.dataset.max ? 'auto' : 'hidden'
  }
  ta.addEventListener('input', grow)
  grow()
}
/* multi-select：box 显示已选 chips + 下拉勾选菜单；allowAdd 时菜单尾部可输入新增 */
function mountMsel(fieldSel, selected, candidates, allowAdd) {
  const field = $(fieldSel)
  const wrap = document.createElement('div'); wrap.className = 'msel'
  const chosen = new Set(selected)
  const box = document.createElement('div'); box.className = 'msel-box'
  const menu = document.createElement('div'); menu.className = 'msel-menu'
  function renderBox() {
    box.innerHTML = chosen.size
      ? [...chosen].map(v => `<span class="chip">${v}</span>`).join('') + '<span class="msel-caret">▾</span>'
      : '<span class="placeholder">点击选择</span><span class="msel-caret">▾</span>'
  }
  function renderMenu() {
    const opts = [...new Set([...candidates, ...chosen])]
    menu.innerHTML = opts.map(v => `<label class="msel-row"><input type="checkbox" ${chosen.has(v) ? 'checked' : ''}> ${v}</label>`).join('')
      + (allowAdd ? `<div class="msel-add"><input placeholder="新增后回车"><button class="btn btn-ghost">添加</button></div>` : '')
    menu.querySelectorAll('.msel-row input').forEach(cb => cb.addEventListener('change', () => {
      cb.checked ? chosen.add(cb.parentElement.textContent.trim()) : chosen.delete(cb.parentElement.textContent.trim())
      renderBox()
    }))
    const addBtn = menu.querySelector('.msel-add button')
    if (addBtn) {
      const add = () => {
        const v = menu.querySelector('.msel-add input').value.trim().replace(/\{\{/g, '')
        if (v && !opts.includes(v)) { chosen.add(v); renderMenu(); renderBox() }
      }
      addBtn.onclick = add
      menu.querySelector('.msel-add input').addEventListener('keydown', e => { if (e.key === 'Enter') add() })
    }
  }
  box.addEventListener('click', () => {
    const opening = !wrap.classList.contains('open')
    wrap.classList.toggle('open')
    if (opening) renderMenu()
  })
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) wrap.classList.remove('open') })
  renderBox()
  wrap.appendChild(box); wrap.appendChild(menu)
  field.appendChild(wrap)
}
function switchMode() { openDialog(state.selected, state.editing ? 'view' : 'edit') }
function saveDialog() {
  if ($('#fBody textarea').value.includes('{{')) { $('#fBody').classList.add('bad'); return }
  const x = experts.find(e => e.id === state.selected)
  x.title = $('#fTitle input').value || x.title
  x.desc = $('#fBody textarea').value
  x.description = $('#fDescription textarea').value
  x.skills = [...document.querySelectorAll('#fSkills .msel-row input:checked')].map(cb => cb.parentElement.textContent.trim())
  x.tools = [...document.querySelectorAll('#fTools .msel-row input:checked')].map(cb => cb.parentElement.textContent.trim())
  toast('档案已保存（热刷新生效）'); openDialog(state.selected, 'view'); renderGrid()
}
function closeDialog() { $('#dlgHost').style.display = 'none'; $('#ov').style.display = 'none' }
let toastTimer
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800) }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDialog(); closeHr() } })
setMode('data')

/* HR recruit chat */
function openHr() {
  $('#ov').style.display = 'flex'
  $('#hrHost').style.display = 'flex'
  if (!$('#hrMsgs').children.length) hrSay('你好，我是 HR，负责专家的招聘与管理。<div class="ref">试试：「招募一个数据库迁移专家，工具只留读写与检索」</div>')
}
function closeHr() { $('#hrHost').style.display = 'none'; if ($('#dlgHost').style.display !== 'flex') $('#ov').style.display = 'none' }
function hrSay(html) {
  const m = document.createElement('div'); m.className = 'msg hr'; m.innerHTML = html
  $('#hrMsgs').appendChild(m); $('#hrMsgs').scrollTop = 1e9
}
function hrSend() {
  const inp = $('#hrIn'); const text = inp.value.trim(); if (!text) return
  inp.value = ''
  const me = document.createElement('div'); me.className = 'msg me'; me.textContent = text
  $('#hrMsgs').appendChild(me); $('#hrMsgs').scrollTop = 1e9
  const think = document.createElement('div'); think.className = 'msg hr'; think.textContent = '正在建档…'
  $('#hrMsgs').appendChild(think); $('#hrMsgs').scrollTop = 1e9
  setTimeout(() => {
    const m = text.match(/招募一个(.+?)(?:专家|师)?(?:[，,。].*)?$/)
    const name = m ? m[1] + '专家' : '新专家'
    const name2 = experts.some(e => e.name === name) ? name + ' II' : name
    const id = 'expert-' + Date.now().toString(36)
    experts.push({ id, name: name2, title: '新入职', enabled: true, updated: '刚刚',
      description: 'Newly onboarded by HR: ' + text,
      desc: '（HR 按你的要求起草的人设，可在详情 Dialog 编辑）依对话需求执行：' + text, skills: ['new'],
      tools: /读写/.test(text) ? ['read', 'edit'] : ['read', 'grep'] })
    think.innerHTML = `已建档 <b>${name2}</b>（<span class="chip tool">${id}</span>）：人设与工具白名单按你的要求起草，详情卡片可继续编辑。<div class="ref">面板列表已刷新 · 档案正本已落专家目录</div>`
    $('#hrMsgs').scrollTop = 1e9
    renderGrid()
  }, 900)
}
$('#hrIn').addEventListener('keydown', e => { if (e.key === 'Enter') hrSend() })
