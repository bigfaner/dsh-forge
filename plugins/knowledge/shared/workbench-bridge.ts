// knowledge 插件 shared 下沉件（knowledge-plugin-migration 1.4 子提交 a——处置矩阵
// 「下沉 knowledge shared」行）：workbench 桥窄面类型（自 project ui/knowledge-face.ts
// WorkbenchBridgeMirror 逐字下沉——纯类型零 runtime）。桥本体 = 壳 C 类域
// （apps/web workbench/workbench-bridge.ts——createWorkbenchBridge 正本），本件仅声明
// 结构同型消费切片；project 侧 dock-tabs-face.ts 持同型镜像（pin 对账——faces 镜像 pin
// 于 knowledge/ui/mirrors-pin.test.ts）。运行期桥读取（workbenchBridgeOf——页内缝
// __DSH_FORGE_WORKBENCH__ 现查）随注册面落 knowledge ui/faces.ts，不入 shared。

/** workbench 桥窄面（壳 createWorkbenchBridge 产物结构同型镜像——消费切片） */
export interface WorkbenchBridgeMirror {
  subscribe(listener: () => void): () => void
  getSnapshot(): Record<string, unknown>
  setDrawerEntry(entryId: number | null): void
  setOverviewContext(context: { projectId: string | null }): void
  openTaskFocus(payload: { taskId: string; featureSlug: string }): void
  openTaskDrawer(taskId: string): void
  closeTaskDrawer(): void
  openTaskTransition(payload: { taskId: string; featureSlug: string; nonce: number; toStatus?: string }): void
}
