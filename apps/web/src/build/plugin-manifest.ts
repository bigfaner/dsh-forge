// 独立插件包装载双真相源断言（通用面，定位：装配——vite.config 构建期消费的纯函数）。
// apps/web/src/main.ts 各插件掌舵行（id/inject）与对应包 package.json 的 dsh.client
// 清单是同一装载契约的两处字面表达（desktop 径读包清单、web 径读 main.ts 字面量）——
// 构建期在此核销一致性，漂移即 fail-loud，不引入共享 import（资产零代码耦合不变）。
// input-history 判例同构（input-history-manifest.ts 为首个特例；super-composer/1.9
// 抽出通用形供 quote-reference / super-composer 两包复用）。

/**
 * 断言 main.ts 指定掌舵行块与包 dsh.client 清单一致。
 * @param mainTsSource apps/web/src/main.ts 源文本
 * @param block 掌舵行块匹配（块体到缩进收敛的闭花括号，如 /const quoteReferenceClient: ProductClientEntry = \{([\s\S]*?)\n\}/）
 * @param manifest 包 package.json 解析出的 { name, dsh.client.inject }
 * @param label 报错定位标签（如 '@dsh-forge/quote-reference'）
 */
export function assertPluginSteeringLine(
  mainTsSource: string,
  block: RegExp,
  manifest: { name: string; inject: readonly string[] },
  label: string,
): void {
  const body = mainTsSource.match(block)?.[1]
  if (body === undefined) {
    throw new Error(`vite: main.ts ${label} 掌舵行缺席——双真相源断言无锚点`)
  }
  const id = body.match(/id: '([^']+)'/)?.[1]
  if (id !== manifest.name) {
    throw new Error(`vite: main.ts ${label} id（${id ?? '缺席'}）与包 package.json name（${manifest.name}）漂移`)
  }
  const injectBody = body.match(/inject: \[([^\]]*)\]/)?.[1]
  const inject = injectBody === undefined ? undefined : [...injectBody.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  if (inject === undefined) {
    if (manifest.inject.length !== 0) {
      throw new Error(`vite: main.ts ${label} 掌舵行缺 inject，包 dsh.client.inject 要求 [${manifest.inject.join(', ')}]`)
    }
    return
  }
  if (
    inject.length !== manifest.inject.length ||
    inject.some((name, i) => name !== manifest.inject[i])
  ) {
    throw new Error(`vite: main.ts ${label} 掌舵行 inject [${inject.join(', ')}] 与包 dsh.client.inject [${manifest.inject.join(', ')}] 漂移`)
  }
}
