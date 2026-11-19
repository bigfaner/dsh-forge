// web 宿主 boot token 认证门支撑自证（ledger 192d4631 测试侧收敛——就绪探针认证形态）。
// e2e/support/web-boot-auth.ts 判据正反双向验证（fetch 实现注入，零真机依赖）：
// - 正向：boot stdout `dsh web: http://127.0.0.1:<port>/?token=…` 行 → token 提取；
//   token query 303 + Set-Cookie → 会话建立；会话 GET / ok → 上线判据成立。
// - 反例（无 token 不假绿——stale probe 退役判据）：stdout 零 token 行 / 端口不匹配 →
//   提取 undefined；401 零 Set-Cookie → 会话 undefined；会话 GET / 401 → 不上线。
// 认证形态实锚 = 031-webloop curl 精查（task_logs/plugin-forge-combo/1.16/）：
// 无 token '/' → 401；带 token → 303 + Set-Cookie；静态面 cookie 会话（token query 直取 404）。
import { describe, expect, it } from 'vitest'
import { establishWebAuthSession, extractBootToken, sessionReady } from '../../../e2e/support/web-boot-auth.js'

interface FakeRes {
  ok: boolean
  status: number
  headers: { getSetCookie?: () => readonly string[] }
}

const fakeFetch = (res: FakeRes) => async (): Promise<FakeRes> => res
const fakeReject = async (): Promise<FakeRes> => {
  throw new Error('connection refused')
}

describe('extractBootToken（boot stdout token 提取）', () => {
  it('正向：`dsh web: …?token=…` 行 → 端口定向提取 token', () => {
    const stdout = 'some boot log\ndsh web: http://127.0.0.1:19831/?token=abc.123-def\n'
    expect(extractBootToken(stdout, 19831)).toBe('abc.123-def')
  })

  it('反例（无 token 不假绿）：零 boot URL 行（宿主未上线）→ undefined', () => {
    expect(extractBootToken('starting…\n', 19831)).toBeUndefined()
  })

  it('反例：端口不匹配（他实例行）→ undefined', () => {
    const stdout = 'dsh web: http://127.0.0.1:11111/?token=abc\n'
    expect(extractBootToken(stdout, 19831)).toBeUndefined()
  })
})

describe('establishWebAuthSession（token → cookie 会话）', () => {
  it('正向：token query 303 + Set-Cookie → 会话凭证（收首段 cookie 属性剥离）', async () => {
    const session = await establishWebAuthSession('http://127.0.0.1:19831', 'tok', fakeFetch({
      ok: false,
      status: 303,
      headers: { getSetCookie: () => ['dsh_session=xyz; Path=/; HttpOnly'] },
    }))
    expect(session).toEqual({ cookie: 'dsh_session=xyz', tokenStatus: 303 })
  })

  it('反例（认证门前形态——无 token fetch / 恒 401）：401 零 Set-Cookie → undefined（不假绿）', async () => {
    const session = await establishWebAuthSession('http://127.0.0.1:19831', 'tok', fakeFetch({
      ok: false,
      status: 401,
      headers: {},
    }))
    expect(session).toBeUndefined()
  })

  it('反例：请求失败（连接拒绝）→ undefined', async () => {
    expect(await establishWebAuthSession('http://127.0.0.1:19831', 'tok', fakeReject)).toBeUndefined()
  })
})

describe('sessionReady（认证形态上线判据）', () => {
  it('正向：会话 GET / ok → 上线', async () => {
    expect(await sessionReady('http://127.0.0.1:19831', 'dsh_session=xyz', fakeFetch({ ok: true, status: 200, headers: {} }))).toBe(true)
  })

  it('反例：会话 GET / 401 → 不上线', async () => {
    expect(await sessionReady('http://127.0.0.1:19831', 'dsh_session=xyz', fakeFetch({ ok: false, status: 401, headers: {} }))).toBe(false)
  })

  it('反例：请求失败 → 不上线', async () => {
    expect(await sessionReady('http://127.0.0.1:19831', 'dsh_session=xyz', fakeReject)).toBe(false)
  })
})
