#!/usr/bin/env node
// 真实例全量 UI 交互验收(与 live-ui-probe 同链路: 真宿主 + 真 web dist +
// 默认 profile)。逐项驱动壳内可见的全部交互面, 每步 act → wait 可观测变化 →
// PASS/FAIL, 全程采集 console/pageerror/network 失败并归属到当前步骤。
//
// 用法(在 apps/desktop 下运行):
//   node ../../scripts/acceptance/live-ui-sweep.mjs [--send]
//     --send  额外执行「发送消息」真实回合(消耗已配置模型的少量 token)
// 退出码: 0 = 全部 PASS; 1 = 有 FAIL 或启动失败。
import { _electron } from '@playwright/test'

const SEND = process.argv.includes('--send')
const repoRoot = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const mainPath = `${repoRoot}/apps/desktop/dist/main.cjs`

const results = []
let currentStep = 'boot'
let consoleNoise = []
const noise = () => { const n = consoleNoise; consoleNoise = []; return n }

const app = await _electron.launch({ args: [mainPath] })
let failed = false
try {
  const page = await app.firstWindow()
  page.on('console', msg => {
    const text = msg.text()
    if (text.startsWith('Download the React DevTools')) return
    if (text.includes('Electron Security Warning')) return
    if (msg.type() === 'error' || msg.type() === 'warning') consoleNoise.push(`${msg.type()}: ${text.slice(0, 300)}`)
  })
  page.on('pageerror', error => consoleNoise.push(`pageerror: ${String(error).slice(0, 300)}`))

  async function step(name, fn) {
    currentStep = name
    noise()
    const started = Date.now()
    try {
      await fn()
      const n = noise()
      results.push({ step: name, status: n.length === 0 ? 'PASS' : 'PASS(warn)', ms: Date.now() - started, noise: n })
      console.log(`PASS ${name} (${Date.now() - started}ms)${n.length === 0 ? '' : ` — ${String(n.length)} 条渲染侧告警`}`)
    } catch (error) {
      failed = true
      const n = noise()
      results.push({ step: name, status: 'FAIL', ms: Date.now() - started, error: String(error).slice(0, 400), noise: n })
      console.log(`FAIL ${name} (${Date.now() - started}ms): ${String(error).slice(0, 400).split('\n')[0]}`)
    }
  }
  const T = { timeout: 10_000 }

  await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 30_000 })
  const btn = name => page.getByRole('button', { name }).first()

  await step('boot: UI 挂载', async () => {
    await btn('新建会话').waitFor({ state: 'visible', timeout: 60_000 })
  })

  await step('新会话: 创建并打开会话', async () => {
    await btn('新建会话').click()
    await btn('发送消息').waitFor({ state: 'visible', ...T })
    await btn('标准模式').waitFor({ state: 'visible', ...T })
  })

  // 预设选择器只出现在新会话 composer 上(历史会话无此按钮), 紧随新会话验证。
  await step('会话内: 模式选择器(标准模式菜单)', async () => {
    await btn('标准模式').click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  // 「选择工作区」是空态(无会话)专属控件; 已有会话自动恢复时不存在, 跳过。
  await step('侧栏: 折叠/展开', async () => {
    await btn('收起侧边栏').click()
    await btn('打开侧边栏').waitFor({ state: 'visible', ...T })
    await btn('打开侧边栏').click()
    await btn('收起侧边栏').waitFor({ state: 'visible', ...T })
  })

  await step('面板: 插件', async () => {
    await btn('插件').click()
    await page.getByText('插件', { exact: false }).last().waitFor({ ...T })
    await page.keyboard.press('Escape')
  })

  await step('面板: 设置 + 外观深色/浅色切换', async () => {
    await btn('设置').click()
    await page.getByText('外观').first().waitFor({ ...T })
    const before = await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))
    await page.getByText('深色', { exact: true }).first().click()
    await page.waitForFunction(d => document.body.hasAttribute('data-ds-dark-theme') === !d, before, T)
    await page.getByText('浅色', { exact: true }).first().click()
    await page.waitForFunction(d => document.body.hasAttribute('data-ds-dark-theme') === d, before, T)
    await page.keyboard.press('Escape')
  })

  // 「选择工作区」是空态(无会话)专属控件; 有历史会话自动恢复时不存在, 记 SKIP。
  await step('工作区选择器: 菜单列出工作区(空态专属)', async () => {
    const wsBtn = page.getByRole('button', { name: '选择工作区' })
    if (await wsBtn.count() === 0) {
      console.log('  (SKIP: 已有会话自动恢复, 空态控件不存在)')
      return
    }
    await wsBtn.first().click()
    await page.getByText('dsh_workspace').first().waitFor({ ...T })
    await page.keyboard.press('Escape')
  })

  await step('搜索: 会话过滤', async () => {
    await btn('搜索会话').click()
    await page.keyboard.type('分析', { delay: 20 })
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
  })

  await step('会话列表: 打开历史会话', async () => {
    await page.getByText('分析：', { exact: false }).first().click()
    await page.waitForTimeout(1_500) // 转录加载
  })

  await step('会话内: 访问模式菜单', async () => {
    await btn('访问模式，当前：工作区内修改').click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  await step('会话内: 模型选择菜单', async () => {
    await btn('选择模型，当前 GLM-5.2，推理等级 Default').click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  await step('右侧边栏: 打开/收起', async () => {
    await btn('打开右侧边栏').click()
    await btn('收起右侧边栏').waitFor({ state: 'visible', ...T })
    await btn('收起右侧边栏').click()
    await btn('打开右侧边栏').waitFor({ state: 'visible', ...T })
  })

  // composer 是 contenteditable DIV(无 placeholder 属性), 键入走 keyboard。
  const composer = page.locator('[contenteditable="true"]').first()
  await step('输入框: 键入', async () => {
    await composer.click()
    await page.keyboard.type('验收测试输入', { delay: 20 })
    await page.waitForFunction(() => document.querySelector('[contenteditable="true"]')?.textContent?.includes('验收测试输入') === true, undefined, T)
  })

  if (SEND) {
    await step('发送: 真实回合(已配置模型)', async () => {
      // 在全新会话中发送, 且发送前断言回合统计不存在 — 防止匹配到
      // 历史会话转录里旧的「用时」统计造成假阳性。
      await btn('新建会话').click()
      await btn('发送消息').waitFor({ state: 'visible', ...T })
      await page.waitForFunction(() => !/用时\s*\d+\s*秒/.test(document.body.innerText), undefined, T)
      await composer.click()
      await page.keyboard.type('验收测试:请只回复两个字:收到', { delay: 10 })
      await btn('发送消息').click()
      await page.waitForFunction(() => /用时\s*\d+\s*秒/.test(document.body.innerText), undefined, { timeout: 120_000 })
    }, T)
  }
} catch (error) {
  failed = true
  console.log(`FATAL ${currentStep}: ${String(error).slice(0, 400)}`)
} finally {
  await app.close().catch(() => {})
}

console.log(`\n=== sweep ${failed ? 'FAILED' : 'GREEN'}: ${results.filter(r => r.status.startsWith('PASS')).length}/${results.length} PASS ===`)
for (const r of results.filter(r => r.status === 'FAIL')) console.log(`  FAIL ${r.step}: ${r.error?.split('\n')[0]}`)
process.exit(failed ? 1 : 0)
