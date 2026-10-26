// @proposal:super-composer @web-e2e
// blitz e2e 锚——dsh-forge 壳缺省装载 @dsh-forge/quote-reference 与 @dsh-forge/super-composer
// （super-composer/1.9 集成四步的真机取证欠账卡 super-composer/1.11；input-history-plugin
// 判例 ① 同构：真实宿主 + 真实 dist，读 __DSH_BOOT__ 花名册）。
//
// 断言链（对照 proposal.md 集成四步）：
//   ① deps + 掌舵行：__DSH_BOOT__ 组合图含 @dsh-forge/quote-reference 与
//     @dsh-forge/super-composer 两产品行（main.ts 掌舵行 ↔ package.json dsh.client 清单
//     双真相源构建期断言已在 vite build 前置承担，此处断言真机装载事实面）；
//   ② 发射面：两行 url 均为各自 *-client.js classic script（vite 构建期发射产物，
//     自注册 CJS 装载契约）；
//   ③ 激活干净面：全程 console 零 'did not activate' / 零两包接线失败告警 +
//     renderer pageErrors 空（装载即激活、fail-soft 不外溢）。console 承载走 launch
//     层 collectConsole（评审 C6：自 firstWindow 起收集——消 boot 早期告警盲窗；
//     末 60 条环形缓冲对 fail-loud 告警面足够——告警会密集出现不被逐出）。
//
// Hard Rules：零产品源码改动（断言失败 → 三分流归因上报）；夹具 = 仓外 tmp；实跑前无
// 活跃 dsh-forge Electron 实例；零真实模型凭据（launch 层零播种纪律）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { rmDirBestEffort } from '../../support/cleanup.js'

/** 集成四步登记的两包产品行（id ↔ 发射 bundle 文件名） */
const PLUGIN_ROWS = [
  { id: '@dsh-forge/quote-reference', bundle: 'quote-reference-client.js' },
  { id: '@dsh-forge/super-composer', bundle: 'super-composer-client.js' },
] as const

test('@web-e2e @blitz super-composer 壳缺省装载：__DSH_BOOT__ 花名册两包产品行 + 发射 bundle url + 激活干净面', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-sc-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', collectConsole: true })
  const { app, page, pageErrors, consoleTail } = launched
  try {
    // ── ① 装载在场：__DSH_BOOT__ 组合图含两包产品行（main.ts 掌舵行）──
    const bootEntries = await page.evaluate(() => {
      const g = globalThis as { __DSH_BOOT__?: { entries?: readonly { id?: string; url?: string }[] } }
      return (g.__DSH_BOOT__?.entries ?? []).map((e) => ({ id: e.id ?? '', url: e.url ?? '' }))
    })
    for (const row of PLUGIN_ROWS) {
      const found = bootEntries.find((e) => e.id === row.id)
      expect(found, `__DSH_BOOT__ 组合图含 ${row.id} 产品行（缺省装载）`).toBeDefined()
      // ── ② 发射面：url = vite 构建期发射的 classic script（自注册 CJS 装载契约）──
      expect(
        found?.url,
        `${row.id} 产品行 url = ${row.bundle}（发射产物装载契约）`,
      ).toContain(row.bundle)
    }
    // input-history 既有产品行回归在场（掌舵幂等缝不被新增行破坏）
    expect(
      bootEntries.some((e) => e.id === '@dsh-forge/input-history'),
      '既有 input-history 产品行回归在场',
    ).toBe(true)

    // ── ③ 激活干净面：零 pageerror + 零激活/接线告警（装载激活干净面）──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    const noisy = consoleTail.filter((line) =>
      /did not activate|quote-reference.*failed|super-composer.*failed|Invalid effect|invalid plugin/i.test(line),
    )
    expect(noisy, `零激活/接线告警：${noisy.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
  }
})
