export type SupportedGameKey = 'tictactoe'
export type LobbyQueueTypeValue = 'public' | 'private'

export type LobbyModeDefinition = {
  label: string
  description: string
  partySize: number
  totalPlayers: number
  teamCount: number
  teamSize: number
}

export type GameDefinition = {
  key: SupportedGameKey
  name: string
  route: string
  tagline: string
  description: string
  modes: Record<LobbyQueueTypeValue, LobbyModeDefinition>
}

export const GAME_CATALOG: Record<SupportedGameKey, GameDefinition> = {
  tictactoe: {
    key: 'tictactoe',
    name: 'TicTacToe',
    route: '/TicTacToe',
    tagline: 'Classic 1v1 board duel',
    description: 'Fast tactical matches for two players.',
    modes: {
      public: {
        label: 'Single queue',
        description: 'Join public matchmaking with your own party only.',
        partySize: 1,
        totalPlayers: 2,
        teamCount: 2,
        teamSize: 1,
      },
      private: {
        label: 'Private party',
        description: 'Create a full private room and invite every player in the match.',
        partySize: 2,
        totalPlayers: 2,
        teamCount: 2,
        teamSize: 1,
      },
    },
  },
}

export const GAME_OPTIONS = Object.values(GAME_CATALOG)
export const DEFAULT_GAME_KEY: SupportedGameKey = 'tictactoe'
export const DEFAULT_QUEUE_TYPE: LobbyQueueTypeValue = 'private'

export function getGameDefinition(gameKey: SupportedGameKey) {
  return GAME_CATALOG[gameKey]
}

export function getLobbyModeDefinition(gameKey: SupportedGameKey, queueType: LobbyQueueTypeValue) {
  return GAME_CATALOG[gameKey].modes[queueType]
}
