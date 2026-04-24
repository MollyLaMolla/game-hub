import { randomUUID } from 'node:crypto'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getFriendsSidebarData, parsePlayerId } from '@/lib/friends'
import { prisma } from '@/lib/prisma'
import { emitRealtimeToUser } from '@/lib/realtime-bridge.mjs'

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

async function getCurrentUserId() {
  const session = await getServerSession(authOptions)

  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getCurrentUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const data = await getFriendsSidebarData(userId)
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const body = (await request.json().catch(() => null)) as {
    type?:
      | 'send-request'
      | 'accept-request'
      | 'decline-request'
      | 'cancel-request'
      | 'remove-friend'
    playerId?: string
    requestId?: string
    friendId?: string
  } | null

  if (!body?.type) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  switch (body.type) {
    case 'send-request': {
      const parsed = parsePlayerId(body.playerId ?? '')

      if (!parsed) {
        return NextResponse.json({ error: 'Use the format player123#ABCDE.' }, { status: 400 })
      }

      const targetUser = await prisma.user.findFirst({
        where: {
          inGameName: parsed.inGameName,
          tag: parsed.tag,
        },
        select: {
          id: true,
        },
      })

      if (!targetUser) {
        return NextResponse.json({ error: 'Player not found.' }, { status: 404 })
      }

      if (targetUser.id === userId) {
        return NextResponse.json(
          { error: 'You cannot send a friend request to yourself.' },
          { status: 400 }
        )
      }

      const [existingFriendship, outgoingRequest, incomingRequest] = await Promise.all([
        prisma.friendship.findUnique({
          where: {
            userId_friendId: {
              userId,
              friendId: targetUser.id,
            },
          },
          select: { id: true },
        }),
        prisma.friendRequest.findUnique({
          where: {
            senderId_receiverId: {
              senderId: userId,
              receiverId: targetUser.id,
            },
          },
          select: { id: true },
        }),
        prisma.friendRequest.findUnique({
          where: {
            senderId_receiverId: {
              senderId: targetUser.id,
              receiverId: userId,
            },
          },
          select: { id: true },
        }),
      ])

      if (existingFriendship) {
        return NextResponse.json({ error: 'This player is already your friend.' }, { status: 400 })
      }

      if (outgoingRequest) {
        return NextResponse.json({ error: 'Friend request already sent.' }, { status: 400 })
      }

      if (incomingRequest) {
        await prisma.$transaction([
          prisma.friendRequest.delete({ where: { id: incomingRequest.id } }),
          prisma.friendRequest.deleteMany({
            where: {
              OR: [
                { senderId: userId, receiverId: targetUser.id },
                { senderId: targetUser.id, receiverId: userId },
              ],
            },
          }),
          prisma.friendship.createMany({
            data: [
              { userId, friendId: targetUser.id },
              { userId: targetUser.id, friendId: userId },
            ],
            skipDuplicates: true,
          }),
        ])

        const currentUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            inGameName: true,
            tag: true,
            avatarUrl: true,
          },
        })

        if (currentUser) {
          emitRealtimeToUser(targetUser.id, {
            type: 'friends_updated',
            update: {
              reason: 'friend-added',
              friend: {
                id: currentUser.id,
                inGameName: currentUser.inGameName || 'Player',
                tag: currentUser.tag || 'READY',
                avatarUrl: currentUser.avatarUrl || '/images/profile_icons/fox.png',
              },
            },
          })
        }

        const data = await getFriendsSidebarData(userId)
        return NextResponse.json({ data, message: 'Friend request accepted automatically.' })
      }

      await prisma.friendRequest.create({
        data: {
          senderId: userId,
          receiverId: targetUser.id,
        },
      })

      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      })

      if (sender) {
        emitRealtimeToUser(targetUser.id, {
          type: 'friend_request_received',
          request: {
            id: randomUUID(),
            from: {
              id: sender.id,
              inGameName: sender.inGameName || 'Player',
              tag: sender.tag || 'READY',
              avatarUrl: sender.avatarUrl || '/images/profile_icons/fox.png',
            },
          },
        })
      }

      const data = await getFriendsSidebarData(userId)
      return NextResponse.json({ data, message: 'Friend request sent.' })
    }

    case 'accept-request': {
      if (!body.requestId) {
        return NextResponse.json({ error: 'Missing request id.' }, { status: 400 })
      }

      const friendRequest = await prisma.friendRequest.findFirst({
        where: {
          id: body.requestId,
          receiverId: userId,
        },
        select: {
          id: true,
          senderId: true,
        },
      })

      if (!friendRequest) {
        return NextResponse.json({ error: 'Friend request not found.' }, { status: 404 })
      }

      await prisma.$transaction([
        prisma.friendRequest.delete({ where: { id: friendRequest.id } }),
        prisma.friendRequest.deleteMany({
          where: {
            OR: [
              { senderId: userId, receiverId: friendRequest.senderId },
              { senderId: friendRequest.senderId, receiverId: userId },
            ],
          },
        }),
        prisma.friendship.createMany({
          data: [
            { userId, friendId: friendRequest.senderId },
            { userId: friendRequest.senderId, friendId: userId },
          ],
          skipDuplicates: true,
        }),
      ])

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      })

      if (currentUser) {
        emitRealtimeToUser(friendRequest.senderId, {
          type: 'friends_updated',
          update: {
            reason: 'friend-added',
            friend: {
              id: currentUser.id,
              inGameName: currentUser.inGameName || 'Player',
              tag: currentUser.tag || 'READY',
              avatarUrl: currentUser.avatarUrl || '/images/profile_icons/fox.png',
            },
          },
        })
      }

      const data = await getFriendsSidebarData(userId)
      return NextResponse.json({ data, message: 'Friend added.' })
    }

    case 'decline-request': {
      if (!body.requestId) {
        return NextResponse.json({ error: 'Missing request id.' }, { status: 400 })
      }

      await prisma.friendRequest.deleteMany({
        where: {
          id: body.requestId,
          receiverId: userId,
        },
      })

      const data = await getFriendsSidebarData(userId)
      return NextResponse.json({ data, message: 'Friend request declined.' })
    }

    case 'cancel-request': {
      if (!body.requestId) {
        return NextResponse.json({ error: 'Missing request id.' }, { status: 400 })
      }

      await prisma.friendRequest.deleteMany({
        where: {
          id: body.requestId,
          senderId: userId,
        },
      })

      const data = await getFriendsSidebarData(userId)
      return NextResponse.json({ data, message: 'Friend request canceled.' })
    }

    case 'remove-friend': {
      if (!body.friendId) {
        return NextResponse.json({ error: 'Missing friend id.' }, { status: 400 })
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      })

      await prisma.$transaction([
        prisma.friendship.deleteMany({
          where: {
            OR: [
              { userId, friendId: body.friendId },
              { userId: body.friendId, friendId: userId },
            ],
          },
        }),
        prisma.friendRequest.deleteMany({
          where: {
            OR: [
              { senderId: userId, receiverId: body.friendId },
              { senderId: body.friendId, receiverId: userId },
            ],
          },
        }),
      ])

      if (currentUser) {
        emitRealtimeToUser(body.friendId, {
          type: 'friends_updated',
          update: {
            reason: 'friend-removed',
            friend: {
              id: currentUser.id,
              inGameName: currentUser.inGameName || 'Player',
              tag: currentUser.tag || 'READY',
              avatarUrl: currentUser.avatarUrl || '/images/profile_icons/fox.png',
            },
          },
        })
      }

      const data = await getFriendsSidebarData(userId)
      return NextResponse.json({ data, message: 'Friend removed.' })
    }

    default:
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  }
}
