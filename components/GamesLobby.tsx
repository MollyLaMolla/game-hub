'use client'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineEllipsisHorizontal,
  HiOutlinePlay,
  HiOutlineXMark,
} from 'react-icons/hi2'
import {
  RiGamepadLine,
  RiLockLine,
  RiSearchLine,
  RiTeamLine,
  RiUserAddLine,
  RiVipCrownFill,
} from 'react-icons/ri'
import { GAME_OPTIONS, type LobbyQueueTypeValue } from '@/lib/game-catalog'
import {
  buildPlayerId,
  type FriendIdentity,
  isLobbyInviteExpired,
  OPEN_FRIENDS_SIDEBAR_EVENT,
  readPendingLobbyInvite,
  removePendingLobbyInvite,
  type LobbyInviteSummary,
} from '@/lib/friends-shared'
import type {
  LobbyActionResponse,
  LobbyRealtimeNotice,
  LobbySnapshot,
  MatchReadyRealtimeNotice,
} from '@/lib/lobbies-shared'

type Props = {
  initialLobby: LobbySnapshot
  currentUserId: string
}

type RealtimeMessage =
  | { type: 'presence'; onlineUserIds: string[] }
  | { type: 'lobby_invite'; invite: LobbyInviteSummary }
  | { type: 'lobby_member_kicked'; member: FriendIdentity }
  | { type: 'lobby_member_left'; member: FriendIdentity }
  | { type: 'lobby_member_promoted' }
  | LobbyRealtimeNotice
  | MatchReadyRealtimeNotice

type LobbyToast = {
  id: string
  message: string
  tone: 'emerald' | 'rose'
  createdAt: number
  durationMs: number
  isLeaving: boolean
}

type ToastTimerHandles = {
  leave: number | null
  remove: number | null
}

const TOAST_DURATION_MS = 5000
const TOAST_EXIT_DURATION_MS = 220

function formatElapsedSearchTime(elapsedMs: number) {
  const elapsedSeconds = Math.max(Math.floor(elapsedMs / 1000), 0)
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function GamesLobby({ initialLobby, currentUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const websocketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const memberMenuCloseTimerRef = useRef<number | null>(null)
  const previousLobbyRef = useRef(initialLobby)
  const lastLocalActionRef = useRef<string | null>(null)
  const toastTimersRef = useRef<Map<string, ToastTimerHandles>>(new Map())
  const hasConnectedRealtimeRef = useRef(false)
  const [lobby, setLobby] = useState(initialLobby)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [, setError] = useState<string | null>(null)
  const [, setRealtimeError] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null)
  const [isGamePickerOpen, setIsGamePickerOpen] = useState(false)
  const [toasts, setToasts] = useState<LobbyToast[]>([])
  const inviteId = searchParams.get('inviteId')
  const storedInvite = inviteId ? readPendingLobbyInvite(inviteId) : null
  const pendingInvite = storedInvite && !isLobbyInviteExpired(storedInvite) ? storedInvite : null
  const inviteQueryError =
    inviteId && !pendingInvite ? 'The selected lobby invite is no longer available.' : null

  const clearToastTimers = useCallback((toastId: string) => {
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
  }, [])

  const removeToast = useCallback(
    (toastId: string) => {
      clearToastTimers(toastId)
      setToasts(current => current.filter(toast => toast.id !== toastId))
    },
    [clearToastTimers]
  )

  const dismissToast = useCallback(
    (toastId: string) => {
      const timers = toastTimersRef.current.get(toastId)

      if (timers?.leave) {
        window.clearTimeout(timers.leave)
      }

      if (timers?.remove) {
        window.clearTimeout(timers.remove)
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

      toastTimersRef.current.set(toastId, {
        leave: null,
        remove: window.setTimeout(() => {
          removeToast(toastId)
        }, TOAST_EXIT_DURATION_MS),
      })
    },
    [removeToast]
  )

  const enqueueToast = useCallback(
    (message: string, tone: LobbyToast['tone']) => {
      const toastId = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      const leaveDelay = Math.max(TOAST_DURATION_MS - TOAST_EXIT_DURATION_MS, 0)

      setToasts(current => [
        ...current,
        {
          id: toastId,
          message,
          tone,
          createdAt: Date.now(),
          durationMs: TOAST_DURATION_MS,
          isLeaving: false,
        },
      ])

      toastTimersRef.current.set(toastId, {
        leave: window.setTimeout(() => {
          dismissToast(toastId)
        }, leaveDelay),
        remove: null,
      })
    },
    [dismissToast]
  )

  function clearMemberMenuCloseTimer() {
    if (memberMenuCloseTimerRef.current) {
      window.clearTimeout(memberMenuCloseTimerRef.current)
      memberMenuCloseTimerRef.current = null
    }
  }

  function scheduleMemberMenuClose() {
    clearMemberMenuCloseTimer()
    memberMenuCloseTimerRef.current = window.setTimeout(() => {
      setOpenMemberMenuId(null)
    }, 140)
  }

  function getPresentMembers(snapshot: LobbySnapshot) {
    return snapshot.members.flatMap(seat => (seat.member ? [seat.member] : []))
  }

  const applyLobbySnapshot = useCallback(
    (snapshot: LobbySnapshot) => {
      const previousLobby = previousLobbyRef.current
      const previousMembers = getPresentMembers(previousLobby)
      const nextMembers = getPresentMembers(snapshot)
      const previousMemberIds = new Set(previousMembers.map(member => member.id))
      const previousHadPartyMembers = previousMembers.some(member => member.id !== currentUserId)
      const nextIsSoloLobby =
        snapshot.ownerId === currentUserId &&
        nextMembers.length === 1 &&
        nextMembers[0]?.id === currentUserId

      setLobby(snapshot)
      setError(null)
      setOpenMemberMenuId(currentOpenMemberId =>
        currentOpenMemberId &&
        snapshot.status === 'open' &&
        snapshot.members.some(seat => seat.member?.id === currentOpenMemberId)
          ? currentOpenMemberId
          : null
      )

      if (snapshot.status !== 'open') {
        setIsGamePickerOpen(false)
      }

      if (previousLobby.id === snapshot.id) {
        const joinedMembers = nextMembers.filter(member => !previousMemberIds.has(member.id))

        for (const joinedMember of joinedMembers) {
          if (joinedMember.id !== currentUserId) {
            enqueueToast(`${joinedMember.inGameName} joined the party.`, 'emerald')
          }
        }
      } else {
        if (
          lastLocalActionRef.current !== 'leave-lobby' &&
          previousHadPartyMembers &&
          nextIsSoloLobby
        ) {
          enqueueToast('You were removed from the party.', 'rose')
        }
      }

      previousLobbyRef.current = snapshot
    },
    [currentUserId, enqueueToast]
  )

  const refreshLobby = useCallback(async () => {
    const response = await fetch('/api/lobbies', {
      credentials: 'same-origin',
    })
    const payload = (await response.json()) as LobbyActionResponse

    if (!response.ok || !payload.data) {
      throw new Error(payload.error || 'Unable to load the current lobby.')
    }

    applyLobbySnapshot(payload.data)
    return payload.data
  }, [applyLobbySnapshot])

  const syncLobbyPresence = useCallback(async () => {
    const response = await fetch('/api/lobbies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ type: 'touch-presence' }),
    })
    const payload = (await response.json()) as LobbyActionResponse

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to refresh lobby presence.')
    }

    if (payload.data) {
      applyLobbySnapshot(payload.data)
    }

    return payload.data
  }, [applyLobbySnapshot])

  async function runAction(
    actionId: string,
    body: Record<string, string>,
    onSuccess?: (payload: LobbyActionResponse) => void
  ) {
    setBusyAction(actionId)
    setError(null)
    lastLocalActionRef.current = actionId

    try {
      const response = await fetch('/api/lobbies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as LobbyActionResponse

      if (!response.ok) {
        throw new Error(payload.error || 'Lobby action failed.')
      }

      if (payload.data) {
        applyLobbySnapshot(payload.data)
      }

      if (payload.message && payload.message !== 'Searching for an opponent...') {
        enqueueToast(payload.message, 'emerald')
      }

      if (payload.redirectPath) {
        router.push(payload.redirectPath)
      }

      onSuccess?.(payload)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Lobby action failed.'
      setError(message)
      enqueueToast(message, 'rose')
    } finally {
      lastLocalActionRef.current = null
      setBusyAction(null)
    }
  }

  useEffect(() => {
    if (!inviteQueryError) {
      return
    }

    const inviteErrorTimer = window.setTimeout(() => {
      enqueueToast(inviteQueryError, 'rose')
    }, 0)

    return () => {
      window.clearTimeout(inviteErrorTimer)
    }
  }, [enqueueToast, inviteQueryError])

  useEffect(() => {
    if (!inviteId || pendingInvite) {
      return
    }

    removePendingLobbyInvite(inviteId)
    router.replace('/games')
  }, [inviteId, pendingInvite, router])

  useEffect(() => {
    if (!openMemberMenuId) {
      return
    }

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null

      if (target?.closest('[data-lobby-member-menu-root="true"]')) {
        return
      }

      setOpenMemberMenuId(null)
    }

    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [openMemberMenuId])

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

        if (message.type === 'presence' || message.type === 'lobby_invite') {
          return
        }

        if (message.type === 'lobby_member_left') {
          enqueueToast(`${message.member.inGameName} left the party.`, 'rose')
          return
        }

        if (message.type === 'lobby_member_kicked') {
          enqueueToast(`${message.member.inGameName} was removed from the party.`, 'rose')
          return
        }

        if (message.type === 'lobby_member_promoted') {
          enqueueToast('You are now the party leader.', 'emerald')
          return
        }

        if (message.type === 'lobby_updated') {
          applyLobbySnapshot(message.lobby)
          return
        }

        if (message.type === 'match_ready') {
          router.push(`${message.match.gameRoute}?match=${encodeURIComponent(message.match.id)}`)
        }
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
  }, [applyLobbySnapshot, enqueueToast, router])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void syncLobbyPresence().catch(() => {
        // Presence heartbeat is best-effort; polling remains the fallback.
      })
    }, 0)

    const heartbeatTimer = window.setInterval(() => {
      void syncLobbyPresence().catch(() => {
        // Presence heartbeat is best-effort; polling remains the fallback.
      })
    }, 3000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(heartbeatTimer)
    }
  }, [syncLobbyPresence])

  useEffect(() => {
    const pollTimer = window.setInterval(() => {
      void refreshLobby().catch(() => {
        // websocket is the main path; this is only a quiet fallback.
      })
    }, 10000)

    return () => {
      window.clearInterval(pollTimer)
    }
  }, [refreshLobby])

  useEffect(() => {
    if (!lobby.currentMatchId) {
      return
    }

    router.replace(`${lobby.gameRoute}?match=${encodeURIComponent(lobby.currentMatchId)}`)
  }, [lobby.currentMatchId, lobby.gameRoute, router])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setClockTick(Date.now())
    }, 0)

    const timer = window.setInterval(() => {
      setClockTick(Date.now())
    }, 1000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const toastTimers = toastTimersRef.current

    return () => {
      clearMemberMenuCloseTimer()

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

  const selectedGame = GAME_OPTIONS.find(game => game.key === lobby.gameKey) || GAME_OPTIONS[0]
  const selectedMode = selectedGame.modes[lobby.queueType]
  const isPublicSearching = lobby.queueType === 'public' && lobby.status === 'searching'
  const canManageMembers = lobby.isOwner && lobby.status === 'open'
  const canEditLobbyShell = lobby.isOwner && lobby.status === 'open'
  const filledPartySlots = lobby.members.filter(seat => seat.member).length
  const missingOpponents = Math.max(lobby.totalPlayers - filledPartySlots, 0)
  const searchElapsedMs = isPublicSearching
    ? Math.max((clockTick || Date.parse(lobby.updatedAt)) - Date.parse(lobby.updatedAt), 0)
    : 0
  const primaryActionId = isPublicSearching ? 'stop-search' : 'start-lobby'
  const primaryActionLabel = isPublicSearching
    ? 'Stop queue'
    : lobby.queueType === 'public'
      ? 'Start queue'
      : 'Start'
  const primaryActionBusyLabel = isPublicSearching ? 'Stopping...' : 'Starting...'
  const primaryActionDisabled = isPublicSearching
    ? busyAction === 'stop-search'
    : !lobby.canStart || busyAction === 'start-lobby'

  function openFriendsSidebar() {
    window.dispatchEvent(
      new CustomEvent(OPEN_FRIENDS_SIDEBAR_EVENT, {
        detail: { tab: 'friends' },
      })
    )
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <style jsx global>{`
        @keyframes games-lobby-card-in {
          from {
            opacity: 0;
            transform: translate3d(0, 16px, 0) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes games-lobby-overlay-in {
          from {
            opacity: 0;
            transform: translate3d(0, 18px, 0) scale(0.96);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes games-lobby-toast-in {
          from {
            opacity: 0;
            transform: translate3d(24px, 0, 0);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes games-lobby-toast-out {
          from {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }

          to {
            opacity: 0;
            transform: translate3d(24px, 0, 0);
          }
        }

        @keyframes games-lobby-toast-progress {
          from {
            transform: scaleX(1);
          }

          to {
            transform: scaleX(0);
          }
        }
      `}</style>

      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
          Multiplayer lobby
        </p>
      </div>

      {pendingInvite ? (
        <div className="rounded-4xl border border-amber-200 bg-linear-to-r from-amber-50 via-orange-50 to-white p-4 shadow-[0_18px_40px_rgba(249,115,22,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-full border border-amber-200 bg-white p-1">
                <Image
                  src={pendingInvite.from.avatarUrl}
                  alt={`${pendingInvite.from.inGameName} avatar`}
                  width={52}
                  height={52}
                  className="h-13 w-13 object-cover p-1"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                  Private invite
                </p>
                <h2 className="mt-1 text-lg font-semibold text-stone-950 sm:text-xl">
                  {buildPlayerId(pendingInvite.from.inGameName, pendingInvite.from.tag)} wants to
                  play {pendingInvite.lobbyName}
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busyAction === 'join-lobby'}
                onClick={() =>
                  void runAction(
                    'join-lobby',
                    {
                      type: 'join-lobby',
                      lobbyId: pendingInvite.lobbyId,
                    },
                    () => {
                      removePendingLobbyInvite(pendingInvite.id)
                      router.replace('/games')
                    }
                  )
                }
                className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                <HiOutlineCheck className="h-4 w-4" />
                {busyAction === 'join-lobby' ? 'Joining...' : 'Join'}
              </button>
              <button
                type="button"
                onClick={() => {
                  removePendingLobbyInvite(pendingInvite.id)
                  router.replace('/games')
                }}
                className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-amber-300 hover:text-amber-700"
              >
                <HiOutlineXMark className="h-4 w-4" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-[2.25rem] border border-orange-100 bg-linear-to-br from-stone-950 via-stone-900 to-orange-950 p-5 text-white shadow-[0_32px_120px_rgba(15,23,42,0.18)] sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.18),transparent_36%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.08),transparent_30%)]" />

        <button
          type="button"
          onClick={() =>
            void runAction('leave-lobby', {
              type: 'leave-lobby',
            })
          }
          disabled={busyAction === 'leave-lobby'}
          className="absolute right-5 top-5 z-10 inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/18 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/28 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <HiOutlineXMark className="h-4 w-4" />
          Leave
        </button>

        <button
          type="button"
          onClick={() => setIsGamePickerOpen(true)}
          disabled={!canEditLobbyShell}
          className="absolute left-5 top-5 z-10 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-orange-300/60 hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RiGamepadLine className="h-5 w-5 text-orange-200" />
          <span>{selectedGame.name}</span>
        </button>

        <div className="relative flex min-h-152 flex-col justify-between gap-8">
          <div className="mx-auto flex w-full max-w-md items-center justify-center rounded-full border border-white/12 bg-white/6 p-1">
            {(['public', 'private'] as LobbyQueueTypeValue[]).map(queueType => {
              const isActive = queueType === lobby.queueType
              const Icon = queueType === 'public' ? RiSearchLine : RiLockLine

              return (
                <button
                  key={queueType}
                  type="button"
                  disabled={!canEditLobbyShell || busyAction === 'set-queue-type'}
                  onClick={() =>
                    void runAction('set-queue-type', {
                      type: 'set-queue-type',
                      queueType,
                    })
                  }
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-white text-stone-950 shadow-[0_10px_24px_rgba(15,23,42,0.18)]'
                      : 'text-orange-100/88 hover:text-white'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{queueType === 'public' ? 'Public' : 'Private'}</span>
                </button>
              )
            })}
          </div>

          <div className="mx-auto w-full max-w-3xl text-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-orange-100/90">
              <span>Code {lobby.inviteCode}</span>
              {isPublicSearching ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-400/10 px-3 py-1 text-orange-100">
                  <HiOutlineClock className="h-4 w-4" />
                  {formatElapsedSearchTime(searchElapsedMs)}
                </span>
              ) : null}
              {isPublicSearching ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-orange-100">
                  <RiTeamLine className="h-4 w-4" />
                  {filledPartySlots}/{lobby.totalPlayers} players
                </span>
              ) : null}
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tighter text-white sm:text-6xl">
              {selectedGame.name} Lobby
            </h1>

            {isPublicSearching ? (
              <p className="mt-4 text-lg font-medium text-orange-100 sm:text-xl">
                Looking for {missingOpponents} more {missingOpponents === 1 ? 'player' : 'players'}
              </p>
            ) : null}
          </div>

          <div className="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-2">
            {lobby.members.map(seat => {
              const member = seat.member

              return (
                <div
                  key={seat.slotIndex}
                  className={`rounded-[1.75rem] border px-4 py-4 transition sm:px-5 ${
                    member
                      ? 'border-white/14 bg-white/10 backdrop-blur-sm'
                      : 'border-white/10 bg-white/4'
                  }`}
                  style={{
                    animation: 'games-lobby-card-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
                    animationDelay: `${seat.slotIndex * 70}ms`,
                  }}
                >
                  {member ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative rounded-full border border-white/25 bg-white/8 p-1">
                          <Image
                            src={member.avatarUrl}
                            alt={`${member.inGameName} avatar`}
                            width={48}
                            height={48}
                            className="h-12 w-12 object-cover p-1"
                          />
                          {member.id === lobby.ownerId ? (
                            <span className="absolute -right-1 -top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-stone-950 shadow-[0_8px_18px_rgba(251,191,36,0.4)]">
                              <RiVipCrownFill className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white sm:text-lg">
                            {member.inGameName}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.24em] text-orange-200/90">
                            #{member.tag}
                          </p>
                        </div>
                      </div>

                      {canManageMembers && member.id !== lobby.ownerId ? (
                        <div
                          className="relative shrink-0"
                          data-lobby-member-menu-root="true"
                          onMouseEnter={clearMemberMenuCloseTimer}
                          onMouseLeave={scheduleMemberMenuClose}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              clearMemberMenuCloseTimer()
                              setOpenMemberMenuId(current =>
                                current === member.id ? null : member.id
                              )
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-orange-100 transition hover:border-white/30 hover:bg-white/14 hover:text-white"
                            aria-label={`Manage ${member.inGameName}`}
                          >
                            <HiOutlineEllipsisHorizontal className="h-5 w-5" />
                          </button>

                          {openMemberMenuId === member.id ? (
                            <div
                              className="absolute right-0 top-12 z-20 w-48 rounded-3xl border border-white/15 bg-white/10 p-2 text-sm shadow-[0_18px_36px_rgba(15,23,42,0.2)] backdrop-blur-xl"
                              style={{
                                animation:
                                  'games-lobby-overlay-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
                              }}
                            >
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => {
                                  setOpenMemberMenuId(null)
                                  void runAction('promote-member', {
                                    type: 'promote-member',
                                    memberId: member.id,
                                  })
                                }}
                                className="flex w-full rounded-2xl px-3 py-2.5 text-left font-semibold text-white/92 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Promote to leader
                              </button>
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => {
                                  setOpenMemberMenuId(null)
                                  void runAction('kick-member', {
                                    type: 'kick-member',
                                    memberId: member.id,
                                  })
                                }}
                                className="mt-1 flex w-full rounded-2xl px-3 py-2.5 text-left font-semibold text-rose-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Remove from lobby
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="h-full flex justify-center">
                      <button
                        type="button"
                        onClick={openFriendsSidebar}
                        disabled={!lobby.canInviteFriends}
                        className="flex w-full items-center gap-3 text-left text-orange-100/75 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/20 bg-white/4">
                          <RiUserAddLine className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium uppercase tracking-[0.22em]">
                          Open slot
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4">
            <button
              type="button"
              disabled={primaryActionDisabled}
              onClick={() =>
                void runAction(primaryActionId, {
                  type: primaryActionId,
                })
              }
              className={`inline-flex min-w-[16rem] items-center justify-center gap-3 rounded-full px-8 py-4 text-lg font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[20rem] sm:text-xl ${
                isPublicSearching
                  ? 'bg-white text-stone-950 hover:bg-orange-50'
                  : 'bg-orange-500 text-white hover:bg-orange-400'
              }`}
            >
              {isPublicSearching ? (
                <HiOutlineXMark className="h-5 w-5" />
              ) : (
                <HiOutlinePlay className="h-5 w-5" />
              )}
              {busyAction === primaryActionId ? primaryActionBusyLabel : primaryActionLabel}
            </button>

            {lobby.queueType === 'public' ? (
              <div className="flex items-center gap-3 text-sm font-medium text-orange-100/80">
                <span className="rounded-full border border-white/12 bg-white/6 px-4 py-2">
                  {selectedMode.label}
                </span>
                <span className="rounded-full border border-white/12 bg-white/6 px-4 py-2">
                  {filledPartySlots}/{lobby.totalPlayers}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isGamePickerOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm"
          onClick={() => setIsGamePickerOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-4xl border border-orange-100 bg-white p-6 shadow-[0_30px_100px_rgba(15,23,42,0.22)] sm:p-8"
            style={{
              animation: 'games-lobby-overlay-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
            }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-600">
                  Select game
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-stone-950">
                  Choose the next room
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsGamePickerOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-700 transition hover:border-orange-200 hover:bg-orange-100"
              >
                <HiOutlineXMark className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {GAME_OPTIONS.map(game => {
                const isActive = game.key === lobby.gameKey
                const mode = game.modes[lobby.queueType]

                return (
                  <button
                    key={game.key}
                    type="button"
                    disabled={!canEditLobbyShell || busyAction === 'set-game'}
                    onClick={() =>
                      void runAction(
                        'set-game',
                        {
                          type: 'set-game',
                          gameKey: game.key,
                        },
                        () => setIsGamePickerOpen(false)
                      )
                    }
                    className={`rounded-[1.75rem] border p-5 text-left transition ${
                      isActive
                        ? 'border-orange-300 bg-linear-to-br from-orange-50 via-amber-50 to-white shadow-[0_18px_50px_rgba(249,115,22,0.14)]'
                        : 'border-orange-100 bg-white hover:border-orange-200 hover:bg-orange-50/60'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                        <RiGamepadLine className="h-6 w-6" />
                      </div>
                      <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
                        {mode.label}
                      </span>
                    </div>

                    <h3 className="mt-5 text-2xl font-semibold text-stone-950">{game.name}</h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600">{game.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {typeof document !== 'undefined' && toasts.length
        ? createPortal(
            <div className="pointer-events-none fixed right-5 top-24 z-90 flex w-fit max-w-sm flex-col items-end gap-3">
              {toasts.map(toast => {
                const toneClassName =
                  toast.tone === 'emerald'
                    ? 'border-emerald-200 bg-linear-to-br from-emerald-50 via-white to-orange-50 text-emerald-700 shadow-[0_18px_40px_rgba(16,185,129,0.14)]'
                    : 'border-rose-200 bg-linear-to-br from-rose-50 via-white to-orange-50 text-rose-700 shadow-[0_18px_40px_rgba(244,63,94,0.14)]'

                const progressClassName =
                  toast.tone === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400'

                return (
                  <div
                    key={toast.id}
                    className={`${toast.isLeaving ? 'pointer-events-none' : 'pointer-events-auto'} w-full rounded-3xl border p-4 text-sm font-medium ${toneClassName}`}
                    style={{
                      animation: `${toast.isLeaving ? 'games-lobby-toast-out' : 'games-lobby-toast-in'} ${TOAST_EXIT_DURATION_MS}ms ease forwards`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="pr-2 text-sm font-semibold">{toast.message}</p>
                      <button
                        type="button"
                        onClick={() => dismissToast(toast.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-current/70 transition hover:bg-white/70 hover:text-current"
                      >
                        <HiOutlineXMark className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/70">
                      <div
                        className={`h-full origin-left rounded-full ${progressClassName}`}
                        style={{
                          animation: `games-lobby-toast-progress ${toast.durationMs}ms linear forwards`,
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
    </section>
  )
}
