import { prisma } from '@/lib/prisma'
import type { FriendIdentity, FriendRequestSummary, FriendsSidebarData } from './friends-shared'

const DEFAULT_AVATAR = '/images/profile_icons/fox.png'

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

function normalizeRequest(request: {
  id: string
  createdAt: Date
  user: {
    id: string
    inGameName: string | null
    tag: string | null
    avatarUrl: string | null
  }
}): FriendRequestSummary {
  return {
    id: request.id,
    createdAt: request.createdAt.toISOString(),
    user: normalizeIdentity(request.user),
  }
}

export function parsePlayerId(input: string) {
  const trimmed = input.trim()
  const separatorIndex = trimmed.lastIndexOf('#')

  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null
  }

  const inGameName = trimmed.slice(0, separatorIndex).trim()
  const tag = trimmed
    .slice(separatorIndex + 1)
    .trim()
    .toUpperCase()

  if (!inGameName || !tag || tag.length > 5 || !/^[A-Z0-9]+$/.test(tag)) {
    return null
  }

  return {
    inGameName,
    tag,
  }
}

export async function getFriendsSidebarData(userId: string): Promise<FriendsSidebarData> {
  const [self, friends, incomingRequests, outgoingRequests] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        inGameName: true,
        tag: true,
        avatarUrl: true,
      },
    }),
    prisma.friendship.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        friend: {
          select: {
            id: true,
            inGameName: true,
            tag: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.friendRequest.findMany({
      where: { receiverId: userId },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            inGameName: true,
            tag: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.friendRequest.findMany({
      where: { senderId: userId },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        receiver: {
          select: {
            id: true,
            inGameName: true,
            tag: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ])

  if (!self) {
    throw new Error('Current user not found while loading friends sidebar data.')
  }

  return {
    self: normalizeIdentity(self),
    friends: friends.map(entry => normalizeIdentity(entry.friend)),
    incomingRequests: incomingRequests.map(request =>
      normalizeRequest({
        id: request.id,
        createdAt: request.createdAt,
        user: request.sender,
      })
    ),
    outgoingRequests: outgoingRequests.map(request =>
      normalizeRequest({
        id: request.id,
        createdAt: request.createdAt,
        user: request.receiver,
      })
    ),
  }
}
