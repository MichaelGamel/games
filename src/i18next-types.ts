/** Type-safe `t()` keys: typos in translation keys fail the build. */
import 'i18next'

type CommonResources = typeof import('./locales/en/common.json')
type OnlineResources = typeof import('./locales/en/online.json')
type SnakesResources = typeof import('./locales/en/snakes.json')
type LudoResources = typeof import('./locales/en/ludo.json')
type FourResources = typeof import('./locales/en/four.json')
type UnoResources = typeof import('./locales/en/uno.json')
type BankResources = typeof import('./locales/en/bank.json')
type XOResources = typeof import('./locales/en/xo.json')
type ChessResources = typeof import('./locales/en/chess.json')
type BackgammonResources = typeof import('./locales/en/backgammon.json')

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: {
      common: CommonResources
      online: OnlineResources
      snakes: SnakesResources
      ludo: LudoResources
      four: FourResources
      uno: UnoResources
      bank: BankResources
      xo: XOResources
      chess: ChessResources
      backgammon: BackgammonResources
    }
  }
}

export {}
