import type { FriendIdentity } from '@/lib/friends-shared'
import type { LobbyQueueTypeValue, SupportedGameKey } from '@/lib/game-catalog'

export type LobbyStatusValue = 'open' | 'searching' | 'in-progress'
export type TicTacToeMark = 'x' | 'o'

export type TicTacToeMatchState = {
  board: Array<TicTacToeMark | null>
  marksByUserId: Record<string, TicTacToeMark>
  currentTurnUserId: string | null
  winnerUserId: string | null
  winningLine: number[] | null
  isDraw: boolean
  lastMoveAt: string | null
  lastMoveByUserId: string | null
  rematchRequestedUserIds: string[]
  rematchStartedAt: string | null
}

export type MatchSnapshot = {
  id: string
  gameKey: SupportedGameKey
  gameName: string
  gameRoute: string
  queueType: LobbyQueueTypeValue
  status: 'active' | 'finished'
  totalPlayers: number
  startedAt: string
  players: Array<{
    seatIndex: number
    isConnected: boolean
    user: FriendIdentity
  }>
  ticTacToe: TicTacToeMatchState | null
}

export type LobbySeat = {
  slotIndex: number
  member: FriendIdentity | null
}

export type LobbySnapshot = {
  id: string
  ownerId: string
  inviteCode: string
  status: LobbyStatusValue
  updatedAt: string
  queueType: LobbyQueueTypeValue
  gameKey: SupportedGameKey
  gameName: string
  gameRoute: string
  gameTagline: string
  queueLabel: string
  queueDescription: string
  partySize: number
  totalPlayers: number
  teamCount: number
  teamSize: number
  isOwner: boolean
  canInviteFriends: boolean
  canStart: boolean
  currentMatchId: string | null
  members: LobbySeat[]
}

export type LobbyRealtimeNotice = {
  type: 'lobby_updated'
  lobby: LobbySnapshot
}

export type MatchReadyRealtimeNotice = {
  type: 'match_ready'
  match: MatchSnapshot
}

export type MatchRealtimeNotice = {
  type: 'match_updated'
  match: MatchSnapshot
}

export type LobbyActionResponse = {
  data?: LobbySnapshot
  error?: string
  message?: string
  redirectPath?: string
}

export type MatchActionResponse = {
  data?: MatchSnapshot
  error?: string
  message?: string
}
