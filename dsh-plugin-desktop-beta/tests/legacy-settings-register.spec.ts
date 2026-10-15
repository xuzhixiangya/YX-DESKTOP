import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { installLegacySettingsRegister, type LegacySettingsScope } from '../src/legacy-settings-register.ts'

interface Descriptor {
  ns: string
  autoGenerate: boolean
  applies: 'live'
  value: { vision?: { apiKey?: string; model?: string } }
  schema: unknown
  revision: number
  secrets?: Array<{ path: string[] }>
}

interface InstalledSettings {
  describe: (options?: { redactSecrets?: boolean }) => Descriptor[]
  mutate: (
    ns: string,
    ops?: readonly { op: 'set' | 'unset'; path: readonly string[]; value?: unknown }[],
    expectedRevision?: number,
  ) => Promise<void>
  register: (
    namespace: string,
    schema: unknown,
    options?: { validate?: (value: unknown) => void },
  ) => LegacySettingsScope
}

function surface(directory: string) {
  const events: Array<{ event: string; ns: string; revision: number }> = []
  const delegated: string[] = []
  const service: InstalledSettings = {
    ownerContext: {
      emit: (event: string, ns: string, revision: number) => { events.push({ event, ns, revision }) },
      profileContext: { dir: directory },
      logger: { error: () => {} },
    },
    describe(options?: { redactSecrets?: boolean }): Descriptor[] {
      void options
      return [{ ns: 'desktop-shell', value: {}, schema: {}, revision: 0, autoGenerate: false, applies: 'live' }]
    },
    async mutate(ns: string): Promise<void> {
      delegated.push(ns)
    },
  } as unknown as InstalledSettings
  installLegacySettingsRegister(service as never)
  return { service, events, delegated }
}

const schema = z.object({
  persona: z.union(['成片']).default('成片'),
  vision: z.object({
    enabled: z.boolean().default(true),
    model: z.string().default('deepseek-v4-flash-vision-exp'),
    apiKey: z.string().role('secret').default(''),
  }),
})

describe('legacy settings.register', () => {
  const directories: string[] = []

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  function directory(): string {
    const created = mkdtempSync(join(tmpdir(), 'dsh-legacy-settings-'))
    directories.push(created)
    return created
  }

  it('publishes a registered namespace and keeps secrets off the redacted view', () => {
    const { service } = surface(directory())
    const scope = service.register('directorx', schema, {
      validate(value: unknown) {
        const vision = (value as { vision?: { enabled?: boolean; model?: string } }).vision
        if (vision?.enabled === true && (vision.model ?? '').trim() === '') throw new Error('model required')
      },
    })

    expect(scope.get()).toMatchObject({ persona: '成片', vision: { model: 'deepseek-v4-flash-vision-exp', apiKey: '' } })
    const described = service.describe({ redactSecrets: true })
    const row = described.find(item => item.ns === 'directorx')
    expect(described.map(item => item.ns)).toEqual(['desktop-shell', 'directorx'])
    expect(row?.value.vision?.apiKey).toBeUndefined()
    expect(row?.secrets?.some(secret => secret.path.join('.') === 'vision.apiKey')).toBe(true)
    expect(() => new z(row?.schema as object)(row?.value)).not.toThrow()
  })

  it('writes a path edit, refuses a stale revision, and reloads the private file', async () => {
    const dir = directory()
    const first = surface(dir)
    const scope = first.service.register('directorx', schema)
    await first.service.mutate('directorx', [{ op: 'set', path: ['vision', 'model'], value: 'saved-model' }], 0)
    expect(scope.get().vision).toMatchObject({ model: 'saved-model' })
    expect(first.events.at(-1)).toEqual({ event: 'settings/document-updated', ns: 'directorx', revision: 1 })

    const file = join(dir, 'legacy-settings', 'directorx.json')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ vision: { model: 'saved-model' } })

    await expect(first.service.mutate('directorx', [
      { op: 'set', path: ['vision', 'model'], value: 'too-late' },
    ], 0)).rejects.toMatchObject({ code: 'SETTINGS_CONFLICT', expected: 0, actual: 1 })
    expect(scope.get().vision).toMatchObject({ model: 'saved-model' })

    const second = surface(dir)
    const reloaded = second.service.register('directorx', schema)
    await viWaitFor(() => {
      expect((reloaded.get().vision as { model?: string }).model).toBe('saved-model')
    })
    expect(second.service.describe().find(item => item.ns === 'directorx')?.revision).toBe(1)
  })

  it('leaves an unknown namespace to the original settings service', async () => {
    const { service, delegated } = surface(directory())
    service.register('directorx', schema)
    await service.mutate('desktop-shell', [])
    expect(delegated).toEqual(['desktop-shell'])
  })
})

async function viWaitFor(assertion: () => void): Promise<void> {
  let last: unknown
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      last = error
      await new Promise(resolve => { setTimeout(resolve, 15) })
    }
  }
  throw last
}
