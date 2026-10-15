/** Old plugins still call `ctx.settings.register(namespace, schema)`. */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SettingsConflictError, SettingsForms, redactSecrets } from '@deepseek-ai/dsh-settings'

/** One path edit from a settings page that does not hold the whole document. */
type SettingsOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/** The slice of the settings service this compatibility layer wraps. */
interface SettingsSurface {
  describe: (options?: { redactSecrets?: boolean }) => SettingsDescriptor[]
  mutate: (ns: string, ops: readonly SettingsOp[], expectedRevision?: number) => Promise<void>
  register?: (
    namespace: string,
    schema: unknown,
    options?: { validate?: (value: unknown) => void },
  ) => LegacySettingsScope
  ownerContext: {
    emit: (event: string, ns: string, revision: number) => void
    profileContext?: { dir?: string }
    logger?: { error?: (error: unknown) => void }
  }
}

interface SettingsDescriptor {
  ns: string
  autoGenerate: boolean
  schema: unknown
  value: unknown
  revision: number
  applies: 'live'
  base?: unknown
  user?: unknown
  secrets?: unknown
}

/** Shape DirectorX and other pre-rename plugins keep on the host. */
export interface LegacySettingsScope {
  get: () => Record<string, unknown>
  update: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>
  watch: (listener: (value: Record<string, unknown>) => void) => () => void
  load: () => Promise<Record<string, unknown>>
}

interface RegisteredSettings {
  namespace: string
  schema: unknown
  validate?: (value: unknown) => void
  value: Record<string, unknown>
  revision: number
  watchers: Set<(value: Record<string, unknown>) => void>
}

const registries = new WeakMap<SettingsSurface, Map<string, RegisteredSettings>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value)
}

function registryOf(service: SettingsSurface): Map<string, RegisteredSettings> {
  const existing = registries.get(service)
  if (existing !== undefined) return existing
  const created = new Map<string, RegisteredSettings>()
  registries.set(service, created)
  return created
}

function mergeRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = next[key]
    next[key] = isRecord(current) && isRecord(value) ? mergeRecords(current, value) : value
  }
  return next
}

function materialize(schema: unknown, stored: unknown): Record<string, unknown> {
  const seed = isRecord(stored) ? stored : {}
  if (typeof schema !== 'function') return { ...seed }
  try {
    const parsed = (schema as (value: unknown) => unknown)(seed)
    if (isRecord(parsed)) return parsed
  } catch {
    // A document saved before a schema change still has to be shown.
  }
  return { ...seed }
}

function schemaJson(schema: unknown): unknown {
  const toJSON = (schema as { toJSON?: () => unknown }).toJSON
  if (typeof toJSON !== 'function') return {}
  try {
    return JSON.parse(JSON.stringify(toJSON.call(schema))) as unknown
  } catch {
    return {}
  }
}

function profileDirectory(service: SettingsSurface): string | undefined {
  try {
    const directory = service.ownerContext.profileContext?.dir
    return typeof directory === 'string' && directory.length > 0 ? directory : undefined
  } catch {
    return undefined
  }
}

function setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) throw new TypeError('settings path is empty')
  const next = { ...root }
  let cursor: Record<string, unknown> = next
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]!
    const child = cursor[key]
    const copy = isRecord(child) ? { ...child } : {}
    cursor[key] = copy
    cursor = copy
  }
  cursor[path[path.length - 1]!] = value
  return next
}

function unsetPath(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  if (path.length === 0) throw new TypeError('settings path is empty')
  const next = { ...root }
  let cursor: Record<string, unknown> = next
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]!
    const child = cursor[key]
    if (!isRecord(child)) return next
    const copy = { ...child }
    cursor[key] = copy
    cursor = copy
  }
  delete cursor[path[path.length - 1]!]
  return next
}

function settingsFile(directory: string, namespace: string): string {
  if (!/^[\w.-]+$/u.test(namespace)) throw new TypeError(`unsafe settings namespace ${namespace}`)
  return join(directory, 'legacy-settings', `${namespace}.json`)
}

async function readStored(service: SettingsSurface, namespace: string): Promise<unknown> {
  const directory = profileDirectory(service)
  if (directory === undefined) return undefined
  try {
    return JSON.parse(await readFile(settingsFile(directory, namespace), 'utf8')) as unknown
  } catch {
    return undefined
  }
}

async function writeStored(service: SettingsSurface, row: RegisteredSettings): Promise<void> {
  const directory = profileDirectory(service)
  if (directory === undefined) return
  const file = settingsFile(directory, row.namespace)
  await mkdir(join(directory, 'legacy-settings'), { recursive: true, mode: 0o700 })
  await writeFile(file, `${JSON.stringify(row.value, null, 2)}\n`, { mode: 0o600 })
}

function publish(service: SettingsSurface, row: RegisteredSettings): void {
  const snapshot = clone(row.value)
  for (const listener of row.watchers) listener(snapshot)
  service.ownerContext.emit('settings/document-updated', row.namespace, row.revision)
}

async function commit(service: SettingsSurface, row: RegisteredSettings, next: Record<string, unknown>): Promise<void> {
  row.validate?.(next)
  const previous = row.value
  const previousRevision = row.revision
  row.value = next
  row.revision += 1
  try {
    await writeStored(service, row)
  } catch (error) {
    row.value = previous
    row.revision = previousRevision
    throw error
  }
  publish(service, row)
}

function scopeFor(service: SettingsSurface, row: RegisteredSettings): LegacySettingsScope {
  return {
    get: () => clone(row.value),
    update: async patch => {
      await commit(service, row, mergeRecords(row.value, patch))
      return clone(row.value)
    },
    watch: listener => {
      row.watchers.add(listener)
      return () => { row.watchers.delete(listener) }
    },
    load: async () => clone(row.value),
  }
}

function descriptor(row: RegisteredSettings, redact: boolean): SettingsDescriptor {
  let value: unknown = clone(row.value)
  let secrets: unknown
  if (redact) {
    try {
      const shown = redactSecrets(row.schema as never, row.value)
      value = shown.value
      secrets = shown.secrets
    } catch {
      value = {}
      secrets = []
    }
  }
  return {
    ns: row.namespace,
    autoGenerate: false,
    schema: schemaJson(row.schema),
    value,
    base: clone(value),
    user: clone(value),
    revision: row.revision,
    applies: 'live',
    ...(secrets === undefined ? {} : { secrets }),
  }
}

/**
 * Publish `settings.register` before profile plugins apply.
 * Plugins that still register a named document, such as DirectorX, otherwise
 * never appear in `settings.describe`, and their settings page stays empty.
 */
export function installLegacySettingsRegister(
  surface: SettingsSurface = SettingsForms.prototype as unknown as SettingsSurface,
): void {
  if (typeof surface.register === 'function') return
  const describe = surface.describe
  const mutate = surface.mutate
  surface.describe = function describeWithRegistered(this: SettingsSurface, options) {
    const rows = describe.call(this, options)
    const registered = registries.get(this)
    if (registered === undefined) return rows
    for (const row of registered.values()) {
      if (rows.some(item => item.ns === row.namespace)) continue
      rows.push(descriptor(row, options?.redactSecrets === true))
    }
    return rows
  }
  surface.mutate = async function mutateRegistered(this: SettingsSurface, ns, ops, expectedRevision) {
    const row = registries.get(this)?.get(ns)
    if (row === undefined) return mutate.call(this, ns, ops, expectedRevision)
    if (expectedRevision !== undefined && row.revision !== expectedRevision) {
      throw new SettingsConflictError(ns as never, expectedRevision, row.revision)
    }
    const next = ops.reduce((value, op) => op.op === 'set'
      ? setPath(value, op.path, op.value)
      : unsetPath(value, op.path), clone(row.value))
    await commit(this, row, next)
  }
  surface.register = function registerLegacySettings(this: SettingsSurface, namespace, schema, options) {
    if (typeof namespace !== 'string' || namespace.length === 0) {
      throw new TypeError('settings.register requires a namespace')
    }
    const registered = registryOf(this)
    const current = registered.get(namespace)
    if (current !== undefined) return scopeFor(this, current)
    const row: RegisteredSettings = {
      namespace,
      schema,
      value: {},
      revision: 0,
      watchers: new Set(),
      ...(options?.validate === undefined ? {} : { validate: options.validate }),
    }
    registered.set(namespace, row)
    void readStored(this, namespace).then(stored => {
      const live = registered.get(namespace)
      if (stored === undefined || live !== row || live.revision !== 0) return
      row.value = materialize(schema, stored)
      row.revision = 1
      publish(this, row)
    }).catch(error => {
      this.ownerContext.logger?.error?.(error)
    })
    row.value = materialize(schema, undefined)
    return scopeFor(this, row)
  }
}
