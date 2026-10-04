// e2e dogfood 播种面（fix-37 ④ 收编——凭据播种/叠层三份拷贝单源）。
// dogfood 策略（tech-design Testing Strategy + Open Question ② 裁决）：低成本真实模型
// （缺省 zai-coding-cn / glm-5.3-flash，env DSH_FORGE_DOGFOOD_PROVIDER/DSH_FORGE_DOGFOOD_MODEL
// 可覆写）；模型凭据经 dsh profile 域——隔离 DSH_HOME 内播种 .credentials.yaml（拷贝真实
// 凭据），产品不经手（Security 约定）。凭据缺席 = dogfood 前置缺口 → 留痕 skip（不伪造）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/** dogfood 模型面（缺省低成本；env 覆写供记录与调参） */
export const DOGFOOD_PROVIDER = process.env.DSH_FORGE_DOGFOOD_PROVIDER ?? 'zai-coding-cn'
export const DOGFOOD_MODEL = process.env.DSH_FORGE_DOGFOOD_MODEL ?? 'glm-5.3-flash'

/** 真实凭据文件在场？（dogfood 前置门——缺席 = 留痕 skip，不伪造） */
export function realCredentials(): string | undefined {
  const candidate = join(homedir(), '.dsh', '.credentials.yaml')
  return existsSync(candidate) ? readFileSync(candidate, 'utf8') : undefined
}

/** 播种隔离 dsh-home：.credentials.yaml（真实拷贝）——dsh profile 域凭据，产品不经手 */
export function seedDshHome(dshHome: string, credentials: string): void {
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshHome, '.credentials.yaml'), credentials, 'utf8')
}

/**
 * dogfood 叠层落地（DSH_FORGE_PATCH_FILES → boot run.ts 外部 patchFiles）：
 * 0.2.0-rc.2 设置面 = profile 插件行 config（$DSH_HOME/settings.yaml 为 legacy 文档）——
 * 模型按官方机制走行 config；首启告示预确认已由产品 boot overlay 内置承载（fix-12），
 * 叠层只管模型面。临时 profile 目录不可行（runtime resolution 以 realpath 侦测活动
 * profile 层——4.2 实证），故经 boot 外部叠层注入、仓内 profile 不动。
 * 返回路径供 launchHost({ overlay }) 消费 + finally 清理。
 */
export function writeDogfoodOverlay(): string {
  const target = join(tmpdir(), `dsh-forge-e2e-dogfood-${process.pid}.yml`)
  writeFileSync(
    target,
    [
      '# e2e dogfood 叠层：低成本模型（首启告示预确认 = 产品 boot overlay 内置，fix-12）',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      `      ${DOGFOOD_PROVIDER}:`,
      '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
      '- id: agent-default-model',
      '  config:',
      `    provider: ${DOGFOOD_PROVIDER}`,
      `    model: ${DOGFOOD_MODEL}`,
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}

/**
 * provider 叠层（llm-pi-ai 面——API-key onboarding 弹窗预免；复启链路防毒化形态）：
 * provider 可服务（ZAI_CODING_CN_API_KEY 环境在场）则弹窗不挂载。CI 无该 env 时复启
 * 链路测试将受弹窗毒化影响——转正条件见 SMOKE-LEDGER 口径。
 */
export function writeProviderOverlay(): string {
  const target = join(
    tmpdir(),
    `dsh-forge-e2e-provider-${process.pid}-${Math.random().toString(36).slice(2, 8)}.yml`,
  )
  writeFileSync(
    target,
    [
      // 首启「预览版说明」预免 = 产品 boot overlay 内置（fix-12）；此处仅 provider 面（弹窗预免）
      '# e2e provider 叠层：API-key onboarding 弹窗预免（复启链路防毒化）',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      zai-coding-cn:',
      '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}
