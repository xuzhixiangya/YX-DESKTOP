/**
 * Company AI gateway login for the desktop shell.
 *
 * The gateway (new-api) issues a short-lived dashboard session. Desktop then
 * uses the first enabled relay token that still has quota. It does not create
 * a token. Only that relay token, prefixed `sk-`, is returned to the page.
 * The password and dashboard access token stay in this process.
 */

export const YX_LOGIN_CHANNEL = 'dsh-desktop:yx-login'
export const YX_GATEWAY_ORIGIN = 'https://aiapi.yxrobot.com'
export const YX_PROVIDER_ROUTE = 'yx-gateway'
export const YX_API_KEY_REF = 'YX_GATEWAY_API_KEY'
export const YX_PROVIDER_NAMESPACE = 'llm-pi-ai'

const MAX_ORIGIN_LENGTH = 200
const MAX_USERNAME_LENGTH = 64
const MAX_PASSWORD_LENGTH = 256
const MAX_MODELS = 200
const REQUEST_TIMEOUT_MS = 20_000
const TOKEN_PAGE_SIZE = 100
const MAX_TOKEN_PAGES = 20
/** new-api: 1 enabled, 2 disabled, 3 expired, 4 exhausted. */
const TOKEN_STATUS_ENABLED = 1

export class YxGatewayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YxGatewayError'
  }
}

export interface YxLoginRequest {
  readonly origin: string
  readonly username: string
  readonly password: string
}

export interface YxLoginSuccess {
  readonly username: string
  readonly models: readonly string[]
  readonly apiKey: string
  readonly baseURL: string
}

/** Account password was accepted, but no enabled token still has quota. */
export interface YxLoginBlocked {
  readonly username: string
  readonly models: readonly string[]
  readonly apiKey: null
  readonly baseURL: string
}

export type YxLoginResult = YxLoginSuccess | YxLoginBlocked

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface TokenRow {
  readonly id: number
  readonly status: number
  readonly expiredTime: number
  readonly remainQuota: number
  readonly unlimitedQuota: boolean
}

export function parseYxLoginRequest(value: unknown): YxLoginRequest {
  if (!isRecord(value)) throw new YxGatewayError('登录信息不完整')
  const username = typeof value.username === 'string' ? value.username.trim() : ''
  const password = typeof value.password === 'string' ? value.password : ''
  if (username.length === 0 || username.length > MAX_USERNAME_LENGTH || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new YxGatewayError('请填写账号和密码')
  }
  return Object.freeze({
    origin: normalizeYxGatewayOrigin(value.origin),
    username,
    password,
  })
}

/** Accept loopback HTTP and any HTTPS gateway. Reject other cleartext hosts. */
export function normalizeYxGatewayOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ORIGIN_LENGTH) {
    throw new YxGatewayError('网关地址无效')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new YxGatewayError('网关地址无效')
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new YxGatewayError('网关地址无效')
  }
  if (url.protocol === 'http:') {
    if (!loopback) throw new YxGatewayError('网关地址必须是本机，或使用 https')
  } else if (url.protocol !== 'https:' || url.hostname.length === 0) {
    throw new YxGatewayError('网关地址无效')
  }
  return url.origin
}

export function yxGatewayBaseURL(origin: string): string {
  return `${normalizeYxGatewayOrigin(origin)}/v1`
}

export function assertYxApiKey(value: string): string {
  if (!/^sk-[0-9A-Za-z]{16,128}$/u.test(value)) throw new YxGatewayError('网关没有返回可用的 API Key')
  return value
}

export function assertYxModelIds(models: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const accepted: string[] = []
  for (const model of models) {
    const id = model.trim()
    if (id.length === 0 || id.length > 200 || /[\u0000-\u001f\u007f]/u.test(id) || seen.has(id)) continue
    seen.add(id)
    accepted.push(id)
  }
  if (accepted.length === 0) throw new YxGatewayError('请至少选择一个模型')
  if (accepted.length > MAX_MODELS) throw new YxGatewayError(`一次最多添加 ${String(MAX_MODELS)} 个模型`)
  return Object.freeze(accepted)
}

export async function loginYxGateway(fetchImpl: FetchLike, input: YxLoginRequest): Promise<YxLoginResult> {
  const request = parseYxLoginRequest(input)
  await assertPasswordEncryptionOff(fetchImpl, request.origin)
  const accessToken = await login(fetchImpl, request)
  const baseURL = yxGatewayBaseURL(request.origin)
  const tokenId = await findUsableToken(fetchImpl, request.origin, accessToken)
  if (tokenId === undefined) {
    return Object.freeze({
      username: request.username,
      models: Object.freeze([]),
      apiKey: null,
      baseURL,
    })
  }
  const models = await listModels(fetchImpl, request.origin, accessToken)
  const apiKey = await readTokenKey(fetchImpl, request.origin, accessToken, tokenId)
  return Object.freeze({
    username: request.username,
    models,
    apiKey,
    baseURL,
  })
}

async function assertPasswordEncryptionOff(fetchImpl: FetchLike, origin: string): Promise<void> {
  const body = await gatewayJson(fetchImpl, origin, '/api/user/login/encryption-key', { method: 'GET' })
  const data = recordData(body, '无法确认网关的登录方式')
  if (data.enabled === true) throw new YxGatewayError('网关要求加密密码，当前桌面登录还不支持。请先在网关关闭密码加密。')
}

async function login(fetchImpl: FetchLike, request: YxLoginRequest): Promise<string> {
  const body = await gatewayJson(fetchImpl, request.origin, '/api/user/login', {
    method: 'POST',
    body: JSON.stringify({ username: request.username, password: request.password }),
  }, request.password)
  const data = recordData(body, failureMessage(body, request.password) ?? '登录失败')
  if (data.require_verification === true) throw new YxGatewayError('这个账号还需要额外验证，当前桌面登录还不支持')
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new YxGatewayError(failureMessage(body, request.password) ?? '登录没有完成')
  }
  return data.access_token
}

async function listModels(fetchImpl: FetchLike, origin: string, accessToken: string): Promise<readonly string[]> {
  const body = await gatewayJson(fetchImpl, origin, '/api/user/models', {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = successData(body, '没有读到模型列表')
  if (!Array.isArray(data)) throw new YxGatewayError('没有读到模型列表')
  const models = data.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 200)
  return Object.freeze([...new Set(models.map(item => item.trim()))].sort((left, right) => left.localeCompare(right)))
}

async function findUsableToken(fetchImpl: FetchLike, origin: string, accessToken: string): Promise<number | undefined> {
  const now = Math.floor(Date.now() / 1000)
  for (let page = 1; page <= MAX_TOKEN_PAGES; page += 1) {
    const listed = await listTokenPage(fetchImpl, origin, accessToken, page)
    const tokenId = pickUsableTokenId(listed.rows, now)
    if (tokenId !== undefined) return tokenId
    if (listed.rows.length < TOKEN_PAGE_SIZE || page * TOKEN_PAGE_SIZE >= listed.total) return undefined
  }
  return undefined
}

async function listTokenPage(fetchImpl: FetchLike, origin: string, accessToken: string, page: number): Promise<{ rows: readonly TokenRow[]; total: number }> {
  const path = `/api/token/?p=${String(page)}&size=${String(TOKEN_PAGE_SIZE)}`
  const body = await gatewayJson(fetchImpl, origin, path, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = recordData(body, failureMessage(body, '') ?? '读取令牌失败')
  if (!Array.isArray(data.items)) throw new YxGatewayError('读取令牌失败')
  const rows: TokenRow[] = []
  for (const item of data.items) {
    if (!isRecord(item) || typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id <= 0) continue
    rows.push({
      id: item.id,
      status: typeof item.status === 'number' ? item.status : 0,
      expiredTime: typeof item.expired_time === 'number' ? item.expired_time : -1,
      remainQuota: typeof item.remain_quota === 'number' && Number.isFinite(item.remain_quota) ? item.remain_quota : 0,
      unlimitedQuota: item.unlimited_quota === true,
    })
  }
  const total = typeof data.total === 'number' && Number.isFinite(data.total) ? data.total : rows.length
  return { rows, total }
}

/** First enabled, unexpired token that still has quota, in the gateway's own list order. */
export function pickUsableTokenId(rows: readonly TokenRow[], now = Math.floor(Date.now() / 1000)): number | undefined {
  for (const row of rows) {
    if (row.status !== TOKEN_STATUS_ENABLED) continue
    if (row.expiredTime > 0 && row.expiredTime <= now) continue
    if (!row.unlimitedQuota && row.remainQuota <= 0) continue
    return row.id
  }
  return undefined
}

async function readTokenKey(fetchImpl: FetchLike, origin: string, accessToken: string, tokenId: number): Promise<string> {
  const body = await gatewayJson(fetchImpl, origin, `/api/token/${String(tokenId)}/key`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: '{}',
  })
  const data = recordData(body, '没有拿到 API Key')
  if (typeof data.key !== 'string' || data.key.length === 0) throw new YxGatewayError('没有拿到 API Key')
  return assertYxApiKey(data.key.startsWith('sk-') ? data.key : `sk-${data.key}`)
}

async function gatewayJson(fetchImpl: FetchLike, origin: string, path: string, init: RequestInit, secret = ''): Promise<unknown> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  headers.set('accept-language', 'zh-CN')
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  let response: Response
  try {
    response = await fetchImpl(new URL(path, origin).href, {
      ...init,
      headers,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new YxGatewayError('连不上 AI 网关')
  }
  let body: unknown
  try {
    body = await response.json() as unknown
  } catch {
    throw new YxGatewayError('AI 网关返回的内容无法识别')
  }
  if (!isRecord(body)) throw new YxGatewayError('AI 网关返回的内容无法识别')
  if (body.success === false) throw new YxGatewayError(failureMessage(body, secret) ?? 'AI 网关拒绝了这次请求')
  return body
}

function successData(body: unknown, fallback: string): unknown {
  if (!isRecord(body) || body.success !== true) throw new YxGatewayError(failureMessage(body, '') ?? fallback)
  return body.data
}

function recordData(body: unknown, fallback: string): Record<string, unknown> {
  const data = successData(body, fallback)
  if (!isRecord(data)) throw new YxGatewayError(fallback)
  return data
}

function failureMessage(body: unknown, secret: string): string | undefined {
  if (!isRecord(body) || typeof body.message !== 'string') return undefined
  const message = body.message.trim()
  if (message.length === 0 || message.length > 200) return undefined
  if (secret.length > 0 && message.includes(secret)) return undefined
  return message
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
