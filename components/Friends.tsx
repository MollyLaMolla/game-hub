'use client'

import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineClipboardDocument,
  HiOutlineClock,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { RiMore2Fill, RiTeamLine, RiUserAddLine } from 'react-icons/ri'
import {
  buildPlayerId,
  isLobbyInviteExpired,
  type FriendRequestRealtimeNotice,
  type FriendIdentity,
  type FriendsSidebarTab,
  type FriendsUpdatedRealtimeNotice,
  type FriendsSidebarData,
  type LobbyInviteSummary,
  OPEN_FRIENDS_SIDEBAR_EVENT,
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
  | { type: 'lobby_updated' }
  | { type: 'match_ready' }
  | { type: 'match_updated' }
  | { type: 'friend_request_received'; request: FriendRequestRealtimeNotice }
  | { type: 'friends_updated'; update: FriendsUpdatedRealtimeNotice }

type FriendsTab = FriendsSidebarTab

type FriendsToast = {
  id: string
  title: string
  message: string
  badgeLabel?: string
  avatarUrl?: string
  accent: 'amber' | 'orange' | 'sky'
  expiresAt?: string
  inviteId?: string
  playerId?: string
  targetTab?: FriendsTab
  userName?: string
  userTag?: string
  createdAt: number
  durationMs: number
  isLeaving: boolean
  tone: 'amber' | 'emerald' | 'sky'
}

type ToastTimerHandles = {
  leave: number | null
  remove: number | null
}

const SIDEBAR_TRANSITION_MS = 240
const TOAST_DURATION_MS = 5000
const TOAST_EXIT_DURATION_MS = 220

export default function Friends({ inGameName, tag }: { inGameName: string; tag: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const websocketRef = useRef<WebSocket | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const hasConnectedRealtimeRef = useRef(false)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const toastTimersRef = useRef<Map<string, ToastTimerHandles>>(new Map())
  const lobbyInviteRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
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
  const [toasts, setToasts] = useState<FriendsToast[]>([])
  const [highlightedLobbyInviteId, setHighlightedLobbyInviteId] = useState<string | null>(null)

  const canInviteToLobby = pathname === '/games'
  const ownPlayerId = buildPlayerId(inGameName, tag)
  const incomingRequests = friendsData?.incomingRequests || []
  const outgoingRequests = friendsData?.outgoingRequests || []
  const friends = friendsData?.friends || []
  const pendingRequestCount = incomingRequests.length + outgoingRequests.length
  const pendingNotificationCount = pendingRequestCount + lobbyInvites.length

  function clearToastTimers(toastId: string) {
    const timers = toastTimersRef.current.get(toastId)

    if (!timers) {
      return
    }

    if (timers.leave) {
      window.clearTimeout(timers.leave)
    }

    if (timers.remove) {
      window.clearTimeout(timers.remove)
    }

    toastTimersRef.current.delete(toastId)
  }

  function removeToast(toastId: string) {
    clearToastTimers(toastId)
    setToasts(current => current.filter(toast => toast.id !== toastId))
  }

  const enqueueToast = useEffectEvent(function enqueueToast(
    toast: Omit<FriendsToast, 'id' | 'createdAt' | 'durationMs' | 'isLeaving'>
  ) {
    const toastId = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const leaveDelay = Math.max(TOAST_DURATION_MS - TOAST_EXIT_DURATION_MS, 0)

    setToasts(current => [
      ...current,
      {
        id: toastId,
        createdAt: Date.now(),
        durationMs: TOAST_DURATION_MS,
        isLeaving: false,
        ...toast,
      },
    ])

    toastTimersRef.current.set(toastId, {
      leave: window.setTimeout(() => {
        dismissToast(toastId)
      }, leaveDelay),
      remove: null,
    })
  })

  function dismissToast(toastId: string) {
    const timers = toastTimersRef.current.get(toastId)

    if (!timers) {
      return
    }

    if (timers.leave) {
      window.clearTimeout(timers.leave)
      timers.leave = null
    }

    if (timers.remove) {
      return
    }

    setToasts(current =>
      current.map(toast =>
        toast.id === toastId
          ? {
              ...toast,
              isLeaving: true,
            }
          : toast
      )
    )

    timers.remove = window.setTimeout(() => {
      removeToast(toastId)
    }, TOAST_EXIT_DURATION_MS)

    toastTimersRef.current.set(toastId, timers)
  }

  function handleToastClick(toast: FriendsToast) {
    dismissToast(toast.id)

    if (toast.inviteId) {
      setHighlightedLobbyInviteId(toast.inviteId)
    }

    if (toast.targetTab) {
      openSidebar(toast.targetTab)
    }
  }

  function formatInviteTimeLeft(expiresAt: string) {
    const remainingMs = Math.max(Date.parse(expiresAt) - Date.now(), 0)
    const totalSeconds = Math.ceil(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes <= 0) {
      return `Expires in ${seconds}s`
    }

    return `Expires in ${minutes}m ${seconds.toString().padStart(2, '0')}s`
  }

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
              const playerId = buildPlayerId(
                message.request.from.inGameName,
                message.request.from.tag
              )

              enqueueToast({
                title: 'Friend request',
                message: `${playerId} sent you a friend request.`,
                badgeLabel: 'Request',
                avatarUrl: message.request.from.avatarUrl,
                playerId,
                userName: message.request.from.inGameName,
                userTag: message.request.from.tag,
                targetTab: 'requests',
                accent: 'orange',
                tone: 'emerald',
              })
            })
            .catch(() => {
              setError('Unable to refresh friend requests right now.')
            })
          return
        }

        if (message.type === 'friends_updated') {
          void refreshFriendsData()
            .then(() => {
              const playerId = buildPlayerId(
                message.update.friend.inGameName,
                message.update.friend.tag
              )

              enqueueToast({
                title: message.update.reason === 'friend-added' ? 'Friend added' : 'Friend removed',
                message:
                  message.update.reason === 'friend-added'
                    ? `${playerId} is now in your friends list.`
                    : `${playerId} removed you from friends.`,
                badgeLabel: message.update.reason === 'friend-added' ? 'Update' : 'Removed',
                avatarUrl: message.update.friend.avatarUrl,
                playerId,
                userName: message.update.friend.inGameName,
                userTag: message.update.friend.tag,
                targetTab: 'friends',
                accent: 'sky',
                tone: 'sky',
              })
            })
            .catch(() => {
              setError('Unable to refresh friends right now.')
            })
          return
        }

        if (message.type !== 'lobby_invite') {
          return
        }

        if (isLobbyInviteExpired(message.invite)) {
          return
        }

        savePendingLobbyInvite(message.invite)
        setLobbyInvites(current => {
          const nextInvites = current.filter(
            invite =>
              !(
                invite.from.id === message.invite.from.id &&
                invite.gameKey === message.invite.gameKey &&
                invite.lobbyId === message.invite.lobbyId
              )
          )
          return [message.invite, ...nextInvites]
        })
        enqueueToast({
          title: 'Lobby invite',
          message: `${buildPlayerId(message.invite.from.inGameName, message.invite.from.tag)} invited you to a private lobby.`,
          badgeLabel: message.invite.lobbyName,
          avatarUrl: message.invite.from.avatarUrl,
          inviteId: message.invite.id,
          playerId: buildPlayerId(message.invite.from.inGameName, message.invite.from.tag),
          userName: message.invite.from.inGameName,
          userTag: message.invite.from.tag,
          expiresAt: message.invite.expiresAt,
          targetTab: 'requests',
          accent: 'amber',
          tone: 'amber',
        })
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
    const expiryInterval = window.setInterval(() => {
      setLobbyInvites(readPendingLobbyInvites())
    }, 1000)

    return () => {
      window.clearInterval(expiryInterval)
    }
  }, [])

  useEffect(() => {
    if (!highlightedLobbyInviteId || activeTab !== 'requests' || !isOpen || !isSidebarVisible) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      lobbyInviteRefs.current.get(highlightedLobbyInviteId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [activeTab, highlightedLobbyInviteId, isOpen, isSidebarVisible, lobbyInvites.length])

  useEffect(() => {
    if (!highlightedLobbyInviteId) {
      return
    }

    const clearHighlightTimer = window.setTimeout(() => {
      setHighlightedLobbyInviteId(current =>
        current === highlightedLobbyInviteId ? null : current
      )
    }, 2200)

    return () => {
      window.clearTimeout(clearHighlightTimer)
    }
  }, [highlightedLobbyInviteId])

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
    if (!actionMenuFriendId) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (actionMenuRef.current?.contains(target)) {
        return
      }

      setActionMenuFriendId(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [actionMenuFriendId])

  useEffect(() => {
    const toastTimers = toastTimersRef.current

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }

      for (const timers of toastTimers.values()) {
        if (timers.leave) {
          window.clearTimeout(timers.leave)
        }

        if (timers.remove) {
          window.clearTimeout(timers.remove)
        }
      }

      toastTimers.clear()
    }
  }, [])

  useEffect(() => {
    function handleOpenSidebar(event: Event) {
      const customEvent = event as CustomEvent<{ tab?: FriendsTab }>
      openSidebar(customEvent.detail?.tab || 'friends')
    }

    window.addEventListener(OPEN_FRIENDS_SIDEBAR_EVENT, handleOpenSidebar as EventListener)

    return () => {
      window.removeEventListener(OPEN_FRIENDS_SIDEBAR_EVENT, handleOpenSidebar as EventListener)
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

  async function sendLobbyInvite(friend: FriendIdentity) {
    setError(null)

    try {
      const response = await fetch('/api/lobbies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: 'invite-friend',
          friendId: friend.id,
        }),
      })

      const payload = (await response.json()) as {
        error?: string
        message?: string
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to send the lobby invite.')
      }

      setFeedbackMessage(
        payload.message || `Invite sent to ${buildPlayerId(friend.inGameName, friend.tag)}.`
      )
      setActionMenuFriendId(null)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to send the lobby invite.'
      )
    }
  }

  function handleOpenLobbyInvite(invite: LobbyInviteSummary) {
    savePendingLobbyInvite(invite)
    closeSidebar()
    router.push(`${invite.lobbyPath}?inviteId=${encodeURIComponent(invite.id)}`)
  }

  function dismissLobbyInvite(inviteId: string) {
    removePendingLobbyInvite(inviteId)
    setLobbyInvites(current => current.filter(invite => invite.id !== inviteId))
    setHighlightedLobbyInviteId(current => (current === inviteId ? null : current))
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
      <style jsx global>{`
        @keyframes friends-toast-in {
          from {
            opacity: 0;
            transform: translate3d(24px, 0, 0);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes friends-toast-out {
          from {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }

          to {
            opacity: 0;
            transform: translate3d(24px, 0, 0);
          }
        }

        @keyframes friends-toast-progress {
          from {
            transform: scaleX(1);
          }

          to {
            transform: scaleX(0);
          }
        }
      `}</style>

      <button
        type="button"
        onClick={() => openSidebar('requests')}
        className="relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white hover:text-orange-600"
      >
        <RiTeamLine className="h-4 w-4" />
        <span>Friends</span>
        {pendingNotificationCount ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
            {pendingNotificationCount}
          </span>
        ) : null}
      </button>

      {typeof document !== 'undefined' && toasts.length
        ? createPortal(
            <div className="fixed right-5 top-24 z-90 flex w-fit max-w-sm flex-col items-end gap-3 pointer-events-none">
              {toasts.map(toast => {
                const toneClassName =
                  toast.accent === 'orange'
                    ? 'border-orange-200 bg-linear-to-br from-orange-50 via-amber-50 to-white text-orange-700 shadow-[0_14px_34px_rgba(249,115,22,0.12)]'
                    : toast.accent === 'sky'
                      ? 'border-sky-200 bg-linear-to-br from-sky-50 via-cyan-50 to-white text-sky-700 shadow-[0_14px_34px_rgba(56,189,248,0.16)]'
                      : 'border-amber-200 bg-linear-to-br from-amber-50 via-orange-50 to-white text-amber-700 shadow-[0_14px_34px_rgba(249,115,22,0.12)]'

                const badgeClassName =
                  toast.accent === 'orange'
                    ? 'border-orange-200 text-orange-700'
                    : toast.accent === 'sky'
                      ? 'border-sky-200 text-sky-700'
                      : 'border-amber-200 text-amber-700'

                const avatarRingClassName =
                  toast.accent === 'orange'
                    ? 'border-orange-200 shadow-[0_8px_20px_rgba(249,115,22,0.14)]'
                    : toast.accent === 'sky'
                      ? 'border-sky-200 shadow-[0_8px_20px_rgba(56,189,248,0.18)]'
                      : 'border-amber-200 shadow-[0_8px_20px_rgba(245,158,11,0.12)]'

                const progressBarClassName =
                  toast.accent === 'orange'
                    ? 'bg-orange-400'
                    : toast.accent === 'sky'
                      ? 'bg-sky-400'
                      : 'bg-amber-400'

                return (
                  <div
                    key={toast.id}
                    role={toast.targetTab ? 'button' : undefined}
                    tabIndex={toast.targetTab ? 0 : undefined}
                    onClick={() => handleToastClick(toast)}
                    onKeyDown={event => {
                      if (!toast.targetTab) {
                        return
                      }

                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleToastClick(toast)
                      }
                    }}
                    className={`${toast.isLeaving ? 'pointer-events-none' : 'pointer-events-auto'} rounded-3xl border p-4 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.12)] ${toneClassName} ${toast.targetTab ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2' : ''}`}
                    style={{
                      animation: `${toast.isLeaving ? 'friends-toast-out' : 'friends-toast-in'} ${TOAST_EXIT_DURATION_MS}ms ease forwards`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {toast.avatarUrl ? (
                        <div className={`rounded-full border bg-white p-1 ${avatarRingClassName}`}>
                          <Image
                            src={toast.avatarUrl}
                            alt={`${toast.title} avatar`}
                            width={44}
                            height={44}
                            className="h-11 w-11 object-cover p-1"
                          />
                        </div>
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {toast.userName ? (
                              <>
                                <p className="truncate text-base font-semibold text-stone-950">
                                  {toast.userName}
                                </p>
                                {toast.userTag ? (
                                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">
                                    #{toast.userTag}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p className="text-sm font-semibold text-stone-950">{toast.title}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {toast.badgeLabel ? (
                              <span
                                className={`rounded-full border bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeClassName}`}
                              >
                                {toast.badgeLabel}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation()
                                dismissToast(toast.id)
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-current/70 transition hover:bg-white/70 hover:text-current"
                            >
                              <HiOutlineXMark className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/70">
                      <div
                        className={`h-full origin-left rounded-full ${progressBarClassName}`}
                        style={{
                          animation: `friends-toast-progress ${toast.durationMs}ms linear forwards`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>,
            document.body
          )
        : null}

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close friends sidebar"
                onClick={closeSidebar}
                className={`fixed inset-0 z-70 bg-stone-950/28 transition duration-200 ${
                  isSidebarVisible ? 'opacity-100 backdrop-blur-md' : 'opacity-0 backdrop-blur-none'
                }`}
              />

              <aside
                className={`fixed right-0 top-0 z-80 h-dvh w-full max-w-md border-l border-orange-100 bg-white/96 shadow-[-18px_0_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-200 ${
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
                                  ref={node => {
                                    if (node) {
                                      lobbyInviteRefs.current.set(invite.id, node)
                                      return
                                    }

                                    lobbyInviteRefs.current.delete(invite.id)
                                  }}
                                  className={`rounded-3xl border bg-linear-to-br from-amber-50 via-orange-50 to-white p-4 shadow-[0_14px_34px_rgba(249,115,22,0.12)] transition ${
                                    highlightedLobbyInviteId === invite.id
                                      ? 'border-amber-400 ring-2 ring-amber-200 shadow-[0_0_0_4px_rgba(251,191,36,0.14),0_18px_40px_rgba(249,115,22,0.16)]'
                                      : 'border-amber-200'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="rounded-full border border-amber-200 bg-white p-1 shadow-[0_8px_20px_rgba(245,158,11,0.12)]">
                                      <Image
                                        src={invite.from.avatarUrl}
                                        alt={`${invite.from.inGameName} avatar`}
                                        width={44}
                                        height={44}
                                        className="h-11 w-11 object-cover p-1"
                                      />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-stone-950">
                                            {invite.from.inGameName}
                                          </p>
                                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
                                            #{invite.from.tag}
                                          </p>
                                        </div>

                                        <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                          {invite.lobbyName}
                                        </span>
                                      </div>

                                      <p className="mt-3 text-sm leading-6 text-stone-700">
                                        <span className="font-semibold text-stone-950">
                                          {buildPlayerId(invite.from.inGameName, invite.from.tag)}
                                        </span>{' '}
                                        invited you to a private lobby.
                                      </p>

                                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                                        <HiOutlineClock className="h-3.5 w-3.5" />
                                        <span>{formatInviteTimeLeft(invite.expiresAt)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex gap-3">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenLobbyInvite(invite)}
                                      className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                                    >
                                      <HiOutlineArrowRight className="h-4 w-4" />
                                      Review invite
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => dismissLobbyInvite(invite.id)}
                                      className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-amber-300 hover:text-amber-700"
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
                                    <div className="rounded-full border border-orange-100 bg-white p-1 shadow-[0_8px_20px_rgba(249,115,22,0.08)]">
                                      <Image
                                        src={request.user.avatarUrl}
                                        alt={`${request.user.inGameName} avatar`}
                                        width={44}
                                        height={44}
                                        className="h-11 w-11 object-cover p-1"
                                      />
                                    </div>
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
                                    <div className="rounded-full border border-orange-100 bg-white p-1 shadow-[0_8px_20px_rgba(249,115,22,0.08)]">
                                      <Image
                                        src={request.user.avatarUrl}
                                        alt={`${request.user.inGameName} avatar`}
                                        width={44}
                                        height={44}
                                        className="h-11 w-11 object-cover p-1"
                                      />
                                    </div>
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

                              return (
                                <div
                                  key={friend.id}
                                  className="relative rounded-3xl border border-orange-100 bg-orange-50/70 p-4"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="border border-orange-100 rounded-full p-1">
                                      <Image
                                        src={friend.avatarUrl}
                                        alt={`${friend.inGameName} avatar`}
                                        width={52}
                                        height={52}
                                        className="h-13 w-13 object-cover p-1"
                                      />
                                    </div>
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

                                  {actionMenuFriendId === friend.id ? (
                                    <div
                                      ref={actionMenuRef}
                                      className="absolute right-4 top-16 z-10 w-52 rounded-3xl border border-orange-100 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                                    >
                                      {canInviteToLobby ? (
                                        <button
                                          type="button"
                                          onClick={() => void sendLobbyInvite(friend)}
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
            </>,
            document.body
          )
        : null}
    </>
  )
}
