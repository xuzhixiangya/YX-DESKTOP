/** Electron user-data location. Kept separate from the launcher so the app can pin it. */

import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { DESKTOP_PRODUCT_NAME } from './product-identity.ts'

/** Resolve the Electron user-data location without importing Electron. */
export function defaultDesktopUserDataDirectory(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = homedir(),
): string {
  const path = platform === 'win32' ? win32 : posix
  if (platform === 'win32') {
    const appData = environment.APPDATA
    if (appData === undefined || appData.length === 0) {
      throw new Error('APPDATA is unavailable; cannot locate DSH Desktop diagnostics')
    }
    return path.join(appData, DESKTOP_PRODUCT_NAME)
  }
  if (platform === 'darwin') return path.join(homeDirectory, 'Library', 'Application Support', DESKTOP_PRODUCT_NAME)
  const config = environment.XDG_CONFIG_HOME
  return path.join(config === undefined || config.length === 0 ? path.join(homeDirectory, '.config') : config, DESKTOP_PRODUCT_NAME)
}
