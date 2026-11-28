// knowledge 注册行维护 pin：registerProject 进表径（1.15）+ boot 回填径（bug 5e5592dc）。
// fail-soft 口径 + 双径覆盖幂等 + 非注册方法透传。
import type { ProjectService, ProjectSummary, RegisterResult } from '@dsh-forge/contracts'
import {
  backfillKnowledgeRegistryRows,
  withKnowledgeRegistryRow,
} from './bindings.js'
import { describe, expect, it, vi } from 'vitest'

const summary = (id: string, wsPath: string, archived = false): ProjectSummary => ({
  id,
  workspaceId: `ws-${id}`,
  name: id,
  wsPath,
  archived,
})

// ── 1.15 进表径：registerProject 成功后向 knowledge 注册表落注册行（fail-soft 包装面） ──

describe('withKnowledgeRegistryRow（1.15 注册链进表径）', () => {
  const result: RegisterResult = { projectId: 'p9', workspaceId: 'ws9', attachedToExisting: false }
  const project = {
    id: 'p-1', workspaceId: 'w', wsPath: 'C:\\ws\\new', name: 'new',
    forgeDir: 'C:\\ws\\new\\.forge', forgeDirExternal: false, archived: false,
    createdAt: '', updatedAt: '',
  }
  function registryService(): { service: ProjectService; registerProject: ReturnType<typeof vi.fn>; getProject: ReturnType<typeof vi.fn> } {
    const registerProject = vi.fn().mockResolvedValue(result)
    const getProject = vi.fn().mockResolvedValue({ ...project, id: result.projectId })
    const service = {
      registerProject,
      getProject,
      listProjects: vi.fn().mockResolvedValue([]),
      updateProject: vi.fn(),
      reconcileAtStartup: vi.fn().mockResolvedValue({ repaired: [], orphans: [] }),
    } satisfies ProjectService
    return { service, registerProject, getProject }
  }

  it('注册成功 → getProject 取 canonical wsPath → knowledge.registerProject({wsPath, projectId}) 落注册行（fix-2）', async () => {
    const { service, registerProject } = registryService()
    const knowledge = { registerProject: vi.fn().mockResolvedValue(undefined) }
    const wrapped = withKnowledgeRegistryRow(service, knowledge)
    await expect(wrapped.registerProject({ workspaceDir: 'C:\\ws\\new', name: 'new', forgeDir: 'C:\\ws\\new\\.forge' })).resolves.toBe(result)
    expect(registerProject).toHaveBeenCalledOnce()
    expect(knowledge.registerProject).toHaveBeenCalledWith({ wsPath: 'C:\\ws\\new', projectId: result.projectId })
  })

  it('knowledge 服务缺席 = 原样透传（插件未装载——注册不受影响）', async () => {
    const { service } = registryService()
    const wrapped = withKnowledgeRegistryRow(service, undefined)
    await expect(wrapped.registerProject({ workspaceDir: 'C:\\ws\\new', name: 'new', forgeDir: 'C:\\ws\\new\\.forge' })).resolves.toBe(result)
  })

  it('落表失败 = fail-soft：记日志不抛断注册（结果原样返回）', async () => {
    const { service } = registryService()
    const knowledge = { registerProject: vi.fn().mockRejectedValue(new Error('db locked')) }
    const log = vi.fn()
    const wrapped = withKnowledgeRegistryRow(service, knowledge, log)
    await expect(wrapped.registerProject({ workspaceDir: 'C:\\ws\\new', name: 'new', forgeDir: 'C:\\ws\\new\\.forge' })).resolves.toBe(result)
    expect(log).toHaveBeenCalledOnce()
  })

  it('非注册方法原样透传（getProject 不触发落表）', async () => {
    const { service, getProject } = registryService()
    const knowledge = { registerProject: vi.fn() }
    const wrapped = withKnowledgeRegistryRow(service, knowledge)
    await wrapped.getProject('p-1')
    expect(getProject).toHaveBeenCalledOnce()
    expect(knowledge.registerProject).not.toHaveBeenCalled()
  })

  it('双径覆盖幂等（fix-36 bug 97ddbeaa——子侧装配 + main IPC 包装同注册重复落行无害）', async () => {
    const { service, registerProject } = registryService()
    const knowledge = { registerProject: vi.fn().mockResolvedValue(undefined) }
    // main 预装 + 子侧装配嵌套两层包装（真实双径形态）——单次注册两次落表
    const wrapped = withKnowledgeRegistryRow(withKnowledgeRegistryRow(service, knowledge), knowledge)
    await expect(wrapped.registerProject({ workspaceDir: 'C:\\ws\\new', name: 'new', forgeDir: 'C:\\ws\\new\\.forge' })).resolves.toBe(result)
    expect(registerProject).toHaveBeenCalledOnce()
    expect(knowledge.registerProject).toHaveBeenCalledTimes(2)
    expect(knowledge.registerProject).toHaveBeenNthCalledWith(2, { wsPath: 'C:\\ws\\new', projectId: result.projectId })
  })
})

// ── boot 回填径：启动对既有项目补齐 knowledge 注册行（bug 5e5592dc——注册行唯一写径
//    = registerProject 时点，转正前注册/自持库丢行的存量项目知识通道永久 项目不存在） ──

describe('backfillKnowledgeRegistryRows（boot 回填）', () => {
  function listerService(rows: ProjectSummary[]): Pick<ProjectService, 'listProjects'> {
    return { listProjects: vi.fn().mockResolvedValue(rows) }
  }

  it('活跃项目逐个落注册行（{wsPath, projectId}——幂等 upsert 补齐缺失行）', async () => {
    const knowledge = { registerProject: vi.fn().mockResolvedValue(undefined) }
    await backfillKnowledgeRegistryRows(
      listerService([summary('p1', 'C:\\ws\\a'), summary('p2', 'C:\\ws\\b')]),
      knowledge,
    )
    expect(knowledge.registerProject).toHaveBeenCalledTimes(2)
    expect(knowledge.registerProject).toHaveBeenCalledWith({ wsPath: 'C:\\ws\\a', projectId: 'p1' })
    expect(knowledge.registerProject).toHaveBeenCalledWith({ wsPath: 'C:\\ws\\b', projectId: 'p2' })
  })

  it('归档项目不参与（归档面不回填）', async () => {
    const knowledge = { registerProject: vi.fn().mockResolvedValue(undefined) }
    await backfillKnowledgeRegistryRows(
      listerService([summary('p1', 'C:\\ws\\a'), summary('p-arch', 'C:\\ws\\old', true)]),
      knowledge,
    )
    expect(knowledge.registerProject).toHaveBeenCalledOnce()
    expect(knowledge.registerProject).toHaveBeenCalledWith({ wsPath: 'C:\\ws\\a', projectId: 'p1' })
  })

  it('knowledge 服务缺席 = 零调用零抛（插件未装载）', async () => {
    await expect(backfillKnowledgeRegistryRows(listerService([summary('p1', 'C:\\ws\\a')]), undefined)).resolves.toBeUndefined()
  })

  it('单项目落表失败 = fail-soft：记日志继续其余项目（不抛断启动）', async () => {
    const knowledge = { registerProject: vi.fn().mockRejectedValueOnce(new Error('db locked')).mockResolvedValue(undefined) }
    const log = vi.fn()
    await backfillKnowledgeRegistryRows(
      listerService([summary('p1', 'C:\\ws\\a'), summary('p2', 'C:\\ws\\b')]),
      knowledge,
      log,
    )
    expect(knowledge.registerProject).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledOnce()
  })
})
