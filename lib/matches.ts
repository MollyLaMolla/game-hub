import { prisma } from '@/lib/prisma'
import {
  getGameDefinition,
  type LobbyQueueTypeValue,
  type SupportedGameKey,
} from '@/lib/game-catalog'
import type { FriendIdentity } from '@/lib/friends-shared'
import type { MatchSnapshot, TicTacToeMark, TicTacToeMatchState } from '@/lib/lobbies-shared'

const DEFAULT_AVATAR = '/images/profile_icons/fox.png'
export const MATCH_ROOM_PRESENCE_WINDOW_MS = 5_000
export const MATCH_FORFEIT_AFTER_MS = 10_000
export const MATCH_CLEANUP_AFTER_MS = 20_000
const TICTACTOE_WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const

type MatchRecord = Awaited<ReturnType<typeof findMatchById>>

type LobbyForMatchCreation = {
  id: string
  gameKey: string
  queueType: string
  totalPlayers: number
  members: Array<{
    userId: string
  }>
}

function normalizeIdentity(user: {
  id: string
  inGameName: string | null
  tag: string | null
  avatarUrl: string | null
}): FriendIdentity {
  return {
    id: user.id,
    inGameName: user.inGameName || 'Player',
    tag: user.tag || 'READY',
    avatarUrl: user.avatarUrl || DEFAULT_AVATAR,
  }
}

function fromPrismaGameKey(value: string): SupportedGameKey {
  return value.toLowerCase() as SupportedGameKey
}

function fromPrismaQueueType(value: string): LobbyQueueTypeValue {
  return value.toLowerCase() as LobbyQueueTypeValue
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createMarksByUserId(
  participants: Array<{
    userId: string
    seatIndex: number
  }>
) {
  return participants.reduce<Record<string, TicTacToeMark>>((accumulator, participant) => {
    accumulator[participant.userId] = participant.seatIndex % 2 === 0 ? 'x' : 'o'
    return accumulator
  }, {})
}

function normalizeBoard(value: unknown) {
  if (!Array.isArray(value)) {
    return Array<TicTacToeMark | null>(9).fill(null)
  }

  return Array.from({ length: 9 }, (_, index) => {
    const cellValue = value[index]
    return cellValue === 'x' || cellValue === 'o' ? cellValue : null
  })
}

function normalizeWinningLine(value: unknown) {
  if (!Array.isArray(value) || value.length !== 3) {
    return null
  }

  const line = value.map(entry => (typeof entry === 'number' ? entry : Number.NaN))
  return line.every(entry => Number.isInteger(entry) && entry >= 0 && entry <= 8) ? line : null
}

function createInitialTicTacToeState(
  participants: Array<{
    userId: string
    seatIndex: number
  }>
): TicTacToeMatchState {
  return {
    board: Array<TicTacToeMark | null>(9).fill(null),
    marksByUserId: createMarksByUserId(participants),
    currentTurnUserId: participants[0]?.userId || null,
    winnerUserId: null,
    winningLine: null,
    isDraw: false,
    lastMoveAt: null,
    lastMoveByUserId: null,
    rematchRequestedUserIds: [],
    rematchStartedAt: null,
  }
}

function normalizeTicTacToeState(
  rawState: unknown,
  participants: Array<{
    userId: string
    seatIndex: number
  }>
): TicTacToeMatchState {
  const defaultState = createInitialTicTacToeState(participants)

  if (!isRecord(rawState)) {
    return defaultState
  }

  const marksByUserId = createMarksByUserId(participants)

  if (isRecord(rawState.marksByUserId)) {
    for (const participant of participants) {
      const mark = rawState.marksByUserId[participant.userId]

      if (mark === 'x' || mark === 'o') {
        marksByUserId[participant.userId] = mark
      }
    }
  }

  return {
    board: normalizeBoard(rawState.board),
    marksByUserId,
    currentTurnUserId:
      typeof rawState.currentTurnUserId === 'string'
        ? rawState.currentTurnUserId
        : defaultState.currentTurnUserId,
    winnerUserId: typeof rawState.winnerUserId === 'string' ? rawState.winnerUserId : null,
    winningLine: normalizeWinningLine(rawState.winningLine),
    isDraw: rawState.isDraw === true,
    lastMoveAt: typeof rawState.lastMoveAt === 'string' ? rawState.lastMoveAt : null,
    lastMoveByUserId:
      typeof rawState.lastMoveByUserId === 'string' ? rawState.lastMoveByUserId : null,
    rematchRequestedUserIds: Array.isArray(rawState.rematchRequestedUserIds)
      ? rawState.rematchRequestedUserIds.filter(
          entry => typeof entry === 'string' && participants.some(player => player.userId === entry)
        )
      : [],
    rematchStartedAt:
      typeof rawState.rematchStartedAt === 'string' ? rawState.rematchStartedAt : null,
  }
}

function createRematchState(
  previousState: TicTacToeMatchState,
  participants: Array<{
    userId: string
    seatIndex: number
  }>
) {
  return {
    ...createInitialTicTacToeState(participants),
    marksByUserId: previousState.marksByUserId,
    rematchStartedAt: new Date().toISOString(),
  } satisfies TicTacToeMatchState
}

function findWinningLine(board: Array<TicTacToeMark | null>) {
  const winningLine = TICTACTOE_WINNING_LINES.find(([first, second, third]) => {
    return board[first] && board[first] === board[second] && board[first] === board[third]
  })

  return winningLine ? [...winningLine] : null
}

function isOlderThan(value: Date | string | null | undefined, thresholdMs: number, nowMs: number) {
  if (!value) {
    return true
  }

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return true
  }

  return nowMs - timestamp > thresholdMs
}

async function findMatchById(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participants: {
        orderBy: {
          seatIndex: 'asc',
        },
        include: {
          user: {
            select: {
              id: true,
              inGameName: true,
              tag: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  })
}

function serializeMatch(match: NonNullable<MatchRecord>, now = new Date()): MatchSnapshot {
  const gameKey = fromPrismaGameKey(match.gameKey)
  const game = getGameDefinition(gameKey)
  const nowMs = now.getTime()
  const participants = match.participants.map(participant => ({
    userId: participant.userId,
    seatIndex: participant.seatIndex,
  }))
  const ticTacToe =
    gameKey === 'tictactoe' ? normalizeTicTacToeState(match.state, participants) : null

  return {
    id: match.id,
    gameKey,
    gameName: game.name,
    gameRoute: game.route,
    queueType: fromPrismaQueueType(match.queueType),
    status: match.status === 'FINISHED' ? 'finished' : 'active',
    totalPlayers: match.totalPlayers,
    startedAt: match.startedAt.toISOString(),
    players: match.participants.map(participant => ({
      seatIndex: participant.seatIndex,
      isConnected: !isOlderThan(participant.lastSeenAt, MATCH_ROOM_PRESENCE_WINDOW_MS, nowMs),
      user: normalizeIdentity(participant.user),
    })),
    ticTacToe,
  }
}

async function reconcileTicTacToeDisconnect(
  match: NonNullable<MatchRecord>,
  now = new Date()
): Promise<NonNullable<MatchRecord>> {
  if (
    match.gameKey !== 'TICTACTOE' ||
    match.status === 'FINISHED' ||
    match.participants.length !== 2
  ) {
    return match
  }

  const nowMs = now.getTime()
  const disconnectedParticipants = match.participants.filter(participant =>
    isOlderThan(participant.lastSeenAt, MATCH_FORFEIT_AFTER_MS, nowMs)
  )

  if (disconnectedParticipants.length !== 1) {
    return match
  }

  const disconnectedParticipant = disconnectedParticipants[0]
  const winner = match.participants.find(
    participant => participant.userId !== disconnectedParticipant.userId
  )

  if (!winner) {
    return match
  }

  const state = normalizeTicTacToeState(
    match.state,
    match.participants.map(entry => ({
      userId: entry.userId,
      seatIndex: entry.seatIndex,
    }))
  )

  if (state.winnerUserId || state.isDraw) {
    return match
  }

  return prisma.match.update({
    where: { id: match.id },
    data: {
      status: 'FINISHED',
      finishedAt: now,
      state: {
        ...state,
        currentTurnUserId: null,
        winnerUserId: winner.userId,
        winningLine: null,
        isDraw: false,
        lastMoveAt: now.toISOString(),
        rematchRequestedUserIds: [],
      } satisfies TicTacToeMatchState,
    },
    include: {
      participants: {
        orderBy: {
          seatIndex: 'asc',
        },
        include: {
          user: {
            select: {
              id: true,
              inGameName: true,
              tag: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  })
}

export async function cleanupInactiveLobbiesAndMatches(now = new Date()) {
  const staleCutoff = new Date(now.getTime() - MATCH_CLEANUP_AFTER_MS)
  const lobbiesToDelete = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT l.id
    FROM "Lobby" l
    LEFT JOIN "LobbyMember" lm ON lm."lobbyId" = l.id
    GROUP BY l.id
    HAVING COUNT(lm.id) = 0
      OR BOOL_AND(lm."lastSeenAt" IS NULL OR lm."lastSeenAt" < ${staleCutoff})
  `

  if (lobbiesToDelete.length) {
    await prisma.lobby.deleteMany({
      where: {
        id: {
          in: lobbiesToDelete.map(lobby => lobby.id),
        },
      },
    })
  }

  const matchesToDelete = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT m.id
    FROM "Match" m
    LEFT JOIN "MatchParticipant" mp ON mp."matchId" = m.id
    LEFT JOIN "Lobby" l ON l."currentMatchId" = m.id
    GROUP BY m.id, m.status, m."finishedAt"
    HAVING COUNT(DISTINCT l.id) = 0
      AND (
        COUNT(DISTINCT mp.id) = 0
        OR BOOL_AND(mp."lastSeenAt" IS NULL OR mp."lastSeenAt" < ${staleCutoff})
        OR (m.status = 'FINISHED' AND m."finishedAt" < ${staleCutoff})
      )
  `

  if (matchesToDelete.length) {
    await prisma.match.deleteMany({
      where: {
        id: {
          in: matchesToDelete.map(match => match.id),
        },
      },
    })
  }
}

export async function getMatchSnapshot(matchId: string, userId?: string) {
  const match = await findMatchById(matchId)

  if (!match) {
    throw new Error('Match not found.')
  }

  if (userId && !match.participants.some(participant => participant.userId === userId)) {
    throw new Error('You are not part of this match.')
  }

  const reconciledMatch = await reconcileTicTacToeDisconnect(match)
  await cleanupInactiveLobbiesAndMatches()

  return serializeMatch(reconciledMatch)
}

export async function getMatchParticipantUserIds(matchId: string) {
  const participants = await prisma.matchParticipant.findMany({
    where: { matchId },
    select: { userId: true },
  })

  return participants.map(participant => participant.userId)
}

export async function touchMatchPresence(matchId: string, userId: string) {
  const now = new Date()
  const activeLobby = await prisma.lobby.findFirst({
    where: {
      currentMatchId: matchId,
      members: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
    },
  })

  const updates = [
    prisma.matchParticipant.updateMany({
      where: {
        matchId,
        userId,
      },
      data: {
        lastSeenAt: now,
      },
    }),
  ]

  if (activeLobby) {
    updates.push(
      prisma.lobbyMember.updateMany({
        where: {
          lobbyId: activeLobby.id,
          userId,
        },
        data: {
          lastSeenAt: now,
        },
      })
    )
  }

  const [participantUpdate] = await prisma.$transaction(updates)

  if (participantUpdate.count === 0) {
    throw new Error('You are not part of this match.')
  }

  const match = await findMatchById(matchId)

  if (!match) {
    throw new Error('Match not found.')
  }

  const reconciledMatch = await reconcileTicTacToeDisconnect(match, now)
  await cleanupInactiveLobbiesAndMatches(now)

  return serializeMatch(reconciledMatch, now)
}

export async function createMatchFromLobbies(lobbies: LobbyForMatchCreation[]) {
  if (!lobbies.length) {
    throw new Error('Cannot create a match without at least one lobby.')
  }

  const firstLobby = lobbies[0]
  const participants = lobbies.flatMap(lobby => lobby.members)

  if (participants.length !== firstLobby.totalPlayers) {
    throw new Error('Lobby parties do not satisfy the player requirement for this match.')
  }

  const createdMatch = await prisma.match.create({
    data: {
      gameKey: firstLobby.gameKey as never,
      queueType: firstLobby.queueType as never,
      totalPlayers: firstLobby.totalPlayers,
      state:
        firstLobby.gameKey === 'TICTACTOE'
          ? createInitialTicTacToeState(
              participants.map((participant, seatIndex) => ({
                userId: participant.userId,
                seatIndex,
              }))
            )
          : {},
      participants: {
        create: participants.map((participant, seatIndex) => ({
          userId: participant.userId,
          seatIndex,
        })),
      },
    },
  })

  await prisma.lobby.updateMany({
    where: {
      id: {
        in: lobbies.map(lobby => lobby.id),
      },
    },
    data: {
      status: 'IN_PROGRESS',
      currentMatchId: createdMatch.id,
      startedAt: new Date(),
    },
  })

  const hydratedMatch = await findMatchById(createdMatch.id)

  if (!hydratedMatch) {
    throw new Error('Match not found after creation.')
  }

  return serializeMatch(hydratedMatch)
}

export async function makeTicTacToeMove(matchId: string, userId: string, cellIndex: number) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
    throw new Error('Invalid board cell.')
  }

  const match = await findMatchById(matchId)

  if (!match) {
    throw new Error('Match not found.')
  }

  if (match.gameKey !== 'TICTACTOE') {
    throw new Error('This move endpoint only supports TicTacToe matches.')
  }

  const participant = match.participants.find(entry => entry.userId === userId)

  if (!participant) {
    throw new Error('You are not part of this match.')
  }

  const state = normalizeTicTacToeState(
    match.state,
    match.participants.map(entry => ({
      userId: entry.userId,
      seatIndex: entry.seatIndex,
    }))
  )

  if (match.status === 'FINISHED' || state.winnerUserId || state.isDraw) {
    throw new Error('This match is already finished.')
  }

  if (state.currentTurnUserId !== userId) {
    throw new Error('It is not your turn yet.')
  }

  if (state.board[cellIndex]) {
    throw new Error('That cell is already taken.')
  }

  const playerMark = state.marksByUserId[userId]

  if (!playerMark) {
    throw new Error('Could not resolve your TicTacToe marker.')
  }

  const nextBoard = [...state.board]
  nextBoard[cellIndex] = playerMark

  const winningLine = findWinningLine(nextBoard)
  const winnerUserId = winningLine ? userId : null
  const isDraw = !winnerUserId && nextBoard.every(Boolean)
  const nextTurnUserId =
    winnerUserId || isDraw
      ? null
      : match.participants.find(entry => entry.userId !== userId)?.userId || null

  const nextState: TicTacToeMatchState = {
    board: nextBoard,
    marksByUserId: state.marksByUserId,
    currentTurnUserId: nextTurnUserId,
    winnerUserId,
    winningLine,
    isDraw,
    lastMoveAt: new Date().toISOString(),
    lastMoveByUserId: userId,
    rematchRequestedUserIds: [],
    rematchStartedAt: state.rematchStartedAt,
  }

  const updatedMatch = await prisma.match.update({
    where: { id: matchId },
    data: {
      state: nextState,
      status: winnerUserId || isDraw ? 'FINISHED' : 'ACTIVE',
      finishedAt: winnerUserId || isDraw ? new Date() : null,
    },
    include: {
      participants: {
        orderBy: {
          seatIndex: 'asc',
        },
        include: {
          user: {
            select: {
              id: true,
              inGameName: true,
              tag: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  })

  return serializeMatch(updatedMatch)
}

export async function requestTicTacToeRematch(matchId: string, userId: string) {
  const match = await findMatchById(matchId)

  if (!match) {
    throw new Error('Match not found.')
  }

  if (match.gameKey !== 'TICTACTOE') {
    throw new Error('This rematch endpoint only supports TicTacToe matches.')
  }

  if (!match.participants.some(entry => entry.userId === userId)) {
    throw new Error('You are not part of this match.')
  }

  const participants = match.participants.map(entry => ({
    userId: entry.userId,
    seatIndex: entry.seatIndex,
  }))
  const state = normalizeTicTacToeState(match.state, participants)

  if (!state.winnerUserId && !state.isDraw && match.status !== 'FINISHED') {
    throw new Error('Rematch is only available after the current game ends.')
  }

  if (state.rematchRequestedUserIds.includes(userId)) {
    throw new Error('You already requested a rematch.')
  }

  const rematchRequestedUserIds = [...state.rematchRequestedUserIds, userId]
  const everyoneReady = participants.every(player =>
    rematchRequestedUserIds.includes(player.userId)
  )
  const nextState = everyoneReady
    ? createRematchState(state, participants)
    : {
        ...state,
        rematchRequestedUserIds,
      }

  const updatedMatch = await prisma.match.update({
    where: { id: matchId },
    data: {
      state: nextState,
      status: everyoneReady ? 'ACTIVE' : match.status,
      startedAt: everyoneReady ? new Date() : match.startedAt,
      finishedAt: everyoneReady ? null : match.finishedAt,
    },
    include: {
      participants: {
        orderBy: {
          seatIndex: 'asc',
        },
        include: {
          user: {
            select: {
              id: true,
              inGameName: true,
              tag: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  })

  return serializeMatch(updatedMatch)
}
