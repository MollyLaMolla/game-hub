import { randomUUID } from 'node:crypto'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import {
  DEFAULT_GAME_KEY,
  DEFAULT_QUEUE_TYPE,
  getGameDefinition,
  type LobbyQueueTypeValue,
  type SupportedGameKey,
} from '@/lib/game-catalog'
import { LOBBY_INVITE_TTL_MS } from '@/lib/friends-shared'
import type { LobbyActionResponse } from '@/lib/lobbies-shared'
import {
  getActiveLobbySnapshotForUser,
  getLobbyMemberUserIds,
  getLobbySnapshotForUser,
  getOrCreateLobbySnapshot,
  joinLobby,
  kickLobbyMember,
  leaveLobbyAndReturnSnapshot,
  promoteLobbyMemberToOwner,
  returnLobbyToOpenState,
  setLobbyGame,
  setLobbyQueueType,
  stopLobbySearch,
  startLobby,
  touchActiveLobbyPresence,
} from '@/lib/lobbies'
import { getMatchSnapshot } from '@/lib/matches'
import { prisma } from '@/lib/prisma'
import { emitRealtimeToUser } from '@/lib/realtime-bridge.mjs'

const DEFAULT_AVATAR = '/images/profile_icons/fox.png'

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' } satisfies LobbyActionResponse, { status: 401 })
}

async function getCurrentUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

async function emitLobbyRealtime(lobbyId: string) {
  const memberIds = await getLobbyMemberUserIds(lobbyId)

  for (const memberId of memberIds) {
    const snapshot = await getLobbySnapshotForUser(memberId, lobbyId)

    if (!snapshot) {
      continue
    }

    emitRealtimeToUser(memberId, {
      type: 'lobby_updated',
      lobby: snapshot,
    })

    if (snapshot.currentMatchId) {
      const match = await getMatchSnapshot(snapshot.currentMatchId, memberId)
      emitRealtimeToUser(memberId, {
        type: 'match_ready',
        match,
      })
    }
  }
}

export async function GET() {
  const userId = await getCurrentUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const data = await getOrCreateLobbySnapshot(userId)
  return NextResponse.json({ data } satisfies LobbyActionResponse)
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const body = (await request.json().catch(() => null)) as {
    type?:
      | 'set-game'
      | 'set-queue-type'
      | 'touch-presence'
      | 'leave-lobby'
      | 'kick-member'
      | 'promote-member'
      | 'return-to-lobby'
      | 'stop-search'
      | 'start-lobby'
      | 'invite-friend'
      | 'join-lobby'
    gameKey?: SupportedGameKey
    queueType?: LobbyQueueTypeValue
    friendId?: string
    lobbyId?: string
    memberId?: string
  } | null

  if (!body?.type) {
    return NextResponse.json({ error: 'Invalid lobby request.' } satisfies LobbyActionResponse, {
      status: 400,
    })
  }

  try {
    switch (body.type) {
      case 'touch-presence': {
        const data = await touchActiveLobbyPresence(userId)
        return NextResponse.json({ data: data || undefined } satisfies LobbyActionResponse)
      }

      case 'set-game': {
        const result = await setLobbyGame(userId, body.gameKey || DEFAULT_GAME_KEY)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))
        return NextResponse.json({ data: result.snapshot } satisfies LobbyActionResponse)
      }

      case 'set-queue-type': {
        const result = await setLobbyQueueType(userId, body.queueType || DEFAULT_QUEUE_TYPE)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))
        return NextResponse.json({ data: result.snapshot } satisfies LobbyActionResponse)
      }

      case 'leave-lobby': {
        const previousLobbySnapshot = await getActiveLobbySnapshotForUser(userId)
        const leavingMember = previousLobbySnapshot?.members.find(
          member => member.member?.id === userId
        )
        const result = await leaveLobbyAndReturnSnapshot(userId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))

        if (previousLobbySnapshot && leavingMember?.member) {
          const remainingMemberIds = await getLobbyMemberUserIds(previousLobbySnapshot.id)

          for (const remainingMemberId of remainingMemberIds) {
            emitRealtimeToUser(remainingMemberId, {
              type: 'lobby_member_left',
              member: leavingMember.member,
            })
          }
        }

        return NextResponse.json({
          data: result.snapshot,
          message: 'You left the lobby.',
        } satisfies LobbyActionResponse)
      }

      case 'kick-member': {
        if (!body.memberId) {
          return NextResponse.json({ error: 'Missing member id.' } satisfies LobbyActionResponse, {
            status: 400,
          })
        }

        const previousLobbySnapshot = await getActiveLobbySnapshotForUser(userId)
        const kickedMember = previousLobbySnapshot?.members.find(
          member => member.member?.id === body.memberId
        )

        const result = await kickLobbyMember(userId, body.memberId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))

        if (previousLobbySnapshot && kickedMember?.member) {
          const remainingMemberIds = await getLobbyMemberUserIds(previousLobbySnapshot.id)

          for (const remainingMemberId of remainingMemberIds) {
            emitRealtimeToUser(remainingMemberId, {
              type: 'lobby_member_kicked',
              member: kickedMember.member,
            })
          }
        }

        const kickedMemberSnapshot = await getOrCreateLobbySnapshot(body.memberId)

        emitRealtimeToUser(body.memberId, {
          type: 'lobby_updated',
          lobby: kickedMemberSnapshot,
        })

        return NextResponse.json({
          data: result.snapshot,
          message: 'Party member removed.',
        } satisfies LobbyActionResponse)
      }

      case 'promote-member': {
        if (!body.memberId) {
          return NextResponse.json({ error: 'Missing member id.' } satisfies LobbyActionResponse, {
            status: 400,
          })
        }

        const result = await promoteLobbyMemberToOwner(userId, body.memberId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))

        emitRealtimeToUser(body.memberId, {
          type: 'lobby_member_promoted',
        })

        return NextResponse.json({
          data: result.snapshot,
          message: 'Party leadership updated.',
        } satisfies LobbyActionResponse)
      }

      case 'return-to-lobby': {
        const result = await returnLobbyToOpenState(userId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))
        return NextResponse.json({
          data: result.snapshot,
          message: 'Party returned to the lobby.',
        } satisfies LobbyActionResponse)
      }

      case 'stop-search': {
        const result = await stopLobbySearch(userId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))
        return NextResponse.json({
          data: result.snapshot,
          message: 'Matchmaking stopped.',
        } satisfies LobbyActionResponse)
      }

      case 'start-lobby': {
        const result = await startLobby(userId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))

        return NextResponse.json({
          data: result.snapshot,
          redirectPath: result.match
            ? `${result.match.gameRoute}?match=${encodeURIComponent(result.match.id)}`
            : undefined,
          message:
            result.snapshot.queueType === 'public' && !result.match
              ? 'Searching for an opponent...'
              : `${result.snapshot.gameName} is ready. Launching match...`,
        } satisfies LobbyActionResponse)
      }

      case 'join-lobby': {
        if (!body.lobbyId) {
          return NextResponse.json({ error: 'Missing lobby id.' } satisfies LobbyActionResponse, {
            status: 400,
          })
        }

        const result = await joinLobby(userId, body.lobbyId)

        await Promise.all(result.affectedLobbyIds.map(emitLobbyRealtime))
        return NextResponse.json({
          data: result.snapshot,
          message: 'You joined the party.',
        } satisfies LobbyActionResponse)
      }

      case 'invite-friend': {
        if (!body.friendId) {
          return NextResponse.json({ error: 'Missing friend id.' } satisfies LobbyActionResponse, {
            status: 400,
          })
        }

        const lobby = await getOrCreateLobbySnapshot(userId)

        if (!lobby.isOwner) {
          return NextResponse.json(
            { error: 'Only the lobby owner can send invites.' } satisfies LobbyActionResponse,
            { status: 400 }
          )
        }

        if (lobby.queueType !== 'private') {
          return NextResponse.json(
            {
              error: 'Friend invites are only available for private lobbies.',
            } satisfies LobbyActionResponse,
            { status: 400 }
          )
        }

        if (lobby.members.some(member => member.member?.id === body.friendId)) {
          return NextResponse.json(
            { error: 'This friend is already in your lobby.' } satisfies LobbyActionResponse,
            { status: 400 }
          )
        }

        if (lobby.members.filter(member => member.member).length >= lobby.partySize) {
          return NextResponse.json(
            { error: 'This private lobby is already full.' } satisfies LobbyActionResponse,
            { status: 400 }
          )
        }

        const friendship = await prisma.friendship.findUnique({
          where: {
            userId_friendId: {
              userId,
              friendId: body.friendId,
            },
          },
          select: { id: true },
        })

        if (!friendship) {
          return NextResponse.json(
            {
              error: 'You can only invite friends to a private lobby.',
            } satisfies LobbyActionResponse,
            { status: 400 }
          )
        }

        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            inGameName: true,
            tag: true,
            avatarUrl: true,
          },
        })

        if (!sender) {
          return NextResponse.json(
            { error: 'Current user not found.' } satisfies LobbyActionResponse,
            { status: 404 }
          )
        }

        const game = getGameDefinition(lobby.gameKey)

        emitRealtimeToUser(body.friendId, {
          type: 'lobby_invite',
          invite: {
            id: randomUUID(),
            from: {
              id: sender.id,
              inGameName: sender.inGameName || 'Player',
              tag: sender.tag || 'READY',
              avatarUrl: sender.avatarUrl || DEFAULT_AVATAR,
            },
            lobbyId: lobby.id,
            lobbyName: game.name,
            lobbyPath: '/games',
            gameKey: lobby.gameKey,
            expiresAt: new Date(Date.now() + LOBBY_INVITE_TTL_MS).toISOString(),
          },
        })

        return NextResponse.json({
          data: lobby,
          message: 'Lobby invite sent.',
        } satisfies LobbyActionResponse)
      }

      default:
        return NextResponse.json({ error: 'Unknown lobby action.' } satisfies LobbyActionResponse, {
          status: 400,
        })
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Lobby action failed.',
      } satisfies LobbyActionResponse,
      { status: 400 }
    )
  }
}
