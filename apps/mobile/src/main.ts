import './style.css'

// mount(root)：路由注册 + 首屏装配。
// 1.3 起的批次任务在此装配 core/router 与 views；脚手架阶段仅挂载占位根。
export function mount(root: HTMLElement): void {
  root.textContent = 'dsh-forge mobile'
}
const app = document.querySelector<HTMLElement>('#app')
if (app)
  mount(app)
