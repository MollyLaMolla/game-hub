'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HiOutlineBolt,
  HiOutlineChevronUp,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineSparkles,
  HiOutlineXMark,
} from 'react-icons/hi2'
import type {
  LobbyActionResponse,
  LobbyRealtimeNotice,
  MatchActionResponse,
  MatchReadyRealtimeNotice,
  MatchRealtimeNotice,
  MatchSnapshot,
  TicTacToeMark,
} from '@/lib/lobbies-shared'
import { getRealtimeWebSocketUrl } from '@/lib/realtime-client'
import MatchResultOverlay from './MatchResultOverlay'

type Props = {
  initialMatch: MatchSnapshot
  currentUserId: string
}

type RealtimeMessage =
  | { type: 'presence'; onlineUserIds: string[] }
  | LobbyRealtimeNotice
  | MatchReadyRealtimeNotice
  | MatchRealtimeNotice

function formatElapsedTime(elapsedMs: number) {
  const elapsedSeconds = Math.max(Math.floor(elapsedMs / 1000), 0)
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function TicTacToeMarkGlyph({
  mark,
  size = 'board',
}: {
  mark: TicTacToeMark
  size?: 'board' | 'badge' | 'stat'
}) {
  const className =
    size === 'board' ? 'h-14 w-14 sm:h-18 sm:w-18' : size === 'stat' ? 'h-5 w-5' : 'h-3.5 w-3.5'

  const strokeWidth = size === 'board' ? 12 : size === 'stat' ? 14 : 18

  if (mark === 'x') {
    return (
      <svg
        viewBox="0 0 100 100"
        className={className}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      >
        <path d="M24 24L76 76" />
        <path d="M76 24L24 76" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      <circle cx="50" cy="50" r="28" />
    </svg>
  )
}

function renderTicTacToeMark(mark: TicTacToeMark | null, emptyFallback: ReactNode = null) {
  if (!mark) {
    return emptyFallback
  }

  return <TicTacToeMarkGlyph mark={mark} />
}

export default function TicTacToeMatch({ initialMatch, currentUserId }: Props) {
  const router = useRouter()
  const websocketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const hasConnectedRealtimeRef = useRef(false)
  const [match, setMatch] = useState(initialMatch)
  const [busyCellIndex, setBusyCellIndex] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState<'rematch' | 'exit' | 'return' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [realtimeError, setRealtimeError] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [isOverlayMinimized, setIsOverlayMinimized] = useState(initialMatch.status !== 'finished')
  const [lobbyState, setLobbyState] = useState<{
    isOwner: boolean
    currentMatchId: string | null
  } | null>(null)

  const applyMatchSnapshot = useCallback((nextMatch: MatchSnapshot) => {
    setMatch(nextMatch)

    if (nextMatch.status !== 'finished') {
      setIsOverlayMinimized(false)
    }
  }, [])

  const refreshMatch = useCallback(async () => {
    const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}`, {
      credentials: 'same-origin',
    })
    const payload = (await response.json()) as MatchActionResponse

    if (!response.ok || !payload.data) {
      throw new Error(payload.error || 'Unable to load match state.')
    }

    applyMatchSnapshot(payload.data)
    return payload.data
  }, [applyMatchSnapshot, match.id])

  const refreshLobbyState = useCallback(async () => {
    const response = await fetch('/api/lobbies', {
      credentials: 'same-origin',
    })
    const payload = (await response.json()) as LobbyActionResponse

    if (!response.ok || !payload.data) {
      throw new Error(payload.error || 'Unable to load the current lobby.')
    }

    setLobbyState({
      isOwner: payload.data.isOwner,
      currentMatchId: payload.data.currentMatchId,
    })
  }, [])

  const syncMatchPresence = useCallback(async () => {
    const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/presence`, {
      method: 'POST',
      credentials: 'same-origin',
    })
    const payload = (await response.json()) as MatchActionResponse

    if (!response.ok || !payload.data) {
      throw new Error(payload.error || 'Unable to sync room presence.')
    }

    applyMatchSnapshot(payload.data)
    return payload.data
  }, [applyMatchSnapshot, match.id])

  async function playMove(cellIndex: number) {
    setBusyCellIndex(cellIndex)
    setError(null)

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ cellIndex }),
      })
      const payload = (await response.json()) as MatchActionResponse

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || 'Unable to play this move.')
      }

      applyMatchSnapshot(payload.data)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to play this move.')
    } finally {
      setBusyCellIndex(null)
    }
  }

  async function requestRematch() {
    setBusyAction('rematch')
    setError(null)

    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ type: 'rematch' }),
      })
      const payload = (await response.json()) as MatchActionResponse

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || 'Unable to request a rematch.')
      }

      applyMatchSnapshot(payload.data)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to request a rematch.')
    } finally {
      setBusyAction(null)
    }
  }

  async function exitRoom() {
    setBusyAction('exit')
    setError(null)

    try {
      const response = await fetch('/api/lobbies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ type: 'leave-lobby' }),
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to leave the current room.')
      }

      router.replace('/games')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to leave the current room.'
      )
    } finally {
      setBusyAction(null)
    }
  }

  async function returnToLobby() {
    setBusyAction('return')
    setError(null)

    try {
      const response = await fetch('/api/lobbies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ type: 'return-to-lobby' }),
      })
      const payload = (await response.json()) as LobbyActionResponse

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to return the party to the lobby.')
      }

      router.replace('/games')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to return the party to the lobby.'
      )
    } finally {
      setBusyAction(null)
    }
  }

  useEffect(() => {
    const refreshLobbyStateTimer = window.setTimeout(() => {
      void refreshLobbyState().catch(() => {
        setLobbyState(null)
      })
    }, 0)

    return () => {
      window.clearTimeout(refreshLobbyStateTimer)
    }
  }, [refreshLobbyState])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setClockTick(Date.now())
    }, 0)

    const tickTimer = window.setInterval(() => {
      setClockTick(Date.now())
    }, 1000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(tickTimer)
    }
  }, [])

  useEffect(() => {
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

      const websocket = new WebSocket(getRealtimeWebSocketUrl())
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
          return
        }

        if (message.type === 'lobby_updated') {
          setLobbyState({
            isOwner: message.lobby.isOwner,
            currentMatchId: message.lobby.currentMatchId,
          })

          if (!message.lobby.currentMatchId || message.lobby.currentMatchId !== match.id) {
            router.replace('/games')
          }

          return
        }

        if (message.type === 'match_updated' && message.match.id === match.id) {
          applyMatchSnapshot(message.match)
          return
        }

        if (message.type === 'match_ready' && message.match.id === match.id) {
          applyMatchSnapshot(message.match)
          return
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
  }, [applyMatchSnapshot, match.id, router])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void syncMatchPresence().catch(syncError => {
        if (syncError instanceof Error && syncError.message === 'Match not found.') {
          router.replace('/games')
        }
      })
    }, 0)

    const heartbeatTimer = window.setInterval(() => {
      void syncMatchPresence().catch(syncError => {
        if (syncError instanceof Error && syncError.message === 'Match not found.') {
          router.replace('/games')
        }
      })
    }, 3000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(heartbeatTimer)
    }
  }, [router, syncMatchPresence])

  useEffect(() => {
    const pollTimer = window.setInterval(() => {
      void (async () => {
        try {
          await refreshMatch()
        } catch {
          // Realtime is primary; polling is a quiet fallback.
        }
      })()
    }, 10000)

    return () => {
      window.clearInterval(pollTimer)
    }
  }, [refreshMatch])

  const ticTacToe = match.ticTacToe
  const currentTurnUserId = ticTacToe?.currentTurnUserId || null
  const winnerUserId = ticTacToe?.winnerUserId || null
  const viewerMark = ticTacToe?.marksByUserId[currentUserId] || null
  const currentTurnPlayer =
    match.players.find(player => player.user.id === currentTurnUserId) || null
  const winnerPlayer = match.players.find(player => player.user.id === winnerUserId) || null
  const isOverlayOpen = match.status === 'finished' && !isOverlayMinimized
  const isViewerTurn = Boolean(currentTurnUserId && currentUserId === currentTurnUserId)
  const canPlay = Boolean(ticTacToe && match.status === 'active' && isViewerTurn)
  const rematchRequestedUserIds = ticTacToe?.rematchRequestedUserIds || []
  const hasViewerRequestedRematch = rematchRequestedUserIds.includes(currentUserId)
  const rematchReadyCount = rematchRequestedUserIds.length
  const rematchNeededCount = match.players.length
  const canRequestRematch = Boolean(
    ticTacToe && match.status === 'finished' && !hasViewerRequestedRematch
  )
  const elapsedLabel = formatElapsedTime(
    Math.max((clockTick || Date.parse(match.startedAt)) - Date.parse(match.startedAt), 0)
  )
  const isWaitingForOpponent = Boolean(ticTacToe && match.status === 'active' && !isViewerTurn)
  const lastMover =
    match.players.find(player => player.user.id === ticTacToe?.lastMoveByUserId) || null
  const canReturnToLobby = Boolean(
    match.status === 'finished' &&
    lobbyState?.isOwner &&
    (!lobbyState.currentMatchId || lobbyState.currentMatchId === match.id)
  )
  const resultLabel = winnerPlayer
    ? `${winnerPlayer.user.inGameName} wins`
    : ticTacToe?.isDraw
      ? 'Draw game'
      : 'Match complete'
  const viewerOutcome = ticTacToe?.isDraw
    ? 'draw'
    : winnerUserId === currentUserId
      ? 'victory'
      : 'defeat'
  const turnLabel =
    match.status === 'finished'
      ? resultLabel
      : isViewerTurn
        ? 'Your turn'
        : currentTurnPlayer
          ? `${currentTurnPlayer.user.inGameName}'s turn`
          : 'Waiting for turn'

  return (
    <div className="relative overflow-hidden rounded-4xl border border-orange-100 bg-[radial-gradient(circle_at_top,#fff7ed,transparent_38%),linear-gradient(180deg,#fffdf8_0%,#fff7ed_100%)] shadow-[0_28px_90px_rgba(115,66,0,0.1)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-16 h-48 w-48 rounded-full bg-orange-200/35 blur-3xl" />
        <div className="absolute -right-10 bottom-10 h-56 w-56 rounded-full bg-amber-200/30 blur-3xl" />
      </div>

      <button
        type="button"
        onClick={() => void exitRoom()}
        disabled={busyAction === 'exit'}
        className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/80 bg-white/90 text-stone-500 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm transition hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60 sm:right-6 sm:top-6"
        aria-label={busyAction === 'exit' ? 'Leaving room' : 'Exit room'}
      >
        <HiOutlineXMark className="h-5 w-5" />
      </button>

      <div className="relative z-10 flex min-h-[calc(100vh-9rem)] flex-col px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 pr-14 sm:pr-18">
          {match.players.map(player => {
            const isTurn = player.user.id === currentTurnUserId && match.status === 'active'
            const isWinner = player.user.id === winnerUserId
            const isViewer = player.user.id === currentUserId

            return (
              <div
                key={player.user.id}
                className={`flex items-center gap-3 rounded-full border px-3 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm transition ${
                  isTurn
                    ? 'border-emerald-300 bg-emerald-50/95'
                    : isWinner
                      ? 'border-amber-300 bg-amber-50/95'
                      : 'border-white/70 bg-white/85'
                }`}
              >
                <div className="rounded-full border border-white bg-white p-1">
                  <Image
                    src={player.user.avatarUrl}
                    alt={`${player.user.inGameName} avatar`}
                    width={44}
                    height={44}
                    className="h-11 w-11 object-cover p-1"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        player.isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      aria-label={
                        player.isConnected ? 'Connected to room' : 'Disconnected from room'
                      }
                    />
                    <p className="truncate text-sm font-semibold text-stone-950">
                      {player.user.inGameName}
                      {isViewer ? ' (You)' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <span className="inline-flex items-center justify-center text-stone-700">
                      {ticTacToe?.marksByUserId[player.user.id] ? (
                        <TicTacToeMarkGlyph
                          mark={ticTacToe.marksByUserId[player.user.id]}
                          size="badge"
                        />
                      ) : (
                        '-'
                      )}
                    </span>
                    <span className="text-stone-300">/</span>
                    <span>
                      {isWinner
                        ? 'Winner'
                        : isTurn
                          ? 'Turn'
                          : player.isConnected
                            ? 'In room'
                            : 'Away'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/90 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
              <HiOutlineClock className="h-4 w-4 text-orange-500" />
              {elapsedLabel}
            </div>
            <span className="h-1 w-1 rounded-full bg-stone-300" />
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  match.status === 'finished'
                    ? 'bg-amber-400'
                    : isViewerTurn
                      ? 'animate-pulse bg-emerald-500'
                      : 'animate-pulse bg-orange-400'
                }`}
              />
              {turnLabel}
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="relative w-full max-w-132">
            <div className="grid grid-cols-3 gap-3 rounded-4xl bg-stone-950 p-3 shadow-[0_28px_80px_rgba(15,23,42,0.26)] sm:gap-4 sm:p-5">
              {ticTacToe?.board.map((cell, cellIndex) => {
                const isWinningCell = ticTacToe.winningLine?.includes(cellIndex) || false
                const isBusy = busyCellIndex === cellIndex
                const isDisabled = !canPlay || Boolean(cell) || isBusy

                return (
                  <button
                    key={cellIndex}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => void playMove(cellIndex)}
                    className={`aspect-square rounded-[1.4rem] border transition duration-200 ${
                      isWinningCell
                        ? 'border-amber-300 bg-amber-200 text-stone-950 shadow-[0_0_30px_rgba(251,191,36,0.35)]'
                        : cell
                          ? 'border-white/10 bg-white/8 text-white'
                          : 'border-white/10 bg-white text-stone-950 hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-orange-50'
                    } disabled:cursor-not-allowed disabled:opacity-100`}
                  >
                    <span className="flex h-full w-full items-center justify-center">
                      {isBusy ? '…' : renderTicTacToeMark(cell)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="pointer-events-none absolute inset-x-0 -bottom-12 flex justify-center px-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/92 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-600 shadow-[0_12px_32px_rgba(15,23,42,0.1)] backdrop-blur-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    match.status === 'finished'
                      ? 'bg-amber-400'
                      : isViewerTurn
                        ? 'animate-pulse bg-emerald-500'
                        : 'animate-pulse bg-orange-400'
                  }`}
                />
                {match.status === 'finished'
                  ? resultLabel
                  : isWaitingForOpponent
                    ? lastMover
                      ? `${lastMover.user.inGameName} played`
                      : 'Opponent thinking'
                    : 'Place your mark'}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="absolute bottom-4 left-4 z-20 rounded-full border border-rose-200 bg-white/95 px-4 py-2 text-sm font-medium text-rose-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm">
            {error}
          </div>
        ) : null}

        {realtimeError ? (
          <div className="absolute bottom-4 right-4 z-20 rounded-full border border-amber-200 bg-white/95 px-4 py-2 text-sm font-medium text-amber-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm">
            {realtimeError}
          </div>
        ) : null}
        {match.status === 'finished' && !isOverlayOpen ? (
          <button
            type="button"
            onClick={() => setIsOverlayMinimized(false)}
            className="absolute bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-4 py-2 text-sm font-semibold text-stone-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm transition hover:text-stone-950"
          >
            <HiOutlineChevronUp className="h-4 w-4" />
            Match overlay
          </button>
        ) : null}

        {match.status === 'finished' && isOverlayOpen ? (
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 sm:inset-0 sm:items-center">
            <MatchResultOverlay
              outcome={viewerOutcome}
              winnerPlayers={winnerPlayer ? [winnerPlayer.user] : []}
              winnerLabel={winnerPlayer ? winnerPlayer.user.inGameName : 'No winner'}
              onClose={() => setIsOverlayMinimized(true)}
              stats={[
                {
                  label: 'Rematch votes',
                  value: `${rematchReadyCount}/${rematchNeededCount}`,
                  tone: 'amber',
                },
                {
                  label: 'Your marker',
                  value: viewerMark ? (
                    <span className="inline-flex items-center justify-center text-stone-950">
                      <TicTacToeMarkGlyph mark={viewerMark} size="stat" />
                    </span>
                  ) : (
                    '-'
                  ),
                  tone: 'stone',
                },
              ]}
              actions={[
                {
                  key: 'rematch',
                  label: hasViewerRequestedRematch ? 'Rematch requested' : 'Request rematch',
                  busyLabel: 'Syncing...',
                  icon: hasViewerRequestedRematch ? (
                    <HiOutlineCheck className="h-4 w-4" />
                  ) : (
                    <HiOutlineSparkles className="h-4 w-4" />
                  ),
                  onClick: () => void requestRematch(),
                  disabled: !canRequestRematch,
                  busy: busyAction === 'rematch',
                  tone: 'primary',
                },
                ...(canReturnToLobby
                  ? [
                      {
                        key: 'return',
                        label: 'Return to lobby',
                        busyLabel: 'Returning...',
                        icon: <HiOutlineBolt className="h-4 w-4" />,
                        onClick: () => void returnToLobby(),
                        busy: busyAction === 'return',
                        tone: 'secondary' as const,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
