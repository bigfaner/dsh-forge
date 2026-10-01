import { defineConfig } from 'vite'

// 1.5 接线：dsh-client-web 壳内核 + boot manifest 消费 + 产品 client 插件 bundle。
// 本文件为 1.2 骨架占位——仅固定 dev/build 基本形状。
export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'es2022' },
})
