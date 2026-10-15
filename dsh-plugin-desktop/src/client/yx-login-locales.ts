/** Copy for the company gateway sign-in page. */

export const YX_LOGIN_LOCALE_NAMESPACE = 'yx.login'

const zh = {
  title: '登录 YX',
  intro: '用公司 AI 网关的账号登录。第一次会放上两个默认模型，之后到「设置 → 模型」里自己添加，不用每次重选。',
  username: '账号',
  password: '密码',
  signIn: '登录',
  signingIn: '正在登录…',
  saved: '已登录。对话里先有两个默认模型，要加别的请打开「设置 → 模型」。',
  savedKept: '已重新登录，之前添加的模型都还在。',
  noKey: 'API Key 已过期，或没有可用的 Key。暂时不能使用模型，请联系管理员。',
  skip: '暂时跳过',
  unavailable: '请在桌面应用窗口里登录。',
  menu: '账号菜单',
  more: '更多',
  settings: '设置',
  menuSignIn: '登录 YX',
  signOut: '退出登录',
  signOutTitle: '退出登录',
  signOutDescription: '退出登录不会丢失本地数据，之后仍可以登录这个账号。',
  cancel: '取消',
  close: '关闭',
} as const

const en = {
  title: 'Sign in to YX',
  intro: 'Sign in with your company AI gateway account. The first sign-in keeps two default models. Add more later in Settings → Models; later sign-ins keep that list.',
  username: 'Account',
  password: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  saved: 'Signed in. Two default models are ready. Add more in Settings → Models.',
  savedKept: 'Signed in again. The models you already added are still there.',
  noKey: 'The API key is expired, or this account has no usable key. Models cannot be used. Contact an administrator.',
  skip: 'Not now',
  unavailable: 'Sign in from the desktop app window.',
  menu: 'Account menu',
  more: 'More',
  settings: 'Settings',
  menuSignIn: 'Sign in to YX',
  signOut: 'Sign out',
  signOutTitle: 'Sign out',
  signOutDescription: 'Signing out does not delete local data. You can sign in to this account again.',
  cancel: 'Cancel',
  close: 'Close',
} as const

export type YxLoginLocaleKey = keyof typeof zh

export const yxLoginLocales = Object.freeze({ zh, en })

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Company gateway sign-in page. */
    'yx.login': YxLoginLocaleKey
  }
}
