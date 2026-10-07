// forge 设置域 typed errors（任务 2.7）。与双域 errors.ts（forge/errors.ts ·
// small-domains/errors.ts）定位不同：本域两错误均为装配期/调用方编程错误——不跨 RPC
// 信封序列化（rpc-envelope 结构判型 code ∈ contracts ERROR_CODES 才入带内信封，M3 1.1
// 已 pin 24 码无设置域码——安全考量「路径守卫 userData 域」的拒绝面不属运行期用户面），
// 命中即 fail-loud 原样上抛（对齐 Error Handling「非 typed 错误不静默降级为伪码」）。
// · SettingsPathInvalidError：settingsFile 域外（装配期守卫——单写者写面永不落 userData 外）
// · InvalidSettingsInputError：set 入参形状违规（RPC 边界防御——UI 4.5 已前置校验，双保险）

/** ERR 路径守卫附载（两路径原样呈现——装配排障面） */
export interface SettingsPathInvalidData {
  readonly settingsFile: string
  readonly userDataDir: string
}

/** settingsFile 落在 userData 域外（含 `..` 逃逸 / 同前缀目录 / 指向域根本身）：
 *  createSettingsService 构造即拒——openDatabase 坏路径同径 fail-loud，不产出静默错位服务 */
export class SettingsPathInvalidError extends Error {
  readonly data: SettingsPathInvalidData

  constructor(data: SettingsPathInvalidData) {
    super(
      `forge 设置文件路径越界（拒绝装配——单写者写面必须落在 userData 域内）：${data.settingsFile} ⊄ ${data.userDataDir}`,
    )
    this.name = 'SettingsPathInvalidError'
    this.data = data
  }
}

/** set 入参违规（worker 段缺失 / provider·model 空白 / reasoning ∉ low|medium|high） */
export class InvalidSettingsInputError extends Error {
  constructor(message: string) {
    super(`forge 设置入参违规：${message}`)
    this.name = 'InvalidSettingsInputError'
  }
}
