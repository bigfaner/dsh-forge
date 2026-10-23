import { describe, expect, it } from 'vitest'
import { loadProxyFileText, type RemoteRpc, type RpcResult } from '../core/rpc.ts'
import {
  docKindOf,
  hasRenderToggle,
  parseCsvLine,
  parseCsvTable,
} from './reader.ts'

describe('五类识别（F8）', () => {
  it('扩展名定类；http(s) = 链接优先；未知扩展 = txt 兜底', () => {
    expect(docKindOf('Z:/ws/a.md')).toBe('md')
    expect(docKindOf('b.csv')).toBe('csv')
    expect(docKindOf('c.html')).toBe('html')
    expect(docKindOf('c.htm')).toBe('html')
    expect(docKindOf('d.txt')).toBe('txt')
    expect(docKindOf('e.log')).toBe('txt')
    expect(docKindOf('https://docs.example.com/x')).toBe('link')
  })

  it('渲染/文本胶囊：md/csv/html 有，txt/link 无', () => {
    expect(hasRenderToggle('md')).toBe(true)
    expect(hasRenderToggle('csv')).toBe(true)
    expect(hasRenderToggle('html')).toBe(true)
    expect(hasRenderToggle('txt')).toBe(false)
    expect(hasRenderToggle('link')).toBe(false)
  })
})

describe('CSV → 居中表格', () => {
  it('单行切分：引号包裹单元含逗号 / 转义引号', () => {
    expect(parseCsvLine('a,b')).toEqual(['a', 'b'])
    expect(parseCsvLine('"x,1","he said ""hi""",c')).toEqual(['x,1', 'he said "hi"', 'c'])
  })

  it('整表切分：CRLF 归一 + 尾空行剪除', () => {
    expect(parseCsvTable('h1,h2\r\n1,2\r\n')).toEqual([['h1', 'h2'], ['1', '2']])
  })
})

// rich md 渲染为 DOM 胶水（仓内零 jsdom 惯例）——fence/mermaid 门控与表格居中的
// 对齐证据走 Playwright 走查（e2e/mobile/loop-reader.spec.ts）。

describe('forge:proxy/file 全文件读（manifest + 逐块）', () => {
  it('单块：manifest size + eof 收口', async () => {
    const rpc: RemoteRpc = {
      async call<T>(channel: string, payload: unknown): Promise<RpcResult<T>> {
        expect(channel).toBe('forge:proxy/file')
        const record = payload as { manifest?: boolean }
        if (record.manifest === true) return { ok: true, data: { manifest: true, size: 5 } as T }
        return { ok: true, data: { eof: true, data: btoa('hello') } as T }
      },
    }
    expect(await loadProxyFileText(rpc, 'Z:/a.txt')).toEqual({ text: 'hello', size: 5 })
  })

  it('多块拼接 + UTF-8 解码', async () => {
    const text = '中文内容一二三四五六七八九十'
    const bytes = new TextEncoder().encode(text)
    // 10 字节/块强行切块（多字节字符跨块）
    const slices: string[] = []
    for (let offset = 0; offset < bytes.length; offset += 10) {
      slices.push(String.fromCharCode(...bytes.subarray(offset, offset + 10)))
    }
    let offsetCursor = 0
    const rpc: RemoteRpc = {
      async call<T>(_channel: string, payload: unknown): Promise<RpcResult<T>> {
        const record = payload as { manifest?: boolean; offset?: number }
        if (record.manifest === true) return { ok: true, data: { manifest: true, size: bytes.length } as T }
        const index = Math.floor((record.offset ?? 0) / 10)
        const slice = slices[index] ?? ''
        offsetCursor = (record.offset ?? 0) + slice.length
        return { ok: true, data: { eof: index >= slices.length - 1, data: btoa(slice) } as T }
      },
    }
    expect(await loadProxyFileText(rpc, 'Z:/b.md')).toEqual({ text, size: bytes.length })
    expect(offsetCursor).toBe(bytes.length)
  })

  it('size 超限守卫拒绝；RPC error 信封原样抛错', async () => {
    const big: RemoteRpc = {
      async call<T = unknown>(): Promise<RpcResult<T>> {
        return { ok: true, data: { manifest: true, size: 3_000_000 } as unknown as T }
      },
    }
    await expect(loadProxyFileText(big, 'Z:/c.bin')).rejects.toThrow('超出阅读上限')
    const failing: RemoteRpc = {
      async call<T = unknown>(): Promise<RpcResult<T>> {
        return { ok: false, error: { code: 'not-found', reason: '文件不在场' } }
      },
    }
    await expect(loadProxyFileText(failing, 'Z:/d.md')).rejects.toThrow('文件不在场')
  })
})
