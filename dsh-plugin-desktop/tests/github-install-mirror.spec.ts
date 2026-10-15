import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseInstallSpec } from '@deepseek-ai/dsh-plugin-manager'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const siblingRoot = join(
  dirname(packageRoot),
  basename(packageRoot) === 'dsh-plugin-desktop-beta' ? 'dsh-plugin-desktop' : 'dsh-plugin-desktop-beta',
)

function clientSource(root: string) {
  return readFileSync(join(root, 'node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/client.js'), 'utf8')
}

function mirrorApi(source: string) {
  const start = source.indexOf('/* github-install-mirror */')
  const end = source.indexOf('/* end github-install-mirror */')
  if (start < 0 || end < start) throw new Error('GitHub mirror block is missing from the install dialog')
  const loaded = new Function(`${source.slice(start, end)}\nreturn { DEFAULT_GITHUB_MIRROR, normalizeGithubMirror, resolvePluginInstallSpec };`)() as {
    DEFAULT_GITHUB_MIRROR: string
    normalizeGithubMirror: (value: string) => string | null
    resolvePluginInstallSpec: (raw: string, mirror: string) => { spec: string, mirrorError: boolean }
  }
  return { block: source.slice(start, end), ...loaded }
}

const own = mirrorApi(clientSource(packageRoot))
const sibling = mirrorApi(clientSource(siblingRoot))

describe('plugin install inputs', () => {
  it('keeps the same mirror rules in both desktop editions', () => {
    expect(own.block).toBe(sibling.block)
    expect(own.DEFAULT_GITHUB_MIRROR).toBe('https://gh-proxy.com')
  })

  it('leaves a package name on the npm registry', () => {
    for (const name of ['dsh-plugin-whale-pet', '@author/dsh-plugin', 'dsh-plugin-whale-pet@1.2.3']) {
      expect(own.resolvePluginInstallSpec(name, 'not a mirror')).toEqual({ spec: name, mirrorError: false })
    }
    expect(parseInstallSpec('dsh-plugin-whale-pet')).toMatchObject({ kind: 'registry', name: 'dsh-plugin-whale-pet' })
    expect(parseInstallSpec('@author/dsh-plugin')).toMatchObject({ kind: 'registry', name: '@author/dsh-plugin' })
    expect(parseInstallSpec('dsh-plugin-whale-pet@1.2.3')).toMatchObject({ kind: 'registry', name: 'dsh-plugin-whale-pet', range: '1.2.3' })
  })

  it('leaves a local directory on its own path', () => {
    for (const path of ['/Users/name/my-plugin', 'file:/Users/name/my-plugin', 'C:\\Users\\name\\my-plugin']) {
      const resolved = own.resolvePluginInstallSpec(path, 'https://gh-proxy.com')
      expect(resolved).toEqual({ spec: path, mirrorError: false })
    }
    expect(parseInstallSpec('/Users/name/my-plugin')).toMatchObject({ kind: 'path', path: '/Users/name/my-plugin' })
    expect(parseInstallSpec('file:/Users/name/my-plugin')).toMatchObject({ kind: 'path' })
  })

  it('sends a GitHub repository through the default mirror', () => {
    const resolved = own.resolvePluginInstallSpec('https://github.com/xuzhixiangya/MoneyPrinterTurbo', own.DEFAULT_GITHUB_MIRROR)
    expect(resolved).toEqual({
      spec: 'git+https://gh-proxy.com/https://github.com/xuzhixiangya/MoneyPrinterTurbo.git',
      mirrorError: false,
    })
    expect(parseInstallSpec(resolved.spec)).toMatchObject({ kind: 'git', host: 'gh-proxy.com' })
    expect(own.resolvePluginInstallSpec('https://github.com/xuzhixiangya/MoneyPrinterTurbo.git#v1.0.0', 'https://ghfast.top/')).toEqual({
      spec: 'git+https://ghfast.top/https://github.com/xuzhixiangya/MoneyPrinterTurbo.git#v1.0.0',
      mirrorError: false,
    })
    expect(own.resolvePluginInstallSpec('github:xuzhixiangya/MoneyPrinterTurbo', own.DEFAULT_GITHUB_MIRROR).spec).toBe(
      'git+https://gh-proxy.com/https://github.com/xuzhixiangya/MoneyPrinterTurbo.git',
    )
  })

  it('keeps a cleared mirror on GitHub itself and rejects a broken mirror only for GitHub', () => {
    expect(own.resolvePluginInstallSpec('https://github.com/owner/repo', '')).toEqual({
      spec: 'https://github.com/owner/repo',
      mirrorError: false,
    })
    expect(parseInstallSpec('https://github.com/owner/repo')).toMatchObject({ kind: 'git', host: 'github.com' })
    expect(own.resolvePluginInstallSpec('https://github.com/owner/repo', 'http://127.0.0.1:7890').mirrorError).toBe(true)
    expect(own.resolvePluginInstallSpec('dsh-plugin-whale-pet', 'http://127.0.0.1:7890').mirrorError).toBe(false)
    expect(own.resolvePluginInstallSpec('/Users/name/my-plugin', 'http://127.0.0.1:7890').mirrorError).toBe(false)
    expect(own.normalizeGithubMirror('https://user:pass@gh-proxy.com')).toBeNull()
  })

  it('does not wrap a tarball, another git host, or an address that is already mirrored', () => {
    expect(own.resolvePluginInstallSpec('https://github.com/owner/repo/archive/refs/heads/main.tar.gz', own.DEFAULT_GITHUB_MIRROR).spec)
      .toBe('https://github.com/owner/repo/archive/refs/heads/main.tar.gz')
    expect(parseInstallSpec('https://github.com/owner/repo/archive/refs/heads/main.tar.gz')).toMatchObject({ kind: 'tarball' })
    expect(own.resolvePluginInstallSpec('https://gitlab.com/owner/repo.git', own.DEFAULT_GITHUB_MIRROR).spec).toBe('https://gitlab.com/owner/repo.git')
    expect(own.resolvePluginInstallSpec('https://gh-proxy.com/https://github.com/octocat/Hello-World.git', own.DEFAULT_GITHUB_MIRROR)).toEqual({
      spec: 'git+https://gh-proxy.com/https://github.com/octocat/Hello-World.git',
      mirrorError: false,
    })
  })

  it('shows the mirror field without taking over the registry selector', () => {
    const source = clientSource(packageRoot)
    expect(source).toContain('installGithubMirrorLabel: "GitHub 镜像"')
    expect(source).toContain('只有 GitHub 仓库地址会走这里')
    expect(source).toContain('let spec = install.spec.trim()')
    expect(source).toContain('spec = resolved.spec')
    expect(source).toContain('resolvePluginInstallSpec(spec, githubMirrorMemory.getSnapshot()')
    expect(source).toContain('registryNpmmirror: "中国大陆镜像源"')
  })
})
