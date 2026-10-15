import { describe, expect, it } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import {
  LEGACY_SETTINGS_SCOPE_SERVICE,
  provideLegacySettingsScope,
} from '../src/client/settings-bridge.ts'

describe('legacy settingsScope', () => {
  it('publishes the old service name and reads a form by namespace', () => {
    const provided: { name?: string; bind?: (request: { namespace?: string }) => unknown } = {}
    const ctx = {
      configForms: {
        get: (namespace: string) => ({ namespace }),
      },
      reflect: {
        provide: (name: string, value: { bind: (request: { namespace?: string }) => unknown }) => {
          provided.name = name
          provided.bind = value.bind
          return () => {}
        },
      },
    }

    const dispose = provideLegacySettingsScope(ctx as unknown as ClientContext)

    expect(provided.name).toBe(LEGACY_SETTINGS_SCOPE_SERVICE)
    expect(provided.bind?.({ namespace: 'directorx' })).toEqual({ namespace: 'directorx' })
    expect(() => provided.bind?.({})).toThrow(/namespace/u)
    expect(typeof dispose).toBe('function')
  })
})
