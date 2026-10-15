/** Account form for the company AI gateway, used by setup and the sidebar dialog. */

import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  YX_GATEWAY_ORIGIN,
  type YxLoginRequest,
  type YxLoginResult,
} from '../yx-gateway.ts'
import type { YxLoginLocaleKey } from './yx-login-locales.ts'
import { type YxProviderSave } from './yx-provider.ts'

type Translate = (key: YxLoginLocaleKey) => string

interface YxLoginBridge {
  login(request: YxLoginRequest): Promise<YxLoginResult>
}

export function YxLoginPanel({ t, save, onFinished, onSkip, titleAs = 'h2' }: {
  t: Translate
  save: (result: YxLoginResult) => Promise<YxProviderSave | null>
  onFinished?: () => void | Promise<void>
  onSkip?: () => void | Promise<void>
  titleAs?: 'h1' | 'h2'
}): ReactNode {
  const Title = titleAs
  const titleId = titleAs === 'h1' ? 'desktop-account-title' : undefined
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const bridge = readYxLoginBridge()
    if (bridge === undefined) {
      setError(t('unavailable'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await bridge.login({ origin: YX_GATEWAY_ORIGIN, username, password })
      const outcome = await save(result)
      setPassword('')
      if (outcome === null) {
        setError(t('noKey'))
        return
      }
      setNotice(outcome.keptModels ? t('savedKept') : t('saved'))
      await onFinished?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return <div className="dshYxLogin">
    <Title id={titleId}>{t('title')}</Title>
    <p>{t('intro')}</p>
    <form onSubmit={event => { void signIn(event) }}>
      <label>{t('username')}<input type="text" value={username} autoComplete="username" disabled={busy} onChange={event => { setUsername(event.target.value) }} /></label>
      <label>{t('password')}<input type="password" value={password} autoComplete="current-password" disabled={busy} onChange={event => { setPassword(event.target.value) }} /></label>
      {notice !== '' && <p role="status">{notice}</p>}
      {error !== '' && <p role="alert">{error}</p>}
      <div className="dshYxLoginActions">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</Button>
        {onSkip !== undefined && <Button type="button" variant="outline" disabled={busy} onClick={() => { void onSkip() }}>{t('skip')}</Button>}
      </div>
    </form>
  </div>
}

function readYxLoginBridge(target: unknown = globalThis): YxLoginBridge | undefined {
  if (typeof target !== 'object' || target === null || !('dshYxLogin' in target)) return undefined
  const value = target.dshYxLogin
  if (typeof value !== 'object' || value === null || !('login' in value) || typeof value.login !== 'function') return undefined
  return { login: value.login as YxLoginBridge['login'] }
}
