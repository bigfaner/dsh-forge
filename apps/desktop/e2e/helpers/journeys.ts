// Shared journey fixture (gen-test-scripts, T-test-gen-scripts): a fixture
// "upstream GUI" SPA rendered inside the real Electron carrier on dsh-app://,
// backed by an in-memory host API that emulates the upstream web GUI surfaces
// (sessions/chat, approval, plan, settings/credentials, file tree, workspace
// switching) and persists every mutation to a JSON file standing in for the
// shared $DSH_HOME "upstream existing format" store.
//
// Web E2E Test surface: assertions live on the carrier page (dsh-app://) and
// the fixture host API; OS-level qualifiers (real tray icon, OS notification,
// installer, CLI) are annotated per test where the contract declares them.
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { launchFixtureApp, type FixtureApp, type FixtureAppOptions } from './fixture-app.ts'

export interface ChatEntry { role: 'user' | 'assistant' | 'tool' | 'system'; content: string; kind?: 'message' | 'tool' | 'approval' | 'question' }

export interface UpstreamSession {
  id: string
  title: string
  created_by: 'web-gui' | 'cli' | 'official-desktop' | 'dsh-forge'
  workspace: string
  state: 'idle' | 'streaming' | 'waiting' | 'expired-token'
  history: ChatEntry[]
}

export interface UpstreamState {
  workspaces: Array<{ name: string; sessions: string[]; fileTree: string[] }>
  sessions: UpstreamSession[]
  settings: Record<string, unknown>
  credential: { value: string; masked: string } | null
  /** When true the host rejects the next message sends with 401 (session-expired). */
  sessionExpired: boolean
  /** When true every write to the upstream store fails (500, no partial write). */
  storageWriteFails: boolean
}

export interface UpstreamFixture {
  fixture: FixtureApp
  state: UpstreamState
  /** JSON file every mutation is persisted to ("upstream existing format"). */
  stateFile: string
  close(): Promise<void>
}

export function defaultState(patch: Partial<UpstreamState> = {}): UpstreamState {
  const base: UpstreamState = {
    workspaces: [
      { name: 'ws-alpha', sessions: ['s1'], fileTree: ['README.md', 'src/'] },
      { name: 'ws-beta', sessions: [], fileTree: [] },
    ],
    sessions: [
      { id: 's1', title: 'prior session', created_by: 'web-gui', workspace: 'ws-alpha', state: 'idle', history: [{ role: 'user', content: 'hello', kind: 'message' }, { role: 'assistant', content: 'hi back', kind: 'message' }] },
    ],
    settings: { theme: 'dark', model: 'default' },
    credential: { value: 'sk-fixture-key-1234567890', masked: 'sk-fi********7890' },
    sessionExpired: false,
    storageWriteFails: false,
  }
  // Deep-copy caller-supplied entities: test-local mutations must never leak
  // through shared module-level fixture literals across tests.
  return structuredClone({ ...base, ...patch })
}

/** Request listener implementing the fixture upstream API (mutates `state`). */
export function upstreamHandler(state: UpstreamState, persist: () => Promise<void>): (req: IncomingMessage, res: ServerResponse) => boolean {
  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }
  const write = (res: ServerResponse) => {
    if (state.storageWriteFails) { json(res, 500, { error: 'E_STORAGE_WRITE_FAILED' }); return false }
    return true
  }
  const body = (req: IncomingMessage) => new Promise<Record<string, unknown>>(resolve => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { resolve(raw === '' ? {} : JSON.parse(raw) as Record<string, unknown>) })
  })
  return (req, res) => {
    const parts = (req.url ?? '/').split('?')
    const url = parts[0] ?? '/'
    if (req.method === 'GET' && url === '/api/state') { json(res, 200, state); return true }
    if (req.method === 'GET' && url === '/api/workspaces') { json(res, 200, state.workspaces); return true }
    if (req.method === 'GET' && url === '/api/sessions') {
      json(res, 200, { sessions: state.sessions.map(({ id, title, created_by }) => ({ id, title, created_by })) })
      return true
    }
    if (req.method === 'GET' && /^\/api\/sessions\/[^/]+$/.test(url)) {
      const id = url.split('/')[3]
      const session = state.sessions.find(s => s.id === id)
      if (session === undefined) { json(res, 404, { error: 'not found' }); return true }
      json(res, 200, session); return true
    }
    if (req.method === 'POST' && url === '/api/sessions') {
      void body(req).then(b => {
        const id = `s${state.sessions.length + 1}`
        state.sessions.push({ id, title: String(b.title ?? 'new session'), created_by: 'dsh-forge', workspace: String(b.workspace ?? state.workspaces[0]?.name ?? 'ws'), state: 'idle', history: [] })
        if (write(res)) { void persist(); json(res, 201, { id }) }
      })
      return true
    }
    if (req.method === 'POST' && /^\/api\/sessions\/[^/]+\/messages$/.test(url)) {
      const id = url.split('/')[3]
      void body(req).then(async b => {
        if (state.sessionExpired) { json(res, 401, { error: 'session-expired' }); return }
        const session = state.sessions.find(s => s.id === id)
        if (session === undefined) { json(res, 404, { error: 'not found' }); return }
        const text = String(b.content ?? '')
        session.history.push({ role: 'user', content: text, kind: 'message' })
        if (text.includes('approval')) session.state = 'waiting'
        else if (text.includes('question')) session.state = 'waiting'
        else if (text.includes('shell')) session.history.push({ role: 'tool', content: `shell exit=0`, kind: 'tool' })
        else { session.state = 'streaming'; session.history.push({ role: 'assistant', content: `echo: ${text}`, kind: 'message' }); session.state = 'idle' }
        if (write(res)) { await persist(); json(res, 200, session) }
      })
      return true
    }
    if (req.method === 'POST' && /^\/api\/sessions\/[^/]+\/decision$/.test(url)) {
      const id = url.split('/')[3]
      void body(req).then(async b => {
        const session = state.sessions.find(s => s.id === id)
        if (session === undefined) { json(res, 404, { error: 'not found' }); return true }
        const decision = String(b.decision ?? 'approve')
        session.history.push({ role: 'system', content: `approval:${decision}`, kind: 'approval' })
        session.state = 'idle'
        if (write(res)) { await persist(); json(res, 200, session) }
      })
      return true
    }
    if (req.method === 'POST' && url === '/api/reauth') { state.sessionExpired = false; json(res, 200, { ok: true }); return true }
    if (req.method === 'GET' && url === '/api/settings') { json(res, 200, state.settings); return true }
    if (req.method === 'PUT' && url === '/api/settings') {
      void body(req).then(async b => {
        if (String(b.model ?? '') === 'invalid!') { json(res, 400, { error: 'validation-error: invalid model' }); return }
        Object.assign(state.settings, b)
        if (write(res)) { await persist(); json(res, 200, state.settings) }
      })
      return true
    }
    if (req.method === 'GET' && url === '/api/credentials') {
      json(res, 200, state.credential === null ? { configured: false } : { configured: true, masked: state.credential.masked })
      return true
    }
    if (req.method === 'POST' && url === '/api/credentials') {
      void body(req).then(async b => {
        const key = String(b.apiKey ?? '')
        if (!key.startsWith('sk-') || key.length < 12) { json(res, 400, { error: 'invalid-api-key' }); return }
        state.credential = { value: key, masked: `${key.slice(0, 5)}${'*'.repeat(8)}${key.slice(-4)}` }
        if (write(res)) { await persist(); json(res, 200, state.credential) }
      })
      return true
    }
    return false
  }
}

/** Fixture upstream SPA: the web-GUI-shaped surfaces inside the carrier. */
export const upstreamSpaScript = `
(function () {
  function ready() { return globalThis.__DSH_TRANSPORT__ !== undefined && globalThis.__DSH_TRANSPORT__ !== null }
  function whenReady(fn) { if (ready()) fn(); else setTimeout(function () { whenReady(fn) }, 50) }
  whenReady(function () {
  var current = { session: null, surface: 'chat', workspace: 'ws-alpha' }
  function el(id) { return document.getElementById(id) }
  async function api(path, opts) {
    var r = await fetch(path, opts)
    if (r.status === 401) { el('session-expired').hidden = false; throw new Error('session-expired') }
    return r.json().then(function (body) { if (!r.ok) throw body; return body })
  }
  async function loadSessions() {
    var data = await api('api/sessions')
    el('session-list').innerHTML = ''
    data.sessions.forEach(function (s) {
      var li = document.createElement('li')
      li.className = 'session-item'; li.dataset.sessionId = s.id; li.textContent = s.title
      li.addEventListener('click', function () { void openSession(s.id) })
      el('session-list').appendChild(li)
    })
    el('empty-state').hidden = data.sessions.length !== 0
  }
  async function openSession(id) {
    current.session = await api('api/sessions/' + id)
    el('session-title').textContent = current.session.title
    renderHistory()
  }
  function renderHistory() {
    el('session-history').innerHTML = ''
    current.session.history.forEach(function (h) {
      var d = document.createElement('div'); d.className = 'entry entry-' + h.kind; d.textContent = h.role + ': ' + h.content
      el('session-history').appendChild(d)
    })
    el('approval-prompt').hidden = current.session.state !== 'waiting' || !current.session.history.some(function (h) { return h.kind === 'message' && h.content.indexOf('approval') !== -1 })
    el('user-question').hidden = current.session.state !== 'waiting' || el('approval-prompt').hidden === false
  }
  el('send-btn').addEventListener('click', async function () {
    if (current.session === null) return
    var text = el('composer').value
    try { current.session = await api('api/sessions/' + current.session.id + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text }) }); renderHistory() }
    catch (e) { if (e && e.error === 'session-expired') return; throw e }
  })
  el('approve-btn').addEventListener('click', function () { decide('approve') })
  el('reject-btn').addEventListener('click', function () { decide('reject') })
  async function decide(d) {
    current.session = await api('api/sessions/' + current.session.id + '/decision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: d }) })
    renderHistory()
  }
  el('answer-btn').addEventListener('click', async function () {
    current.session = await api('api/sessions/' + current.session.id + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'answer:' + el('answer-input').value }) })
    el('user-question').hidden = true; renderHistory()
  })
  el('dismiss-question-btn').addEventListener('click', function () { el('user-question').hidden = true; el('question-dismissed').hidden = false })
  el('reauth-btn').addEventListener('click', async function () { await api('api/reauth', { method: 'POST' }); el('session-expired').hidden = true })
  el('new-session-btn').addEventListener('click', async function () {
    try { var r = await api('api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace: current.workspace }) }); await openSession(r.id); await loadSessions() }
    catch (e) { el('storage-error').hidden = false }
  })
  document.querySelectorAll('[data-surface]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.surface').forEach(function (s) { s.hidden = s.id !== 'surface-' + b.dataset.surface })
    })
  })
  el('workspace-select').addEventListener('change', async function () {
    current.workspace = el('workspace-select').value
    var w = await (await fetch('api/workspaces')).json()
    var target = w.find(function (x) { return x.name === current.workspace })
    var all = await (await fetch('api/sessions')).json()
    var ids = target ? target.sessions : []
    el('file-tree').textContent = target ? target.fileTree.join(', ') : ''
    el('session-list').innerHTML = ''
    var visible = all.sessions.filter(function (s) { return ids.indexOf(s.id) !== -1 })
    visible.forEach(function (s) { var li = document.createElement('li'); li.textContent = s.title; el('session-list').appendChild(li) })
    el('empty-state').hidden = visible.length !== 0
  })
  el('save-key-btn').addEventListener('click', async function () {
    try { var c = await api('api/credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: el('api-key-input').value }) }); el('masked-key').textContent = c.masked; el('settings-msg').textContent = 'saved' }
    catch (e) { el('settings-msg').textContent = e && e.error ? e.error : 'error' }
  })
  el('save-settings-btn').addEventListener('click', async function () {
    try {
      await api('api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: el('model-input').value }) })
      el('settings-msg').textContent = 'saved'
      el('confirm-dialog').hidden = false // upstream confirmation flow for pending settings change
    }
    catch (e) { el('settings-msg').textContent = e && e.error ? e.error : 'error' }
  })
  el('confirm-dialog-btn').addEventListener('click', function () { el('confirm-dialog').hidden = true; el('settings-msg').textContent = 'confirmed' })
  void (async function initFileTree() {
    const w = await (await fetch('api/workspaces')).json()
    const currentWs = w.find(function (x) { return x.name === 'ws-alpha' }) || w[0]
    el('file-tree').textContent = currentWs ? currentWs.fileTree.join(', ') : ''
  })()
  el('load-credential-btn').addEventListener('click', async function () {
    var c = await (await fetch('api/credentials')).json()
    el('masked-key').textContent = c.configured ? c.masked : '(none)'
  })
  void loadSessions()
  })
})()
`

export const upstreamSpaBody = `
<div id="upstream-ui">
  <nav>
    <button data-surface="chat" id="nav-chat">chat</button>
    <button data-surface="plan" id="nav-plan">plan</button>
    <button data-surface="settings" id="nav-settings">settings</button>
    <select id="workspace-select"><option value="ws-alpha">ws-alpha</option><option value="ws-beta">ws-beta</option></select>
    <button id="new-session-btn">new session</button>
  </nav>
  <section id="surface-chat" class="surface">
    <ul id="session-list"></ul>
    <p id="empty-state" hidden>no sessions in this workspace</p>
    <h2 id="session-title">no session</h2>
    <div id="session-history"></div>
    <input id="composer" type="text" value=""/>
    <button id="send-btn">send</button>
    <div id="approval-prompt" hidden>
      <span>approve tool execution?</span>
      <button id="approve-btn">approve</button><button id="reject-btn">reject</button>
    </div>
    <div id="user-question" hidden>
      <span>assistant asks a question</span>
      <input id="answer-input" type="text"/>
      <button id="answer-btn">answer</button>
      <button id="dismiss-question-btn">dismiss</button>
    </div>
    <p id="question-dismissed" hidden>question dismissed without answer</p>
    <p id="session-expired" hidden>session expired — <button id="reauth-btn">re-establish</button></p>
    <p id="storage-error" hidden>storage write failed</p>
  </section>
  <section id="surface-plan" class="surface" hidden><div id="plan-view">plan: no active plan</div></section>
  <section id="surface-settings" class="surface" hidden>
    <input id="api-key-input" type="password"/>
    <button id="save-key-btn">save key</button>
    <span id="masked-key"></span>
    <p id="settings-msg"></p>
    <input id="model-input" type="text" value="default"/>
    <button id="save-settings-btn">save settings</button>
    <div id="confirm-dialog" hidden><span>confirm settings change?</span><button id="confirm-dialog-btn">confirm</button></div>
    <button id="load-credential-btn">reload credential</button>
  </section>
  <aside id="file-tree"></aside>
</div>
`

export async function launchUpstream(
  patch: Partial<UpstreamState> = {},
  options: FixtureAppOptions = {},
): Promise<UpstreamFixture> {
  const state = defaultState(patch)
  let stateFile = ''
  let persist = async () => {}
  const fixture = await launchFixtureApp({
    ...options,
    handleRequest: (req, res) => upstreamHandler(state, persist)(req, res),
    spaBody: upstreamSpaBody,
    spaScript: `<script>${upstreamSpaScript}</script>`,
  })
  stateFile = join(fixture.dir, 'upstream-home.json')
  persist = async () => { await writeFile(stateFile, JSON.stringify({ sessions: state.sessions, settings: state.settings, credential: state.credential }, null, 2)) }
  await persist()
  return {
    fixture,
    state,
    stateFile,
    close: fixture.close,
  }
}

/** Read back the persisted "upstream existing format" store. */
export async function readPersisted(path: string): Promise<{ sessions: UpstreamSession[]; settings: Record<string, unknown>; credential: unknown }> {
  return JSON.parse(await readFile(path, 'utf8')) as { sessions: UpstreamSession[]; settings: Record<string, unknown>; credential: unknown }
}

/** Assert the upstream store file is intact upstream-format JSON (helper). */
export async function expectPersistedIntact(path: string, sessions: number): Promise<void> {
  const persisted = await readPersisted(path)
  expect(persisted.sessions).toHaveLength(sessions)
  expect(typeof persisted.settings).toBe('object')
}
