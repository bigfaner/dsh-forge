// 2.4 AC4——rpc/ 零服务端实现依赖自证（lint:imports 的 RPC 边界 + web/host 互禁 + electron 禁入的模块面扫描）。
// 机械面与 G0 互补：lint-imports 扫全 apps/web；本测试把 rpc/ 目录面钉死（含 host 源码与 electron 直引两类
// lint-imports 未覆盖的禁令——renderer 无 Node/Electron 面，构建图只应含 contracts + 相对 rpc 模块）。
// 文件枚举经 import.meta.glob（vite/client 类型面——测试文件不出 Node 类型依赖）。
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['./*.ts', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 白名单：contracts 包与 rpc/ 同层相对模块（rpc/ 为平面目录——跨目录 '../' 与外部包一律拒） */
const isAllowed = (specifier: string): boolean =>
  specifier === '@dsh-forge/contracts' || /^\.\/[\w-]+\.js$/.test(specifier)

describe('AC4 rpc/ 构建图纪律（零服务端实现依赖）', () => {
  it('rpc/ 模块面就位（client/errors/events/transport/ui-state/index 六面）', () => {
    expect(Object.keys(sources).sort()).toEqual(['./client.ts', './errors.ts', './events.ts', './index.ts', './transport.ts', './ui-state.ts'])
  })

  it('import 仅限：@dsh-forge/contracts 与 rpc/ 内相对模块', () => {
    const offenders: string[] = []
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/from '([^']+)'/g)) {
        if (!isAllowed(m[1]!)) offenders.push(`${file} → ${m[1]}`)
      }
    }
    expect(offenders, `rpc/ 越界 import（服务端实现/宿主源码/运行时包）: ${offenders.join(', ')}`).toEqual([])
  })

  it('负样例自证：五类核心禁令 specifier 均被白名单拒绝（扫描器有效性；正例放行）', () => {
    // 禁令清单以裸 specifier 表述（不在源码中出现 "from '<禁令>'" 字样——lint-imports 同形扫描零误触）
    const forbidden = [
      '@dsh-forge' + '/core',
      '@dsh-forge' + '/knowledge',
      'electron',
      '../../../../apps/host/src/ipc/index.js',
      '../views/session/index.js',
    ]
    for (const specifier of forbidden) {
      expect(isAllowed(specifier), `应拒绝：${specifier}`).toBe(false)
    }
    for (const specifier of ['@dsh-forge/contracts', './client.js']) {
      expect(isAllowed(specifier), `应放行：${specifier}`).toBe(true)
    }
  })
})
