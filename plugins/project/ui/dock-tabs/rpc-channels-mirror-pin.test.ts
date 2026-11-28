// dock-tabs 传输镜像同步 pin（knowledge-plugin-migration 1.4——传输单源归位承重后置门）：
// transport/ui-state 面（preloadTransport / ForgeTransport / RpcUiStateKind /
// RPC_UI_STATE_BY_CODE / rpcUiState）自 knowledge rpc-channels 逐字镜像后，hash 对账防
// 静默分叉；knowledge 切片通道键与 contracts KNOWLEDGE_CHANNELS 本尊双侧同钉（CT-KN-CH）。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '@dsh-forge/lib-api/channels'
import { createForgeRpcClient } from './rpc-channels.js'

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1/')

function read(rel: string): string {
  return readFileSync(ROOT + rel, 'utf8')
}

function codeOf(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')
      && !line.startsWith('*/') && !/^import\b/.test(line))
    .join('\n')
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function exportBlockOf(text: string, name: string): string {
  const lines = text.split(/\r?\n/)
  const decl = /^(export )?(async )?(function|const|interface|type|class) /
  const start = lines.findIndex((line) => decl.test(line.trim())
    && new RegExp(`^(export )?(async )?(function|const|interface|type|class) ${name}\\b`).test(line.trim()))
  if (start === -1) throw new Error(`export ${name} 未命中（对账面改名未同步 pin 清单）`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i]!.trim()
    if (/^(export )?(async )?(function|const|interface|type|class) [A-Za-z_$]/.test(t) || /^import\b/.test(t)) {
      end = i
      break
    }
  }
  return codeOf(lines.slice(start, end).join('\n'))
}

describe('dock-tabs 传输镜像 pin（↔ knowledge rpc-channels 正本）', () => {
  const dockTabs = read('plugins/project/ui/dock-tabs/rpc-channels.ts')
  const knowledge = read('plugins/knowledge/ui/rpc-channels.ts')
  const symbols = ['ForgeTransport', 'preloadTransport', 'RpcUiStateKind', 'RPC_UI_STATE_BY_CODE', 'rpcUiState'] as const

  it.each(symbols)('export %s 代码体逐字（漂移未同步即红）', (name) => {
    expect(sha(exportBlockOf(dockTabs, name))).toBe(sha(exportBlockOf(knowledge, name)))
  })
})

describe('CT-KN-CH 通道键双侧同钉（dock-tabs 侧切片 = contracts 本尊）', () => {
  const noopTransport = async (): Promise<unknown> => ({ ok: true, data: null })
  const client = createForgeRpcClient(noopTransport)

  it('dock-tabs knowledge 切片键集合逐字 = KNOWLEDGE_CHANNELS 键', () => {
    expect(Object.keys(client.knowledge).sort()).toEqual(Object.keys(KNOWLEDGE_CHANNELS).sort())
  })
})
