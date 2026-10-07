// M3 S5/S6 spike 本地 playwright 配置（testDir = 本目录，不进仓 e2e 池——沿 S8 纪律）。
import { defineConfig } from '@playwright/test'

const form = process.env.M3_FORM ?? 'dev'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: `Z:\\project\\dsh\\tmp-redesign\\m3-s5-s6\\${form}\\report-${form}.json`,
      },
    ],
  ],
  use: { trace: 'off' },
})
