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
  lobbyId: string
  lobbyName: string
  lobbyPath: string
  gameKey: 'tictactoe'
  expiresAt: string
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

export type FriendsSidebarTab = 'requests' | 'friends' | 'search'

export const OPEN_FRIENDS_SIDEBAR_EVENT = 'gamehub:open-friends-sidebar'

export function buildPlayerId(inGameName: string, tag: string) {
  return `${inGameName}#${tag}`
}

const PENDING_INVITES_STORAGE_KEY = 'game-hub:pending-lobby-invites'

export const LOBBY_INVITE_TTL_MS = 5 * 60 * 1000

function isSameLobbyInvite(left: LobbyInviteSummary, right: LobbyInviteSummary) {
  return (
    left.from.id === right.from.id &&
    left.gameKey === right.gameKey &&
    left.lobbyId === right.lobbyId
  )
}

export function isLobbyInviteExpired(invite: LobbyInviteSummary) {
  return Number.isNaN(Date.parse(invite.expiresAt)) || Date.parse(invite.expiresAt) <= Date.now()
}

function normalizePendingLobbyInvites(invites: LobbyInviteSummary[]) {
  return invites.filter(invite => !isLobbyInviteExpired(invite))
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function savePendingLobbyInvite(invite: LobbyInviteSummary) {
  if (!canUseStorage()) {
    return
  }

  const currentInvites = normalizePendingLobbyInvites(readPendingLobbyInvites())
  const nextInvites = currentInvites.filter(entry => !isSameLobbyInvite(entry, invite))
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
    const normalizedInvites = Array.isArray(parsed) ? normalizePendingLobbyInvites(parsed) : []
    window.sessionStorage.setItem(PENDING_INVITES_STORAGE_KEY, JSON.stringify(normalizedInvites))
    return normalizedInvites
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
