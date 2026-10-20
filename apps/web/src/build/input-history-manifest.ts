// input-history 装载双真相源断言（定位：装配——vite.config 构建期消费的纯函数面）。
// apps/web/src/main.ts 的 inputHistoryClient 掌舵行（id/inject）与
// @dsh-forge/input-history package.json 的 dsh.client 清单是同一装载契约的两处
// 字面表达（desktop 径读包清单、web 径读 main.ts 字面量）——构建期在此核销一致性，
// 漂移即 fail-loud，不引入共享 import（资产零代码耦合不变）。

/** main.ts 掌舵行块匹配（块体到缩进收敛的闭花括号） */
const STEERING_BLOCK = /const inputHistoryClient: ProductClientEntry = \{([\s\S]*?)\n\}/

/**
 * 断言 main.ts inputHistoryClient 掌舵行与包 dsh.client 清单一致。
 * @param mainTsSource apps/web/src/main.ts 源文本
 * @param manifest 包 package.json 解析出的 { name, dsh.client.inject }
 */
export function assertInputHistorySteeringLine(
  mainTsSource: string,
  manifest: { name: string; inject: readonly string[] },
): void {
  const block = mainTsSource.match(STEERING_BLOCK)?.[1]
  if (block === undefined) {
    throw new Error('vite: main.ts inputHistoryClient 掌舵行缺席——双真相源断言无锚点')
  }
  const id = block.match(/id: '([^']+)'/)?.[1]
  if (id !== manifest.name) {
    throw new Error(`vite: main.ts inputHistoryClient id（${id ?? '缺席'}）与包 package.json name（${manifest.name}）漂移`)
  }
  const injectBody = block.match(/inject: \[([^\]]*)\]/)?.[1]
  const inject = injectBody === undefined ? undefined : [...injectBody.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  if (inject === undefined) {
    if (manifest.inject.length !== 0) {
      throw new Error(`vite: main.ts 掌舵行缺 inject，包 dsh.client.inject 要求 [${manifest.inject.join(', ')}]`)
    }
    return
  }
  if (
    inject.length !== manifest.inject.length ||
    inject.some((name, i) => name !== manifest.inject[i])
  ) {
    throw new Error(`vite: main.ts 掌舵行 inject [${inject.join(', ')}] 与包 dsh.client.inject [${manifest.inject.join(', ')}] 漂移`)
  }
}
