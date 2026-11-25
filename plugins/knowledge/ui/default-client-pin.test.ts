// knowledge 缺省工厂守护钉（2.21 同病收口——project 18 处同款清理先例 ab2c2614）：
// 非 rpc-channels 单源的非测试源码缺省工厂必须 = 页内缺省缝 currentDefaultRpcClientFactory
// （apply 期装配分流安装——connection 在场走官方 connection.rpc 正缝，缺席回落 preload）。
// 任一消费点缺省退回 preloadRpcClientFactory 字面量即红（同读源码口径，零替身注入）。
// 注：knowledge 域数据通道无 Typert namespace（提案明示范围外另案）——本域官方宿主可达
// 工厂 = connection 面工厂，preload 真身只允许出现在 rpc-channels.ts 单源定义处与测试。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const UI_DIR = dirname(fileURLToPath(import.meta.url))
const read = (name: string): string => readFileSync(join(UI_DIR, name), 'utf8')

const CONSUMERS = [
  'EntryDrawer.tsx',
  'RecallTab.tsx',
  'knowledge-dir-section.tsx',
  'faces.ts',
  'use-knowledge-browse.ts',
] as const

describe('knowledge 缺省工厂守护钉（2.21 preload 同病收口）', () => {
  it('消费面 5 文件零 preloadRpcClientFactory 字面量（缺省 = 页内缺省缝工厂）', () => {
    for (const name of CONSUMERS) {
      expect(read(name), `${name} 退回 preload 缺省`).not.toMatch(/preloadRpcClientFactory/)
    }
  })

  it('消费面缺省工厂 = currentDefaultRpcClientFactory（逐文件钉）', () => {
    for (const name of CONSUMERS) {
      expect(read(name), `${name} 缺省工厂须为页内缺省缝`).toMatch(/currentDefaultRpcClientFactory/)
    }
  })

  it('单源边界：preloadRpcClientFactory 定义只允许在 rpc-channels.ts（传输单源）', () => {
    const source = read('rpc-channels.ts')
    expect(source).toMatch(/export function preloadRpcClientFactory/)
    expect(read('faces.ts')).toMatch(/installDefaultRpcClientFactory\(/)
  })

  it('页内缺省缝缺省基线 = preload 真身（装配前不炸——单源定义在场钉）', () => {
    expect(read('rpc-channels.ts')).toMatch(/let installedDefaultFactory: RpcClientFactory = preloadRpcClientFactory/)
  })
})
