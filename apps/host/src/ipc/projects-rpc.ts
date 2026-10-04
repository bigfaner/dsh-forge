// forge:projects/* 五通道注册（2.4 注册行；定位：基础——通道面装配，域语义归 core 服务）。
// 通道名仅出自 @dsh-forge/contracts PROJECTS_CHANNELS（三处一体：contracts → web/rpc →
// core forge 域服务面 Interface 1↔4 一一对应）；服务经参数注入（contracts ProjectService
// 结构类型——host 禁 import core 源码，tests/structure/host-main pin；真实装配于 main
// boot 后接 ctx.forgeProjects，查询面 2.3 并齐后全五通道实跑）。
import {
  PROJECTS_CHANNELS,
  type GetProjectRequest,
  type ProjectService,
  type RegisterProjectInput,
  type UpdateProjectRequest,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 五通道全集注册（负载映射 = dto/rpc.ts ProjectsChannelRequests/Responses，键键对应） */
export function registerProjectsChannels(ipc: ForgeIpc, service: ProjectService): void {
  ipc.register(
    PROJECTS_CHANNELS.register,
    rpcEnvelope((input: RegisterProjectInput) => service.registerProject(input)),
  )
  ipc.register(PROJECTS_CHANNELS.list, rpcEnvelope(() => service.listProjects()))
  ipc.register(
    PROJECTS_CHANNELS.get,
    rpcEnvelope((req: GetProjectRequest) => service.getProject(req.id)),
  )
  ipc.register(
    PROJECTS_CHANNELS.update,
    rpcEnvelope((req: UpdateProjectRequest) => service.updateProject(req.id, req.patch)),
  )
  ipc.register(PROJECTS_CHANNELS.reconcile, rpcEnvelope(() => service.reconcileAtStartup()))
}

/**
 * fix-27 启动对账接线（tech-design §交互三「每次启动」落地）：boot 面 forgeProjects 服务
 * 就绪后调一次 reconcileAtStartup——悬空引用启动即修（失配找回/幂等重建，既有实现）。
 * fire-and-forget：报告入日志（repaired/orphans 摘要）；异常吞掉不阻断启动（服务内部已
 * 三层降级，此处仅桥面兜底）。e2e 隔离态同径（main 唯一入口，无形态分支）。
 */
export function runStartupReconcile(service: ProjectService): void {
  void service.reconcileAtStartup().then(
    (report) =>
      console.log(
        `[host] 启动对账完成：repaired=${String(report.repaired.length)} orphans=${String(report.orphans.length)}`,
      ),
    (error) =>
      console.warn(
        `[host] 启动对账调用失败（已降级，不阻断启动）：${error instanceof Error ? error.message : String(error)}`,
      ),
  )
}
