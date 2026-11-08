// fix-2 双主题取证用暗色变体——仅加开 colorScheme: 'dark'（主题面 prefers-color-scheme
// 跟随——见 dsh-client-ui-theme client.js ui-theme service），其余复用 capture 配置。
// 用途：`npx playwright test specs/flywheel.spec.ts --project=desktop -c playwright.capture-dark.config.ts`
import { defineConfig } from '@playwright/test'
import captureConfig from './playwright.capture.config.ts'

export default defineConfig({
  ...captureConfig,
  outputDir: './test-results-capture-dark',
  use: {
    ...captureConfig.use,
    colorScheme: 'dark',
  },
})
