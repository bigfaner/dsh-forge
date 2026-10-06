// 3.1 forge:docs/* 两通道注册 pin：read 透传 + openExternal 主侧执行两段守卫
//（Mitigations ②——越界 typed 拒 / 悬空拒 / openPath 失败 typed 拒；openPath 注入面）。
// read 的 canonical(forge_dir) 前缀守卫本体 = core docs.test.ts 锚（此处替身模拟其
// typed error 形状——通道面只验透传与信封保真）。
import { describe, expect, it, vi } from 'vitest'
import { DOCS_CHANNELS, type DocContent } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { openExternalDoc, registerDocsChannels, type DocsChannelService } from './docs-rpc.js'

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

const inRegisterDoc: DocContent = {
  title: '演示设计',
  content: '# 演示设计',
  canonicalPath: 'C:\\ws\\demo\\docs\\forge\\features\\demo-feature\\tech-design.md',
  dangling: false,
}

/** 替身 read：在册文档放行；越界 docRel 抛 typed ERR_DOC_PATH_INVALID（core 守卫同形） */
function fakeDocsService(): DocsChannelService & { read: ReturnType<typeof vi.fn> } {
  return {
    read: vi.fn(async (q: { projectId: string; docRel: string }): Promise<DocContent> => {
      if (q.docRel.startsWith('..') || q.docRel.includes('../') || /^[a-zA-Z]:[\\/]/.test(q.docRel)) {
        throw Object.assign(new Error(`文档路径越界（resolve 后不在 canonical(forge_dir) 之下）：${q.docRel}`), {
          code: 'ERR_DOC_PATH_INVALID',
          data: { projectId: q.projectId, docRel: q.docRel },
        })
      }
      if (q.docRel === 'features/demo-feature/missing.md') {
        return { content: '', canonicalPath: q.docRel, dangling: true }
      }
      return { ...inRegisterDoc, canonicalPath: `C:\\ws\\demo\\docs\\forge\\${q.docRel.replaceAll('/', '\\')}` }
    }),
  }
}

function fakeOpenPath() {
  return vi.fn(async (_target: string): Promise<string> => '')
}

describe('3.1 forge:docs/* 注册面', () => {
  it('注册面 = contracts DOCS_CHANNELS 全集两通道', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    registerDocsChannels(createForgeIpc(ipcMain), { docs: fakeDocsService(), openPath: fakeOpenPath() })
    expect([...handlers.keys()].sort()).toEqual(Object.values(DOCS_CHANNELS).slice().sort())
  })

  it('read：ReadDocRequest 透传 → DocContent typed 返回', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const docs = fakeDocsService()
    registerDocsChannels(createForgeIpc(ipcMain), { docs, openPath: fakeOpenPath() })
    const req = { projectId: 'p-1', docRel: 'features/demo-feature/tech-design.md' }
    await expect(handlers.get(DOCS_CHANNELS.read)!(undefined, req)).resolves.toEqual({ ok: true, data: expect.objectContaining({ dangling: false }) })
    expect(docs.read).toHaveBeenCalledWith(req)
  })
})

describe('3.1 openExternal 主侧执行（Mitigations ②——先经桥校验后开）', () => {
  it('在册在场文档：read 守卫通过 → openPath 收 canonical 绝对路径（非 docRel 原值）', async () => {
    const docs = fakeDocsService()
    const openPath = fakeOpenPath()
    await openExternalDoc({ docs, openPath }, { projectId: 'p-1', docRel: 'features/demo-feature/tech-design.md' })
    expect(docs.read).toHaveBeenCalledWith({ projectId: 'p-1', docRel: 'features/demo-feature/tech-design.md' })
    expect(openPath).toHaveBeenCalledWith(inRegisterDoc.canonicalPath)
  })

  it('路径越界（`..` 逃逸/绝对路径）：read typed ERR_DOC_PATH_INVALID 原样入信封；openPath 零调用', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const docs = fakeDocsService()
    const openPath = fakeOpenPath()
    registerDocsChannels(createForgeIpc(ipcMain), { docs, openPath })
    for (const docRel of ['../../secrets.txt', 'C:/Windows/win.ini']) {
      await expect(handlers.get(DOCS_CHANNELS.openExternal)!(undefined, { projectId: 'p-1', docRel })).resolves.toEqual({
        ok: false,
        error: { code: 'ERR_DOC_PATH_INVALID', message: expect.any(String), data: { projectId: 'p-1', docRel } },
      })
    }
    expect(openPath).not.toHaveBeenCalled()
  })

  it('悬空文档（文件不在场 = 无 canonical 解析）：typed 拒绝——库内 rel_path 原值绝不交 openPath', async () => {
    const docs = fakeDocsService()
    const openPath = fakeOpenPath()
    await expect(
      openExternalDoc({ docs, openPath }, { projectId: 'p-1', docRel: 'features/demo-feature/missing.md' }),
    ).rejects.toMatchObject({ code: 'ERR_DOC_PATH_INVALID', message: expect.stringContaining('悬空') })
    expect(openPath).not.toHaveBeenCalled()
  })

  it('openPath 失败（无关联应用等）：typed ERR_DOC_PATH_INVALID（触发即忘——失败经 RpcErr 信封）', async () => {
    const docs = fakeDocsService()
    const openPath = vi.fn(async (_target: string): Promise<string> => 'Failed to open path')
    const { ipcMain, handlers } = fakeIpcMain()
    registerDocsChannels(createForgeIpc(ipcMain), { docs, openPath })
    await expect(handlers.get(DOCS_CHANNELS.openExternal)!(undefined, { projectId: 'p-1', docRel: 'features/demo-feature/tech-design.md' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'ERR_DOC_PATH_INVALID',
        message: expect.stringContaining('shell.openPath'),
        data: expect.objectContaining({ openError: 'Failed to open path' }),
      },
    })
  })
})
