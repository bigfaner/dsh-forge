// M3 S5/S6 spike 本地 playwright 配置（testDir = 本目录，不进仓 e2e 池——沿 S8 纪律）。
// 3.9 复跑 spec（m3-rerun.spec.ts）以 M3R_FORM 选形（证据根 m3-3-9/）；一版 spec
//（m3.spec.ts）仍用 M3_FORM（证据根 m3-s5-s6/ 不变）——report 落各自证据根。
import { defineConfig } from '@playwright/test'

const rerunForm = process.env.M3R_FORM
const legacyForm = process.env.M3_FORM ?? 'dev'
const form = rerunForm ?? legacyForm
const evidenceRoot = rerunForm !== undefined ? 'm3-3-9' : 'm3-s5-s6'

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
        outputFile: `Z:\\project\\dsh\\tmp-redesign\\${evidenceRoot}\\${form}\\report-${form}.json`,
      },
    ],
  ],
  use: { trace: 'off' },
})
