// Host-entry smoke fixture.
//
// Mirrors the child-process contract of the vendored upstream desktop-host
// entry (vendored/apps/desktop-host/src/index.ts) without requiring the
// installed dependency closure:
//   argv[2] = runtimeDir   argv[3] = projectDir
//   child -> parent : JSON IPC messages via process.send
//   parent -> child : { type: 'shutdown' }
//   child -> parent : { type: 'shutdown-complete' } then disconnect
//
// Full upstream host boot under the builtin Node needs the pnpm-installed
// closure (build-time install step) and is out of scope for this smoke;
// the fixture validates the spawn + IPC + clean-shutdown wiring.

const runtimeDir = process.argv[2]
const projectDir = process.argv[3]

if (runtimeDir === undefined || projectDir === undefined) {
  console.error('host-entry fixture: runtimeDir and projectDir argv required')
  process.exit(2)
}

const send = (message) => new Promise((resolve, reject) => {
  if (!process.connected || process.send === undefined) { resolve(); return }
  process.send(message, (error) => { if (error === null) resolve(); else reject(error) })
})

let stopping = false

process.on('message', (message) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return
  if (message.type === 'shutdown') {
    stopping = true
    void (async () => {
      await send({ type: 'shutdown-complete', runtimeDir, nodeVersion: process.version })
      if (process.connected) process.disconnect()
    })()
  }
})

void send({ type: 'smoke-ready', runtimeDir, projectDir, pid: process.pid, nodeVersion: process.version })
