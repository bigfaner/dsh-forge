// Windows 标题栏几何单源（fix-40）——宿主两面共消费防漂移：
//   ① window/create.ts：titleBarOverlay.height（原生 WCO 覆盖条高度 = 原生窗口钮带区，
//      悬浮绘制在 web 内容之上、覆盖窗口右上约 32px 带区）；
//   ② ipc/preload-api.ts：markDesktopShellIdentity 内联 --dsh-windows-titlebar-height
//      （官方补偿刻度——ui-layout frame padding-top/顶部拖拽条、ui-sidebar 折叠/新会话钮
//      fixed 居中公式、dockkit 浮动窗顶钳制均按此值排布）。
// 两源漂移 = 官方补偿面与原生覆盖条错位（内容沉入钮带区或让出过多）——本常量是唯一刻度。
// 值注记：Windows 官方系统 caption 刻度（100% DPI）。
export const WINDOWS_TITLEBAR_HEIGHT = 32
