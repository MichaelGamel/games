/** Type-safe `t()` keys: typos in translation keys fail the build. */
import 'i18next'

type CommonResources = typeof import('./locales/en/common.json')
type OnlineResources = typeof import('./locales/en/online.json')
type SnakesResources = typeof import('./locales/en/snakes.json')
type LudoResources = typeof import('./locales/en/ludo.json')
type FourResources = typeof import('./locales/en/four.json')

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: {
      common: CommonResources
      online: OnlineResources
      snakes: SnakesResources
      ludo: LudoResources
      four: FourResources
    }
  }
}

export {}
