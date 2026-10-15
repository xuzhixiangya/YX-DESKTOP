import { describe, expect, it } from 'vitest'
import { installRunningStatusCopy } from '../src/client/yx-running-status.ts'

function localeRuntime() {
  const dictionaries: Record<string, string> = {
    'chat.deepDiving': '深度求索中',
    'chat.deepDivingFor': '深度求索中，用时 {duration} ···',
    'chat.toBottom': '回到底部',
  }
  class Runtime {
    translate(ns: string, key: string, params?: Record<string, unknown>): string {
      const template = ns === 'chat' ? dictionaries[key] ?? key : key
      if (params === undefined) return template
      return template.replaceAll('{duration}', String(params.duration))
    }
  }
  const runtime = new Runtime()
  const t = (key: string, params?: Record<string, unknown>): string => runtime.translate('chat', key, params)
  return { runtime, t }
}

describe('running status copy', () => {
  it('rewrites the two running-status lines and leaves other chat copy alone', () => {
    const { runtime, t } = localeRuntime()
    const restore = installRunningStatusCopy(runtime)

    expect(t('chat.deepDiving')).toBe('深度思考中')
    expect(t('chat.deepDivingFor', { duration: '1秒' })).toBe('深度思考中，用时 1秒 ···')
    expect(t('chat.toBottom')).toBe('回到底部')
    expect(runtime.translate('other', 'chat.deepDiving')).toBe('chat.deepDiving')

    restore()
    expect(t('chat.deepDiving')).toBe('深度求索中')
    expect(t('chat.deepDivingFor', { duration: '1秒' })).toBe('深度求索中，用时 1秒 ···')
  })

  it('does nothing when the locale runtime has no translator', () => {
    expect(installRunningStatusCopy({})()).toBeUndefined()
  })
})
