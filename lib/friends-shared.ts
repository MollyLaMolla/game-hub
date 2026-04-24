export type FriendIdentity = {
  id: string
  inGameName: string
  tag: string
  avatarUrl: string
}

export type FriendRequestSummary = {
  id: string
  user: FriendIdentity
  createdAt: string
}

export type LobbyInviteSummary = {
  id: string
  from: FriendIdentity
  lobbyName: string
  lobbyPath: string
  gameKey: 'tictactoe'
}

export type FriendRequestRealtimeNotice = {
  id: string
  from: FriendIdentity
}

export type FriendsUpdatedRealtimeNotice = {
  reason: 'friend-added' | 'friend-removed'
  friend: FriendIdentity
}

export type FriendsSidebarData = {
  self: FriendIdentity
  friends: FriendIdentity[]
  incomingRequests: FriendRequestSummary[]
  outgoingRequests: FriendRequestSummary[]
}

export function buildPlayerId(inGameName: string, tag: string) {
  return `${inGameName}#${tag}`
}

const PENDING_INVITES_STORAGE_KEY = 'game-hub:pending-lobby-invites'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function savePendingLobbyInvite(invite: LobbyInviteSummary) {
  if (!canUseStorage()) {
    return
  }

  const currentInvites = readPendingLobbyInvites()
  const nextInvites = currentInvites.filter(entry => entry.id !== invite.id)
  nextInvites.unshift(invite)
  window.sessionStorage.setItem(PENDING_INVITES_STORAGE_KEY, JSON.stringify(nextInvites))
}

export function readPendingLobbyInvites(): LobbyInviteSummary[] {
  if (!canUseStorage()) {
    return []
  }

  const rawValue = window.sessionStorage.getItem(PENDING_INVITES_STORAGE_KEY)

  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue) as LobbyInviteSummary[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function readPendingLobbyInvite(inviteId: string) {
  return readPendingLobbyInvites().find(invite => invite.id === inviteId) || null
}

export function removePendingLobbyInvite(inviteId: string) {
  if (!canUseStorage()) {
    return
  }

  const nextInvites = readPendingLobbyInvites().filter(invite => invite.id !== inviteId)
  window.sessionStorage.setItem(PENDING_INVITES_STORAGE_KEY, JSON.stringify(nextInvites))
}
