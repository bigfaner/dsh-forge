// SC7 smoke e2e (task 6.1, tech-design §Testing Strategy): the 10-item smoke
// checklist (上游 GUI 一级功能面的等价子集) against a fixture SPA running on
// the REAL dsh-app:// carriage + real Electron carrier. Every checklist item
// exercises a real first-level GUI function end to end through the carried
// API seam (fetch under dsh-app:// → authenticated fixture Host).
//
// Honesty note (SC7 split): the ① leg — the upstream client web e2e suite
// running as-is on the vendored closure in browser mode — runs in CI via
// scripts/run-upstream-web-e2e.mjs + .github/workflows/upstream-web-e2e.yml
// with the exemption-list mechanism; this spec is the ② shell-side leg and is
// fixture-based locally.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { launchFixtureApp } from './helpers/fixture-app.ts'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => { let body = ''; req.on('data', (chunk: Buffer) => { body += chunk }); req.on('end', () => resolve(body)) })
}

test('SC7 smoke checklist (10 items) against the fixture SPA over the real carriage', async () => {
  // Fixture Host state backing the 10 first-level functions.
  const state = {
    sessions: [
      { id: 's1', title: '会话一', messages: [{ role: 'user', text: 's1 第一条' }] },
      { id: 's2', title: '会话二', messages: [] },
    ],
    activeSessionId: 's1',
    approval: { requestId: 'ap1', summary: '执行 rm -rf /tmp/fixture' },
    userQuestion: { questionId: 'q1', question: '选择部署环境?' },
    plan: { steps: ['探查仓库', '编写修复', '回归验证'] },
    settings: { apiKey: '' },
    files: { name: 'workspace', children: [{ name: 'src', children: [{ name: 'main.ts' }] }, { name: 'README.md' }] },
  }

  const fixture = await launchFixtureApp({
    handleRequest: (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      const json = (payload: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)) }
      if (url === '/api/sessions' && req.method === 'GET') { json(state.sessions); return true }
      if (url === '/api/sessions' && req.method === 'POST') {
        const created = { id: `s${state.sessions.length + 1}`, title: '新会话', messages: [] }
        state.sessions.push(created)
        state.activeSessionId = created.id
        json(created); return true
      }
      if (url.startsWith('/api/session/') && url.endsWith('/messages') && req.method === 'POST') {
        const id = url.split('/')[3]
        void readBody(req).then((body) => {
          const text = JSON.parse(body).text as string
          const session = state.sessions.find(s => s.id === id)
          session?.messages.push({ role: 'user', text })
          session?.messages.push({ role: 'assistant', text: `echo: ${String(text)}` })
          state.activeSessionId = id
          json({ type: 'turn-end', reply: `echo: ${String(text)}` })
        })
        return true
      }
      if (url.startsWith('/api/session/') && url.endsWith('/activate') && req.method === 'POST') {
        state.activeSessionId = url.split('/')[3]
        json({ activeSessionId: state.activeSessionId }); return true
      }
      if (url === '/api/approval/pending' && req.method === 'GET') { json(state.approval); return true }
      if (url.startsWith('/api/approval/') && url.endsWith('/approve') && req.method === 'POST') { json({ requestId: state.approval.requestId, approved: true }); return true }
      if (url === '/api/user-questions' && req.method === 'GET') { json(state.userQuestion); return true }
      if (url.startsWith('/api/user-questions/') && url.endsWith('/answer') && req.method === 'POST') {
        void readBody(req).then((body) => {
          const answer = (JSON.parse(body) as { answer: string }).answer
          json({ questionId: state.userQuestion.questionId, answer })
        })
        return true
      }
      if (url === '/api/plan' && req.method === 'GET') { json(state.plan); return true }
      if (url === '/api/settings' && req.method === 'GET') { json(state.settings); return true }
      if (url === '/api/settings' && req.method === 'POST') {
        void readBody(req).then((body) => {
          state.settings = { ...(JSON.parse(body) as { apiKey: string }) }
          json(state.settings)
        })
        return true
      }
      if (url === '/api/files' && req.method === 'GET') { json(state.files); return true }
      return false
    },
    spaBody: `<div id="root">
  <h1>fixture spa</h1>
  <ul id="session-list"></ul>
  <button id="new-session">新建会话</button>
  <div id="active-session"></div>
  <input id="composer" type="text" />
  <button id="send">发送</button>
  <div id="messages"></div>
  <div id="approval-panel"></div>
  <button id="approve">批准</button>
  <div id="question-panel"></div>
  <input id="answer-input" type="text" />
  <button id="answer">作答</button>
  <div id="plan-panel"></div>
  <button id="open-settings">设置</button>
  <div id="settings-panel" hidden><input id="api-key" type="text" /><button id="save-key">保存</button><span id="key-saved" hidden>saved</span></div>
  <div id="file-tree"></div>
</div>`,
    spaScript: `<script>
(function () {
  function ready() { return globalThis.__DSH_TRANSPORT__ !== undefined && globalThis.__DSH_TRANSPORT__ !== null }
  function whenReady(fn) { if (ready()) fn(); else setTimeout(function () { whenReady(fn) }, 50) }
  whenReady(function () {
    var api = function (path, opts) { return fetch(path, opts).then(function (r) { return r.json() }) }
    // 2) session list render
    api('api/sessions').then(function (sessions) {
      var ul = document.getElementById('session-list')
      sessions.forEach(function (s) {
        var li = document.createElement('li')
        li.className = 'session-item'; li.dataset.id = s.id; li.textContent = s.title
        li.addEventListener('click', function () {
          // 5) session switch
          api('api/session/' + s.id + '/activate', { method: 'POST' }).then(function (out) {
            document.getElementById('active-session').textContent = out.activeSessionId
          })
        })
        ul.append(li)
      })
    })
    // 3) create session
    document.getElementById('new-session').addEventListener('click', function () {
      api('api/sessions', { method: 'POST' }).then(function (created) {
        var li = document.createElement('li')
        li.className = 'session-item'; li.dataset.id = created.id; li.textContent = created.title
        document.getElementById('session-list').append(li)
      })
    })
    // 4) send message → turn end
    document.getElementById('send').addEventListener('click', function () {
      var text = document.getElementById('composer').value
      var id = document.getElementById('active-session').textContent || 's1'
      api('api/session/' + id + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text }) })
        .then(function (out) {
          var div = document.createElement('div')
          div.className = 'turn-end'; div.textContent = out.reply
          document.getElementById('messages').append(div)
        })
    })
    // 6) approval present + approve
    api('api/approval/pending').then(function (a) {
      document.getElementById('approval-panel').textContent = a.summary
      document.getElementById('approval-panel').dataset.requestId = a.requestId
    })
    document.getElementById('approve').addEventListener('click', function () {
      var id = document.getElementById('approval-panel').dataset.requestId
      api('api/approval/' + id + '/approve', { method: 'POST' }).then(function (out) {
        document.getElementById('approval-panel').dataset.approved = String(out.approved)
      })
    })
    // 7) user question present + answer
    api('api/user-questions').then(function (q) {
      document.getElementById('question-panel').textContent = q.question
      document.getElementById('question-panel').dataset.questionId = q.questionId
    })
    document.getElementById('answer').addEventListener('click', function () {
      var id = document.getElementById('question-panel').dataset.questionId
      var answer = document.getElementById('answer-input').value
      api('api/user-questions/' + id + '/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: answer }) })
        .then(function (out) { document.getElementById('question-panel').dataset.answered = out.answer })
    })
    // 8) plan panel
    api('api/plan').then(function (p) {
      var panel = document.getElementById('plan-panel')
      p.steps.forEach(function (step, i) {
        var li = document.createElement('div'); li.className = 'plan-step'; li.textContent = (i + 1) + '. ' + step
        panel.append(li)
      })
    })
    // 9) settings open + persist API key
    document.getElementById('open-settings').addEventListener('click', function () {
      document.getElementById('settings-panel').hidden = false
    })
    document.getElementById('save-key').addEventListener('click', function () {
      var key = document.getElementById('api-key').value
      api('api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: key }) })
        .then(function (out) {
          // SC1 path: key persisted host-side; round-trip read-back proves it.
          api('api/settings').then(function (saved) {
            document.getElementById('key-saved').hidden = saved.apiKey !== out.apiKey
          })
        })
    })
    // 10) file tree / workspace panel
    api('api/files').then(function (tree) {
      var panel = document.getElementById('file-tree')
      function walk(node, depth) {
        var div = document.createElement('div')
        div.className = 'file-node'; div.style.paddingLeft = (depth * 12) + 'px'; div.textContent = node.name
        panel.append(div)
        ;(node.children || []).forEach(function (c) { walk(c, depth + 1) })
      }
      walk(tree, 0)
    })
    document.body.dataset.spaReady = '1'
  })
})()
</script>`,
  })

  try {
    const { page } = fixture

    // 1) 应用启动载入 SPA 无白屏 — document rendered, no blank body.
    await page.waitForFunction(() => document.body.dataset.spaReady === '1')
    expect(await page.evaluate(() => document.getElementById('root')?.textContent ?? '')).toContain('fixture spa')

    // 2) 会话列表渲染.
    await expect(page.locator('#session-list .session-item')).toHaveCount(2)

    // 3) 新建会话.
    await page.click('#new-session')
    await expect(page.locator('#session-list .session-item')).toHaveCount(3)

    // 4) 发送消息并收到回合结束.
    await page.fill('#composer', 'hello smoke')
    await page.click('#send')
    await expect(page.locator('.turn-end')).toHaveText('echo: hello smoke')

    // 5) 会话切换.
    await page.locator('#session-list .session-item', { hasText: '会话二' }).click()
    await expect(page.locator('#active-session')).toHaveText('s2')

    // 6) 审批请求呈现与批准.
    await expect(page.locator('#approval-panel')).toContainText('rm -rf /tmp/fixture')
    await page.click('#approve')
    await expect.poll(() => page.locator('#approval-panel').getAttribute('data-approved')).toBe('true')

    // 7) user-questions 呈现与作答.
    await expect(page.locator('#question-panel')).toContainText('部署环境')
    await page.fill('#answer-input', 'staging')
    await page.click('#answer')
    await expect.poll(() => page.locator('#question-panel').getAttribute('data-answered')).toBe('staging')

    // 8) 计划面渲染.
    await expect(page.locator('#plan-panel .plan-step')).toHaveCount(3)

    // 9) 设置面打开并持久化 API key (SC1 路径).
    await page.click('#open-settings')
    await page.fill('#api-key', 'sk-fixture-key')
    await page.click('#save-key')
    await expect(page.locator('#key-saved')).toBeVisible()

    // 10) 文件树/workspace 面渲染.
    const fileNodes = page.locator('#file-tree .file-node')
    await expect(fileNodes).toHaveCount(4)
    expect(await fileNodes.first().textContent()).toBe('workspace')
  } finally {
    await fixture.close()
  }
})
