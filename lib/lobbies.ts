import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_GAME_KEY,
  DEFAULT_QUEUE_TYPE,
  getGameDefinition,
  getLobbyModeDefinition,
  type LobbyQueueTypeValue,
  type SupportedGameKey,
} from '@/lib/game-catalog'
import type { FriendIdentity } from '@/lib/friends-shared'
import type { LobbySnapshot, MatchSnapshot } from '@/lib/lobbies-shared'
import { cleanupInactiveLobbiesAndMatches, createMatchFromLobbies } from '@/lib/matches'

const DEFAULT_AVATAR = '/images/profile_icons/fox.png'
const PRISMA_GAME_KEY = {
  tictactoe: 'TICTACTOE',
} as const
const PRISMA_QUEUE_TYPE = {
  public: 'PUBLIC',
  private: 'PRIVATE',
} as const
const PRISMA_STATUS = {
  open: 'OPEN',
  searching: 'SEARCHING',
  inProgress: 'IN_PROGRESS',
} as const

type LobbyRecord = Awaited<ReturnType<typeof findLobbyById>>

type LobbyMemberRecord = NonNullable<LobbyRecord>['members'][number]

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

function fromPrismaStatus(value: string): LobbySnapshot['status'] {
  if (value === PRISMA_STATUS.searching) {
    return 'searching'
  }

  if (value === PRISMA_STATUS.inProgress) {
    return 'in-progress'
  }

  return 'open'
}

function buildInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase()
}

function getOrderedLobbyMembers(members: LobbyMemberRecord[], ownerId: string) {
  return [...members].sort((left, right) => {
    if (left.userId === ownerId && right.userId !== ownerId) {
      return -1
    }

    if (right.userId === ownerId && left.userId !== ownerId) {
      return 1
    }

    if (left.slotIndex !== right.slotIndex) {
      return left.slotIndex - right.slotIndex
    }

    return left.joinedAt.getTime() - right.joinedAt.getTime()
  })
}

function getCompactSlotAssignments(members: LobbyMemberRecord[], ownerId: string) {
  return getOrderedLobbyMembers(members, ownerId).map((member, slotIndex) => ({
    memberId: member.id,
    slotIndex,
  }))
}

function lobbyNeedsSeatRepair(lobby: NonNullable<LobbyRecord>) {
  if (!lobby.members.length) {
    return false
  }

  const ownerMembership = lobby.members.find(member => member.userId === lobby.ownerId)

  if (!ownerMembership) {
    return true
  }

  const assignments = getCompactSlotAssignments(lobby.members, lobby.ownerId)

  return assignments.some(assignment => {
    const currentMember = lobby.members.find(member => member.id === assignment.memberId)
    return currentMember?.slotIndex !== assignment.slotIndex
  })
}

async function rebalanceLobbyMembers(
  lobbyId: string,
  members: LobbyMemberRecord[],
  ownerId: string,
  options?: {
    status?: (typeof PRISMA_STATUS)[keyof typeof PRISMA_STATUS]
  }
) {
  const assignments = getCompactSlotAssignments(members, ownerId)
  const updatedAt = new Date()

  await prisma.$transaction(async tx => {
    for (const assignment of assignments) {
      await tx.lobbyMember.update({
        where: { id: assignment.memberId },
        data: {
          slotIndex: assignment.slotIndex + 100,
        },
      })
    }

    for (const assignment of assignments) {
      await tx.lobbyMember.update({
        where: { id: assignment.memberId },
        data: {
          slotIndex: assignment.slotIndex,
        },
      })
    }

    await tx.lobby.update({
      where: { id: lobbyId },
      data: {
        ownerId,
        updatedAt,
        ...(options?.status ? { status: options.status } : {}),
      },
    })
  })
}

async function ensureLobbySeatIntegrity(lobby: NonNullable<LobbyRecord>) {
  if (!lobbyNeedsSeatRepair(lobby)) {
    return lobby
  }

  await rebalanceLobbyMembers(lobby.id, lobby.members, lobby.ownerId)

  const repairedLobby = await findLobbyById(lobby.id)

  if (!repairedLobby) {
    throw new Error('Lobby not found after repairing member seats.')
  }

  return repairedLobby
}

async function findLobbyByIdWithIntegrity(lobbyId: string) {
  const lobby = await findLobbyById(lobbyId)

  if (!lobby) {
    return null
  }

  return ensureLobbySeatIntegrity(lobby)
}

async function findActiveLobbyForUserWithIntegrity(userId: string) {
  const lobby = await findActiveLobbyForUser(userId)

  if (!lobby) {
    return null
  }

  return ensureLobbySeatIntegrity(lobby)
}

async function findLobbyById(lobbyId: string) {
  return prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      owner: {
        select: {
          id: true,
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      },
      members: {
        orderBy: [{ slotIndex: 'asc' }, { joinedAt: 'asc' }],
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

async function findActiveLobbyForUser(userId: string) {
  return prisma.lobby.findFirst({
    where: {
      members: {
        some: {
          userId,
        },
      },
      status: {
        in: [PRISMA_STATUS.open, PRISMA_STATUS.searching, PRISMA_STATUS.inProgress],
      },
    },
    include: {
      owner: {
        select: {
          id: true,
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      },
      members: {
        orderBy: [{ slotIndex: 'asc' }, { joinedAt: 'asc' }],
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

function serializeLobby(lobby: NonNullable<LobbyRecord>, currentUserId: string): LobbySnapshot {
  const gameKey = fromPrismaGameKey(lobby.gameKey)
  const queueType = fromPrismaQueueType(lobby.queueType)
  const game = getGameDefinition(gameKey)
  const mode = getLobbyModeDefinition(gameKey, queueType)
  const memberMap = new Map(
    lobby.members.map(entry => [entry.slotIndex, normalizeIdentity(entry.user)])
  )
  const status = fromPrismaStatus(lobby.status)

  return {
    id: lobby.id,
    ownerId: lobby.ownerId,
    inviteCode: lobby.inviteCode,
    status,
    updatedAt: lobby.updatedAt.toISOString(),
    queueType,
    gameKey,
    gameName: game.name,
    gameRoute: game.route,
    gameTagline: game.tagline,
    queueLabel: mode.label,
    queueDescription: mode.description,
    partySize: lobby.partySize,
    totalPlayers: lobby.totalPlayers,
    teamCount: lobby.teamCount,
    teamSize: lobby.teamSize,
    isOwner: lobby.ownerId === currentUserId,
    canInviteFriends:
      queueType === 'private' && lobby.ownerId === currentUserId && status === 'open',
    canStart:
      lobby.ownerId === currentUserId &&
      lobby.members.length === lobby.partySize &&
      status !== 'in-progress',
    currentMatchId: lobby.currentMatchId,
    members: Array.from({ length: lobby.partySize }, (_, slotIndex) => ({
      slotIndex,
      member: memberMap.get(slotIndex) || null,
    })),
  }
}

async function createLobby(
  userId: string,
  gameKey: SupportedGameKey,
  queueType: LobbyQueueTypeValue
) {
  const mode = getLobbyModeDefinition(gameKey, queueType)
  const createdLobby = await prisma.lobby.create({
    data: {
      ownerId: userId,
      gameKey: PRISMA_GAME_KEY[gameKey],
      queueType: PRISMA_QUEUE_TYPE[queueType],
      inviteCode: buildInviteCode(),
      partySize: mode.partySize,
      totalPlayers: mode.totalPlayers,
      teamCount: mode.teamCount,
      teamSize: mode.teamSize,
      members: {
        create: {
          userId,
          slotIndex: 0,
        },
      },
    },
  })

  const hydratedLobby = await findLobbyById(createdLobby.id)

  if (!hydratedLobby) {
    throw new Error('Lobby creation failed.')
  }

  return hydratedLobby
}

async function removeMembershipAndTransferOwnership(
  activeLobby: NonNullable<LobbyRecord>,
  userId: string
) {
  const membership = activeLobby.members.find(entry => entry.userId === userId)

  if (!membership) {
    return [] as string[]
  }

  if (activeLobby.members.length === 1) {
    await prisma.lobby.delete({ where: { id: activeLobby.id } })
    return [activeLobby.id]
  }

  const remainingMembers = activeLobby.members.filter(entry => entry.userId !== userId)
  const nextOwnerId =
    userId === activeLobby.ownerId
      ? remainingMembers[0]?.userId || activeLobby.ownerId
      : activeLobby.ownerId

  await prisma.lobbyMember.delete({ where: { id: membership.id } })

  await rebalanceLobbyMembers(activeLobby.id, remainingMembers, nextOwnerId, {
    status:
      activeLobby.status === PRISMA_STATUS.searching ? PRISMA_STATUS.open : activeLobby.status,
  })

  return [activeLobby.id]
}

async function clearUserActiveLobby(userId: string) {
  const activeLobby = await findActiveLobbyForUser(userId)

  if (!activeLobby) {
    return [] as string[]
  }

  return removeMembershipAndTransferOwnership(activeLobby, userId)
}

async function collectPublicMatchLobbies(baseLobby: NonNullable<LobbyRecord>) {
  const candidates = await prisma.lobby.findMany({
    where: {
      id: {
        not: baseLobby.id,
      },
      gameKey: baseLobby.gameKey,
      queueType: PRISMA_QUEUE_TYPE.public,
      status: PRISMA_STATUS.searching,
      currentMatchId: null,
    },
    orderBy: {
      updatedAt: 'asc',
    },
    include: {
      owner: {
        select: {
          id: true,
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      },
      members: {
        orderBy: [{ slotIndex: 'asc' }, { joinedAt: 'asc' }],
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

  const selectedLobbies = [baseLobby]
  let selectedPlayers = baseLobby.members.length

  for (const candidate of candidates) {
    if (selectedPlayers + candidate.members.length > baseLobby.totalPlayers) {
      continue
    }

    selectedLobbies.push(candidate)
    selectedPlayers += candidate.members.length

    if (selectedPlayers === baseLobby.totalPlayers) {
      return selectedLobbies
    }
  }

  return null
}

export async function getLobbySnapshotForUser(userId: string, lobbyId: string) {
  const lobby = await findLobbyByIdWithIntegrity(lobbyId)

  if (!lobby || !lobby.members.some(entry => entry.userId === userId)) {
    return null
  }

  return serializeLobby(lobby, userId)
}

export async function getLobbyMemberUserIds(lobbyId: string) {
  const members = await prisma.lobbyMember.findMany({
    where: { lobbyId },
    select: { userId: true },
  })

  return members.map(member => member.userId)
}

export async function getOrCreateLobbySnapshot(userId: string) {
  await cleanupInactiveLobbiesAndMatches()

  const activeLobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (activeLobby) {
    await prisma.lobbyMember.updateMany({
      where: {
        lobbyId: activeLobby.id,
        userId,
      },
      data: {
        lastSeenAt: new Date(),
      },
    })

    const refreshedLobby = await findLobbyByIdWithIntegrity(activeLobby.id)

    if (!refreshedLobby) {
      throw new Error('Lobby not found after refreshing presence.')
    }

    return serializeLobby(refreshedLobby, userId)
  }

  const createdLobby = await createLobby(userId, DEFAULT_GAME_KEY, DEFAULT_QUEUE_TYPE)
  return serializeLobby(createdLobby, userId)
}

export async function touchActiveLobbyPresence(userId: string) {
  const activeLobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (!activeLobby) {
    return null
  }

  await prisma.lobbyMember.updateMany({
    where: {
      lobbyId: activeLobby.id,
      userId,
    },
    data: {
      lastSeenAt: new Date(),
    },
  })

  const refreshedLobby = await findLobbyByIdWithIntegrity(activeLobby.id)

  if (!refreshedLobby) {
    throw new Error('Lobby not found after refreshing presence.')
  }

  return serializeLobby(refreshedLobby, userId)
}

export async function setLobbyQueueType(userId: string, queueType: LobbyQueueTypeValue) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (!lobby || lobby.ownerId !== userId) {
    throw new Error('Only the lobby owner can change the lobby type.')
  }

  if (lobby.status === PRISMA_STATUS.inProgress) {
    throw new Error('You cannot change queue type while the lobby is in a match.')
  }

  const gameKey = fromPrismaGameKey(lobby.gameKey)
  const mode = getLobbyModeDefinition(gameKey, queueType)

  if (lobby.members.length > mode.partySize) {
    throw new Error('Remove extra party members before switching to this lobby type.')
  }

  await prisma.lobby.update({
    where: { id: lobby.id },
    data: {
      queueType: PRISMA_QUEUE_TYPE[queueType],
      partySize: mode.partySize,
      totalPlayers: mode.totalPlayers,
      teamCount: mode.teamCount,
      teamSize: mode.teamSize,
      status: PRISMA_STATUS.open,
      startedAt: null,
      currentMatchId: null,
    },
  })

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Lobby not found after updating queue type.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, userId),
    affectedLobbyIds: [updatedLobby.id],
  }
}

export async function setLobbyGame(userId: string, gameKey: SupportedGameKey) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (!lobby || lobby.ownerId !== userId) {
    throw new Error('Only the lobby owner can change the selected game.')
  }

  if (lobby.status === PRISMA_STATUS.inProgress) {
    throw new Error('You cannot change game while the lobby is in a match.')
  }

  const queueType = fromPrismaQueueType(lobby.queueType)
  const mode = getLobbyModeDefinition(gameKey, queueType)

  if (lobby.members.length > mode.partySize) {
    throw new Error('This game mode requires fewer party slots than your current lobby uses.')
  }

  await prisma.lobby.update({
    where: { id: lobby.id },
    data: {
      gameKey: PRISMA_GAME_KEY[gameKey],
      partySize: mode.partySize,
      totalPlayers: mode.totalPlayers,
      teamCount: mode.teamCount,
      teamSize: mode.teamSize,
      status: PRISMA_STATUS.open,
      startedAt: null,
      currentMatchId: null,
    },
  })

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Lobby not found after updating game.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, userId),
    affectedLobbyIds: [updatedLobby.id],
  }
}

export async function leaveLobbyAndReturnSnapshot(userId: string) {
  const affectedLobbyIds = await clearUserActiveLobby(userId)
  const snapshot = await getOrCreateLobbySnapshot(userId)

  return {
    snapshot,
    affectedLobbyIds: [...new Set([...affectedLobbyIds, snapshot.id])],
  }
}

export async function startLobby(userId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (!lobby || lobby.ownerId !== userId) {
    throw new Error('Only the lobby owner can start the match.')
  }

  if (lobby.members.length < lobby.partySize) {
    throw new Error('Fill every lobby slot before starting.')
  }

  const queueType = fromPrismaQueueType(lobby.queueType)

  if (queueType === 'private') {
    const match = await createMatchFromLobbies([
      {
        id: lobby.id,
        gameKey: lobby.gameKey,
        queueType: lobby.queueType,
        totalPlayers: lobby.totalPlayers,
        members: lobby.members.map(member => ({
          userId: member.userId,
        })),
      },
    ])

    const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

    if (!updatedLobby) {
      throw new Error('Lobby not found after starting.')
    }

    return {
      snapshot: serializeLobby(updatedLobby, userId),
      affectedLobbyIds: [updatedLobby.id],
      match,
    }
  }

  await prisma.lobby.update({
    where: { id: lobby.id },
    data: {
      status: PRISMA_STATUS.searching,
      updatedAt: new Date(),
    },
  })

  const searchingLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!searchingLobby) {
    throw new Error('Lobby not found after entering matchmaking.')
  }

  const matchedLobbies = await collectPublicMatchLobbies(searchingLobby)

  if (!matchedLobbies) {
    return {
      snapshot: serializeLobby(searchingLobby, userId),
      affectedLobbyIds: [searchingLobby.id],
      match: null,
    }
  }

  const match = await createMatchFromLobbies(
    matchedLobbies.map(candidate => ({
      id: candidate.id,
      gameKey: candidate.gameKey,
      queueType: candidate.queueType,
      totalPlayers: candidate.totalPlayers,
      members: candidate.members.map(member => ({
        userId: member.userId,
      })),
    }))
  )

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Lobby not found after creating the public match.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, userId),
    affectedLobbyIds: matchedLobbies.map(candidate => candidate.id),
    match,
  }
}

export async function returnLobbyToOpenState(userId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (!lobby) {
    throw new Error('No active lobby found for this user.')
  }

  if (lobby.ownerId !== userId) {
    throw new Error('Only the lobby leader can return the party to the lobby.')
  }

  if (!lobby.currentMatchId || lobby.status !== PRISMA_STATUS.inProgress) {
    throw new Error('This lobby is not currently inside a match.')
  }

  const match = await prisma.match.findUnique({
    where: { id: lobby.currentMatchId },
    select: { status: true },
  })

  if (!match || match.status !== 'FINISHED') {
    throw new Error('The party can return to the lobby only after the match has finished.')
  }

  await prisma.lobby.update({
    where: { id: lobby.id },
    data: {
      status: PRISMA_STATUS.open,
      currentMatchId: null,
      startedAt: null,
      updatedAt: new Date(),
    },
  })

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Unable to load the lobby after returning from the match.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, userId),
    affectedLobbyIds: [updatedLobby.id],
  }
}

export async function stopLobbySearch(userId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)

  if (!lobby || lobby.ownerId !== userId) {
    throw new Error('Only the lobby owner can stop matchmaking.')
  }

  if (fromPrismaQueueType(lobby.queueType) !== 'public') {
    throw new Error('Only public queues can be stopped.')
  }

  if (lobby.status !== PRISMA_STATUS.searching) {
    throw new Error('This lobby is not currently searching for a match.')
  }

  await prisma.lobby.update({
    where: { id: lobby.id },
    data: {
      status: PRISMA_STATUS.open,
      updatedAt: new Date(),
    },
  })

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Lobby not found after stopping matchmaking.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, userId),
    affectedLobbyIds: [updatedLobby.id],
  }
}

export async function joinLobby(userId: string, lobbyId: string) {
  const targetLobby = await findLobbyByIdWithIntegrity(lobbyId)

  if (!targetLobby || targetLobby.status !== PRISMA_STATUS.open) {
    throw new Error('The selected lobby is no longer available.')
  }

  if (fromPrismaQueueType(targetLobby.queueType) !== 'private') {
    throw new Error('Only private lobbies can be joined through friend invites.')
  }

  if (targetLobby.members.some(entry => entry.userId === userId)) {
    return {
      snapshot: serializeLobby(targetLobby, userId),
      affectedLobbyIds: [targetLobby.id],
    }
  }

  if (targetLobby.members.length >= targetLobby.partySize) {
    throw new Error('This lobby is already full.')
  }

  const previousLobbyIds = await clearUserActiveLobby(userId)
  const refreshedLobby = await findLobbyByIdWithIntegrity(lobbyId)

  if (!refreshedLobby || refreshedLobby.status !== PRISMA_STATUS.open) {
    throw new Error('The selected lobby closed before you could join it.')
  }

  const usedSlots = new Set(refreshedLobby.members.map(entry => entry.slotIndex))
  const nextSlotIndex = Array.from({ length: refreshedLobby.partySize }, (_, index) => index).find(
    slotIndex => !usedSlots.has(slotIndex)
  )

  if (nextSlotIndex === undefined) {
    throw new Error('This lobby has no free slots left.')
  }

  await prisma.$transaction([
    prisma.lobbyMember.create({
      data: {
        lobbyId,
        userId,
        slotIndex: nextSlotIndex,
      },
    }),
    prisma.lobby.update({
      where: { id: lobbyId },
      data: { updatedAt: new Date() },
    }),
  ])

  const joinedLobby = await findLobbyByIdWithIntegrity(lobbyId)

  if (!joinedLobby) {
    throw new Error('Unable to load the joined lobby.')
  }

  return {
    snapshot: serializeLobby(joinedLobby, userId),
    affectedLobbyIds: [...new Set([...previousLobbyIds, joinedLobby.id])],
  }
}

export async function getLobbyCurrentMatchId(userId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)
  return lobby?.currentMatchId || null
}

export async function getActiveLobbySnapshotForUser(userId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(userId)
  return lobby ? serializeLobby(lobby, userId) : null
}

export async function kickLobbyMember(ownerUserId: string, memberUserId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(ownerUserId)

  if (!lobby || lobby.ownerId !== ownerUserId) {
    throw new Error('Only the lobby owner can remove party members.')
  }

  if (lobby.status !== PRISMA_STATUS.open) {
    throw new Error('Party members can only be managed while the lobby is open.')
  }

  if (memberUserId === ownerUserId) {
    throw new Error('Use Leave lobby to exit your own party.')
  }

  const targetMember = lobby.members.find(member => member.userId === memberUserId)

  if (!targetMember) {
    throw new Error('Party member not found.')
  }

  await prisma.lobbyMember.delete({ where: { id: targetMember.id } })

  await rebalanceLobbyMembers(
    lobby.id,
    lobby.members.filter(member => member.userId !== memberUserId),
    lobby.ownerId
  )

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Unable to load the lobby after removing the member.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, ownerUserId),
    affectedLobbyIds: [updatedLobby.id],
  }
}

export async function promoteLobbyMemberToOwner(ownerUserId: string, memberUserId: string) {
  const lobby = await findActiveLobbyForUserWithIntegrity(ownerUserId)

  if (!lobby || lobby.ownerId !== ownerUserId) {
    throw new Error('Only the lobby owner can promote another member.')
  }

  if (lobby.status !== PRISMA_STATUS.open) {
    throw new Error('Party members can only be managed while the lobby is open.')
  }

  if (memberUserId === ownerUserId) {
    throw new Error('This member is already the party leader.')
  }

  const targetMember = lobby.members.find(member => member.userId === memberUserId)

  if (!targetMember) {
    throw new Error('Party member not found.')
  }

  await rebalanceLobbyMembers(lobby.id, lobby.members, memberUserId)

  const updatedLobby = await findLobbyByIdWithIntegrity(lobby.id)

  if (!updatedLobby) {
    throw new Error('Unable to load the lobby after promoting the new leader.')
  }

  return {
    snapshot: serializeLobby(updatedLobby, ownerUserId),
    affectedLobbyIds: [updatedLobby.id],
  }
}

export type LobbyMutationResult = {
  snapshot: LobbySnapshot
  affectedLobbyIds: string[]
  match?: MatchSnapshot | null
}
