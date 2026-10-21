/* expert-squad prototype v2 interactions: card grid + view/edit dialog */
const experts = [
  { key: 'reviewer', name: '代码评审员', title: '资深评审', enabled: true, updated: '2026-10-18', jobs: 6,
    creed: '以最小改动为美，先证后评。评审只提证据与建议，不代写实现；对每条意见给出文件:行级依据。',
    desc: '承接代码评审任务：对指定 diff 或文件给出正确性、可维护性与令牌合规三方面意见；输出按严重度分级的意见清单（文件:行 + 证据 + 建议），必要时给出最小修复示意，不代写完整实现。',
    skills: ['review', 'tsc', 'oxlint'],
    tools: ['read', 'edit', 'grep'],
    timeline: [['2026-10-01', '入职：确立评审信条与工具白名单'], ['2026-10-12', '参与 expert-squad 提案走查，累计 6 次评审']] },
  { key: 'arch', name: '架构顾问', title: '方案设计', enabled: true, updated: '2026-10-16', jobs: 3,
    creed: '权衡显式化，先辨 XY 问题，再谈方案；每个取舍都给备选与代价。',
    desc: '承接方案与架构评审：辨析真实需求、给出 2–3 个带取舍的业务方案、识别跨模块交互面；输出含备选空间与推荐项的裁决材料。',
    skills: ['design', 'tradeoff'],
    tools: ['read', 'grep', 'web'],
    timeline: [['2026-10-05', '入职：承接方案评审与取舍分析']] },
  { key: 'tester', name: '测试工程师', title: '质量门', enabled: false, updated: '2026-10-10', jobs: 9,
    creed: '证据先行，绝不伪造测试结果；失败一律如实上报。',
    desc: '承接测试执行与质量门：针对性运行受影响测试、按 run-once 纪律执行门禁、如实上报实测结果；失败以 blocked 结算并附证据。',
    skills: ['vitest', 'e2e'],
    tools: ['read', 'edit', 'bash'],
    timeline: [['2026-09-28', '入职：绑定测试执行与质量门纪律']] },
  { key: 'writer', name: '文档撰稿人', title: '技术写作', enabled: true, updated: '2026-10-08', jobs: 4,
    creed: '只写结论与必要上下文，不留过程叙事；图优于文字。',
    desc: '承接设计与验收文档撰写：PRD/走查记录/台账，mermaid 优先，术语随首现固化；不记录修复叙事。',
    skills: ['writing', 'mermaid'],
    tools: ['read', 'edit'],
    timeline: [['2026-10-08', '入职：绑定文档风格公约']] },
]
const $ = s => document.querySelector(s)
const state = { mode: 'data', filter: 'all', q: '', selected: null, editing: false }

function renderGrid() {
  const g = $('#grid')
  if (state.mode === 'loading') { g.innerHTML = '<div class="skeleton-card"></div>'.repeat(6); $('#count').textContent = '扫描专家目录…'; return }
  if (state.mode === 'error') { g.innerHTML = '<div class="errorbar">专家目录扫描失败（权限不足）<button class="btn btn-ghost" onclick="setMode(\'data\')">重试</button></div>'; $('#count').textContent = ''; return }
  if (state.mode === 'empty2') { g.innerHTML = '<div class="empty"><b>还没有专家</b>在会话里对 HR 说「招募一个专家」即可建档</div>'; $('#count').textContent = '0 位专家'; return }
  const items = experts.filter(x => (state.filter === 'all' || (state.filter === 'on') === x.enabled)
    && (!state.q || x.name.includes(state.q) || x.skills.some(s => s.includes(state.q))))
  if (!items.length) { g.innerHTML = '<div class="empty"><b>无匹配专家</b>换个关键词或过滤条件试试</div>'; $('#count').textContent = ''; return }
  g.innerHTML = items.map(x => `
    <div class="dswf-xcard ${x.enabled ? '' : 'off'}" onclick="openDialog('${x.key}','view')">
      <div class="xc-head"><span class="dot ${x.enabled ? 'on' : 'off'}"></span><b>${x.name}</b></div>
      <div class="xc-title">${x.title}${x.enabled ? '' : ' · 已禁用'}</div>
      <div class="xc-creed">${x.creed}</div>
      <div>
        <div class="xc-seg">技能标签</div>
        <div class="xc-tags">${x.skills.map(s => `<span class="chip">${s}</span>`).join('')}</div>
      </div>
      <div>
        <div class="xc-seg">工具白名单（子会话强制）</div>
        <div class="xc-tags">${x.tools.map(s => `<span class="chip tool">${s}</span>`).join('')}</div>
      </div>
      <div class="xc-foot"><span>累计委派 ${x.jobs} 次</span><span>更新于 ${x.updated}</span></div>
    </div>`).join('')
  $('#count').textContent = `${experts.length} 位专家 · 显示 ${items.length}`
}
function setMode(m) { state.mode = m; renderGrid() }
function setFilter(f, btn) { state.filter = f; document.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b === btn)); renderGrid() }
$('#q').addEventListener('input', e => { state.q = e.target.value.trim(); renderGrid() })
function toggleX(key) { const x = experts.find(e => e.key === key); x.enabled = !x.enabled; renderGrid(); toast(`${x.name} 已${x.enabled ? '启用' : '禁用'}`); if (state.selected === key && $('#dlg').classList.contains('show')) openDialog(key, state.editing ? 'edit' : 'view') }

function openDialog(key, mode) {
  const x = experts.find(e => e.key === key); state.selected = key; state.editing = mode === 'edit'
  $('#dlgName').innerHTML = `<span class="dot ${x.enabled ? 'on' : 'off'}"></span> ${x.name}`
  $('#dlgEdit').style.display = state.editing ? 'none' : 'inline-block'
  $('#dlgSave').style.display = state.editing ? 'inline-block' : 'none'
  $('#dlgToggle').textContent = x.enabled ? '禁用' : '启用'
  if (!state.editing) {
    $('#dlgBody').innerHTML = `
      <div class="meta">${x.title} · ${x.enabled ? '启用中' : '已禁用'}</div>
      <div class="seg-title">信条</div><div class="meta">${x.creed}</div>
      <div class="seg-title">能力描述</div><div class="meta">${x.desc}</div>
      <div class="seg-title">技能标签</div><div class="chips">${x.skills.map(s => `<span class="chip">${s}</span>`).join('')}</div>
      <div class="seg-title">工具白名单（子会话强制生效）</div><div class="chips">${x.tools.map(s => `<span class="chip">${s}</span>`).join('')}</div>
      <details style="margin-top:4px">
        <summary class="seg-title" style="cursor:pointer">履历时间轴（${x.timeline.length}）</summary>
        <div class="timeline" style="margin-top:8px">${x.timeline.map(([d, t]) => `<div class="tl-item"><b>${t}</b><span>${d}</span></div>`).join('')}</div>
      </details>`
  } else {
    $('#dlgBody').innerHTML = `
      <div class="field" id="fTitle"><label>岗位</label><input type="text" value="${x.title}"><div class="err">岗位不能为空</div></div>
      <div class="field" id="fCreed"><label>信条 / 简介</label><textarea>${x.creed}</textarea><div class="err">信条含裸 {{ ——不被允许</div></div>
      <div class="field" id="fDesc"><label>能力描述（这位专家具体能做什么）</label><textarea>${x.desc}</textarea></div>
      <div class="field" id="fTools"><label>工具白名单（子会话强制生效 · 点击选中/取消，输入回车新增）</label></div>
      <div class="field" id="fSkills"><label>技能标签（点击移除，输入回车新增）</label></div>`
    // 统一 chips 编辑器（仅编辑态字段在场）：点击候选选用、点击已选移除、输入回车新增
    mountChipEdit('#fTools', x.tools, ['read', 'edit', 'bash', 'grep', 'web', 'skill'])
    mountChipEdit('#fSkills', x.skills, [])
  }
  $('#ov').style.display = 'flex'
  $('#dlgHost').style.display = 'flex'
}
function mountChipEdit(fieldSel, selected, candidates) {
  const field = $(fieldSel)
  const box = document.createElement('div'); box.className = 'chipedit'
  function chipEl(v, cls) {
    const c = document.createElement('span'); c.className = 'chip ' + cls; c.textContent = v
    c.onclick = () => { if (c.classList.contains('uns')) c.classList.replace('uns', 'sel'); else c.remove() }
    return c
  }
  function render() {
    const chosen = [...box.querySelectorAll('.chip.sel')].map(c => c.textContent)
    box.innerHTML = ''
    chosen.forEach(v => box.appendChild(chipEl(v, 'sel')))
    candidates.filter(c => !chosen.includes(c)).forEach(c => box.appendChild(chipEl(c, 'uns')))
    const inp = document.createElement('input'); inp.placeholder = '输入后回车新增'
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inp.value.trim()) {
        const v = inp.value.trim().replace(/\{\{/g, '')
        if (v && ![...box.querySelectorAll('.chip')].some(c => c.textContent === v)) box.insertBefore(chipEl(v, 'sel'), inp)
        inp.value = ''
      }
    })
    box.appendChild(inp)
  }
  render()
  field.appendChild(box)
}
function switchMode() { openDialog(state.selected, state.editing ? 'view' : 'edit') }
function saveDialog() {
  if ($('#fCreed textarea').value.includes('{{')) { $('#fCreed').classList.add('bad'); return }
  const x = experts.find(e => e.key === state.selected)
  x.title = $('#fTitle input').value || x.title
  x.creed = $('#fCreed textarea').value
  x.desc = $('#fDesc textarea').value
  x.skills = [...document.querySelectorAll('#fSkills .chipedit .chip.sel')].map(c => c.textContent)
  x.tools = [...document.querySelectorAll('#fTools .chipedit .chip.sel')].map(c => c.textContent)
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
    experts.push({ key: 'x' + Date.now(), name: name2, title: '新入职', enabled: true, updated: '刚刚', jobs: 0,
      creed: '（HR 按你的要求起草，可在详情 Dialog 编辑）' + text, skills: ['new'],
      tools: /读写/.test(text) ? ['read', 'edit'] : ['read', 'grep'],
      timeline: [['今天', '入职：由 HR 依对话需求建档']] })
    think.innerHTML = `已建档 <b>${name2}</b>：信条与工具白名单按你的要求起草，详情卡片可继续编辑。<div class="ref">面板列表已刷新 · 档案正本已落专家目录</div>`
    $('#hrMsgs').scrollTop = 1e9
    renderGrid()
  }, 900)
}
$('#hrIn').addEventListener('keydown', e => { if (e.key === 'Enter') hrSend() })
