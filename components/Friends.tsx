'use client'

import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineClipboardDocument,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { RiMore2Fill, RiTeamLine, RiUserAddLine } from 'react-icons/ri'
import {
  buildPlayerId,
  type FriendRequestRealtimeNotice,
  type FriendIdentity,
  type FriendsUpdatedRealtimeNotice,
  type FriendsSidebarData,
  type LobbyInviteSummary,
  readPendingLobbyInvites,
  removePendingLobbyInvite,
  savePendingLobbyInvite,
} from '@/lib/friends-shared'

type FriendsActionResponse = {
  data?: FriendsSidebarData
  error?: string
  message?: string
}

type RealtimeMessage =
  | { type: 'presence'; onlineUserIds: string[] }
  | { type: 'lobby_invite'; invite: LobbyInviteSummary }
  | { type: 'friend_request_received'; request: FriendRequestRealtimeNotice }
  | { type: 'friends_updated'; update: FriendsUpdatedRealtimeNotice }

type FriendsTab = 'requests' | 'friends' | 'search'

const SIDEBAR_TRANSITION_MS = 240

export default function Friends({ inGameName, tag }: { inGameName: string; tag: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const websocketRef = useRef<WebSocket | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const hasConnectedRealtimeRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSidebarVisible, setIsSidebarVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<FriendsTab>('requests')
  const [searchValue, setSearchValue] = useState('')
  const [friendsData, setFriendsData] = useState<FriendsSidebarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [realtimeError, setRealtimeError] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [actionMenuFriendId, setActionMenuFriendId] = useState<string | null>(null)
  const [lobbyInvites, setLobbyInvites] = useState<LobbyInviteSummary[]>([])

  const canInviteToLobby = pathname === '/TicTacToe'
  const ownPlayerId = buildPlayerId(inGameName, tag)
  const incomingRequests = friendsData?.incomingRequests || []
  const outgoingRequests = friendsData?.outgoingRequests || []
  const friends = friendsData?.friends || []
  const pendingRequestCount = incomingRequests.length + outgoingRequests.length

  async function refreshFriendsData() {
    const response = await fetch('/api/friends', {
      credentials: 'same-origin',
    })
    const payload = (await response.json()) as FriendsActionResponse

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load friends.')
    }

    setFriendsData(payload.data || null)
  }

  useEffect(() => {
    let ignore = false

    async function loadFriends() {
      setLoading(true)
      setError(null)

      try {
        await refreshFriendsData()

        if (!ignore) {
          setLobbyInvites(readPendingLobbyInvites())
        }
      } catch (caughtError) {
        if (!ignore) {
          setError(caughtError instanceof Error ? caughtError.message : 'Unable to load friends.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadFriends()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    let disposed = false

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimerRef.current) {
        return
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connectRealtime()
      }, 1500)
    }

    function connectRealtime() {
      if (disposed) {
        return
      }

      const websocket = new WebSocket(`${protocol}://${window.location.host}/ws`)
      websocketRef.current = websocket
      let opened = false
      let intentionallyClosed = false

      websocket.onopen = () => {
        opened = true
        hasConnectedRealtimeRef.current = true
        setRealtimeError(null)
      }

      websocket.onmessage = event => {
        const message = JSON.parse(event.data) as RealtimeMessage

        if (message.type === 'presence') {
          setRealtimeError(null)
          setOnlineUserIds(message.onlineUserIds)
          return
        }

        if (message.type === 'friend_request_received') {
          void refreshFriendsData()
            .then(() => {
              openSidebar('requests')
              setFeedbackMessage(
                `${buildPlayerId(message.request.from.inGameName, message.request.from.tag)} sent you a friend request.`
              )
            })
            .catch(() => {
              setError('Unable to refresh friend requests right now.')
            })
          return
        }

        if (message.type === 'friends_updated') {
          void refreshFriendsData()
            .then(() => {
              openSidebar('friends')
              setFeedbackMessage(
                message.update.reason === 'friend-added'
                  ? `${buildPlayerId(message.update.friend.inGameName, message.update.friend.tag)} is now in your friends list.`
                  : `${buildPlayerId(message.update.friend.inGameName, message.update.friend.tag)} removed you from friends.`
              )
            })
            .catch(() => {
              setError('Unable to refresh friends right now.')
            })
          return
        }

        savePendingLobbyInvite(message.invite)
        setLobbyInvites(current => {
          const nextInvites = current.filter(invite => invite.id !== message.invite.id)
          return [message.invite, ...nextInvites]
        })
        openSidebar('requests')
        setFeedbackMessage(
          `${buildPlayerId(message.invite.from.inGameName, message.invite.from.tag)} invited you to ${message.invite.lobbyName}.`
        )
      }

      websocket.onerror = () => {
        if (!opened && !disposed) {
          setRealtimeError('Realtime connection unavailable right now.')
        }
      }

      websocket.onclose = () => {
        if (websocketRef.current === websocket) {
          websocketRef.current = null
        }

        if (disposed || intentionallyClosed) {
          return
        }

        setOnlineUserIds([])
        setRealtimeError(
          hasConnectedRealtimeRef.current
            ? 'Realtime connection lost.'
            : 'Realtime connection unavailable right now.'
        )
        scheduleReconnect()
      }

      const originalClose = websocket.close.bind(websocket)
      websocket.close = (...args) => {
        intentionallyClosed = true
        return originalClose(...args)
      }
    }

    const initialConnectTimer = window.setTimeout(() => {
      connectRealtime()
    }, 0)

    return () => {
      disposed = true
      clearReconnectTimer()
      window.clearTimeout(initialConnectTimer)

      const websocket = websocketRef.current
      websocketRef.current = null

      if (
        websocket &&
        (websocket.readyState === WebSocket.CONNECTING || websocket.readyState === WebSocket.OPEN)
      ) {
        websocket.close()
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setIsSidebarVisible(true)
    })

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeSidebar()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  function openSidebar(tab?: FriendsTab) {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    if (tab) {
      setActiveTab(tab)
    }

    setIsOpen(true)
  }

  function closeSidebar() {
    setIsSidebarVisible(false)
    setActionMenuFriendId(null)

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false)
    }, SIDEBAR_TRANSITION_MS)
  }

  async function runAction(actionId: string, body: Record<string, string>, onSuccess?: () => void) {
    setBusyAction(actionId)
    setError(null)
    setFeedbackMessage(null)

    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })

      const payload = (await response.json()) as FriendsActionResponse

      if (!response.ok) {
        throw new Error(payload.error || 'Action failed.')
      }

      if (payload.data) {
        setFriendsData(payload.data)
      }

      if (payload.message) {
        setFeedbackMessage(payload.message)
      }

      onSuccess?.()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Action failed.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCopyOwnPlayerId() {
    try {
      await navigator.clipboard.writeText(ownPlayerId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  function sendLobbyInvite(friend: FriendIdentity) {
    if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
      setError('Realtime connection not ready yet.')
      return
    }

    websocketRef.current.send(
      JSON.stringify({
        type: 'invite_to_lobby',
        targetUserId: friend.id,
        gameKey: 'tictactoe',
      })
    )

    setFeedbackMessage(`Invite sent to ${buildPlayerId(friend.inGameName, friend.tag)}.`)
    setActionMenuFriendId(null)
  }

  function handleOpenLobbyInvite(invite: LobbyInviteSummary) {
    savePendingLobbyInvite(invite)
    closeSidebar()
    router.push(`${invite.lobbyPath}?autojoin=1&inviteId=${encodeURIComponent(invite.id)}`)
  }

  function dismissLobbyInvite(inviteId: string) {
    removePendingLobbyInvite(inviteId)
    setLobbyInvites(current => current.filter(invite => invite.id !== inviteId))
  }

  const tabs: Array<{ id: FriendsTab; label: string; count?: number }> = [
    {
      id: 'requests',
      label: 'Requests',
      count: pendingRequestCount + lobbyInvites.length,
    },
    {
      id: 'friends',
      label: 'Friends',
      count: friends.length,
    },
    {
      id: 'search',
      label: 'Search',
    },
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => openSidebar('requests')}
        className="relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white hover:text-orange-600"
      >
        <RiTeamLine className="h-4 w-4" />
        <span>Friends</span>
        {pendingRequestCount ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
            {pendingRequestCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close friends sidebar"
            onClick={closeSidebar}
            className={`fixed inset-0 z-70 bg-stone-950/24 transition duration-200 ${
              isSidebarVisible ? 'opacity-100 backdrop-blur-sm' : 'opacity-0 backdrop-blur-none'
            }`}
          />

          <aside
            className={`fixed right-0 top-22 z-80 h-[calc(100dvh-5.5rem)] w-full max-w-md border-l border-orange-100 bg-white/96 shadow-[-18px_0_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-200 ${
              isSidebarVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
            }`}
          >
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-orange-100 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
                      Friends
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-stone-950">Social panel</h2>
                  </div>

                  <button
                    type="button"
                    onClick={closeSidebar}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-orange-300 hover:text-orange-600"
                  >
                    <HiOutlineXMark className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 p-1">
                  {tabs.map(tab => {
                    const isActive = activeTab === tab.id

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                          isActive
                            ? 'bg-white text-orange-600 shadow-[0_10px_22px_rgba(15,23,42,0.07)]'
                            : 'text-stone-600 hover:text-orange-600'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {tab.count ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                            {tab.count}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {feedbackMessage ? (
                  <div className="mb-4 rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {feedbackMessage}
                  </div>
                ) : null}

                {error ? (
                  <div className="mb-4 rounded-3xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {error}
                  </div>
                ) : null}

                {realtimeError ? (
                  <div className="mb-4 rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                    {realtimeError}
                  </div>
                ) : null}

                {loading ? (
                  <div className="rounded-4xl border border-orange-100 bg-white p-5 text-sm text-stone-500">
                    Loading friends panel...
                  </div>
                ) : null}

                {!loading && activeTab === 'requests' ? (
                  <div className="space-y-5">
                    {lobbyInvites.length ? (
                      <section className="rounded-4xl border border-orange-100 bg-white p-5 shadow-[0_16px_40px_rgba(115,66,0,0.06)]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
                            Lobby invites
                          </p>
                          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                            {lobbyInvites.length}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {lobbyInvites.map(invite => (
                            <div
                              key={invite.id}
                              className="rounded-3xl border border-orange-100 bg-orange-50/70 p-4"
                            >
                              <p className="text-sm font-semibold text-stone-950">
                                {buildPlayerId(invite.from.inGameName, invite.from.tag)} invited you
                                to {invite.lobbyName}.
                              </p>
                              <div className="mt-3 flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleOpenLobbyInvite(invite)}
                                  className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                                >
                                  <HiOutlineArrowRight className="h-4 w-4" />
                                  Join lobby
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissLobbyInvite(invite.id)}
                                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-orange-300 hover:text-orange-600"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-4xl border border-orange-100 bg-white p-5 shadow-[0_16px_40px_rgba(115,66,0,0.06)]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
                          Received requests
                        </p>
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                          {incomingRequests.length}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {incomingRequests.length ? (
                          incomingRequests.map(request => (
                            <div
                              key={request.id}
                              className="rounded-3xl border border-orange-100 bg-orange-50/70 p-4"
                            >
                              <div className="flex items-center gap-3">
                                <Image
                                  src={request.user.avatarUrl}
                                  alt={`${request.user.inGameName} avatar`}
                                  width={44}
                                  height={44}
                                  className="h-11 w-11 rounded-full object-cover"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-stone-950">
                                    {request.user.inGameName}
                                  </p>
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange-600">
                                    #{request.user.tag}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 flex gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void runAction(`accept:${request.id}`, {
                                      type: 'accept-request',
                                      requestId: request.id,
                                    })
                                  }
                                  disabled={busyAction === `accept:${request.id}`}
                                  className="inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void runAction(`decline:${request.id}`, {
                                      type: 'decline-request',
                                      requestId: request.id,
                                    })
                                  }
                                  disabled={busyAction === `decline:${request.id}`}
                                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm leading-7 text-stone-500">
                            No received requests right now.
                          </p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-4xl border border-orange-100 bg-white p-5 shadow-[0_16px_40px_rgba(115,66,0,0.06)]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
                          Sent requests
                        </p>
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                          {outgoingRequests.length}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {outgoingRequests.length ? (
                          outgoingRequests.map(request => (
                            <div
                              key={request.id}
                              className="rounded-3xl border border-orange-100 bg-white p-4"
                            >
                              <div className="flex items-center gap-3">
                                <Image
                                  src={request.user.avatarUrl}
                                  alt={`${request.user.inGameName} avatar`}
                                  width={44}
                                  height={44}
                                  className="h-11 w-11 rounded-full object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-stone-950">
                                    {request.user.inGameName}
                                  </p>
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange-600">
                                    #{request.user.tag}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void runAction(`cancel:${request.id}`, {
                                      type: 'cancel-request',
                                      requestId: request.id,
                                    })
                                  }
                                  disabled={busyAction === `cancel:${request.id}`}
                                  className="inline-flex items-center justify-center rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm leading-7 text-stone-500">
                            No sent requests pending.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                ) : null}

                {!loading && activeTab === 'friends' ? (
                  <section className="rounded-4xl border border-orange-100 bg-white p-5 shadow-[0_16px_40px_rgba(115,66,0,0.06)]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
                        Your friends
                      </p>
                      <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                        {friends.length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {friends.length ? (
                        friends.map(friend => {
                          const isOnline = onlineUserIds.includes(friend.id)
                          const playerId = buildPlayerId(friend.inGameName, friend.tag)

                          return (
                            <div
                              key={friend.id}
                              className="relative rounded-3xl border border-orange-100 bg-orange-50/70 p-4"
                            >
                              <div className="flex items-center gap-3">
                                <Image
                                  src={friend.avatarUrl}
                                  alt={`${friend.inGameName} avatar`}
                                  width={52}
                                  height={52}
                                  className="h-13 w-13 rounded-full object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-stone-950">
                                    {friend.inGameName}
                                  </p>
                                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange-600">
                                    #{friend.tag}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2 text-xs font-medium text-stone-500">
                                    <span
                                      className={`h-2.5 w-2.5 rounded-full ${
                                        isOnline ? 'bg-emerald-500' : 'bg-stone-300'
                                      }`}
                                    />
                                    <span>{isOnline ? 'Online now' : 'Offline'}</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setActionMenuFriendId(current =>
                                      current === friend.id ? null : friend.id
                                    )
                                  }
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-orange-300 hover:text-orange-600"
                                >
                                  <RiMore2Fill className="h-5 w-5" />
                                </button>
                              </div>

                              <p className="mt-4 text-sm font-medium text-stone-600">{playerId}</p>

                              {actionMenuFriendId === friend.id ? (
                                <div className="absolute right-4 top-16 z-10 w-52 rounded-3xl border border-orange-100 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                                  {canInviteToLobby ? (
                                    <button
                                      type="button"
                                      onClick={() => sendLobbyInvite(friend)}
                                      className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-stone-700 transition hover:bg-orange-50 hover:text-orange-600"
                                    >
                                      Invite to lobby
                                      <HiOutlineArrowRight className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void runAction(
                                        `remove:${friend.id}`,
                                        { type: 'remove-friend', friendId: friend.id },
                                        () => setActionMenuFriendId(null)
                                      )
                                    }
                                    className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                                  >
                                    Remove friend
                                    <HiOutlineXMark className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-sm leading-7 text-stone-500">
                          No friends yet. Use the search tab to send your first friend request.
                        </p>
                      )}
                    </div>
                  </section>
                ) : null}

                {!loading && activeTab === 'search' ? (
                  <section className="rounded-4xl border border-orange-100 bg-orange-50/70 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
                      Search friend
                    </p>
                    <form
                      className="mt-4 space-y-4"
                      onSubmit={event => {
                        event.preventDefault()
                        void runAction(
                          'send-request',
                          { type: 'send-request', playerId: searchValue },
                          () => setSearchValue('')
                        )
                      }}
                    >
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-stone-700">
                          Player ID
                        </span>
                        <div className="relative">
                          <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                          <input
                            value={searchValue}
                            onChange={event => setSearchValue(event.target.value)}
                            placeholder="player123#ABCDE"
                            className="w-full rounded-3xl border border-orange-200 bg-white py-3 pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-orange-500"
                          />
                        </div>
                      </label>
                      <button
                        type="submit"
                        disabled={busyAction === 'send-request'}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
                      >
                        <RiUserAddLine className="h-4 w-4" />
                        {busyAction === 'send-request' ? 'Sending...' : 'Send friend request'}
                      </button>
                    </form>

                    <div className="mt-5 rounded-3xl border border-orange-100 bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                        Your player ID
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="truncate text-base font-semibold text-stone-950">
                          {ownPlayerId}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleCopyOwnPlayerId()}
                          className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
                        >
                          {copied ? (
                            <HiOutlineCheck className="h-4 w-4" />
                          ) : (
                            <HiOutlineClipboardDocument className="h-4 w-4" />
                          )}
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  )
}
