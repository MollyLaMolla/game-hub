'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  readPendingLobbyInvite,
  removePendingLobbyInvite,
  type LobbyInviteSummary,
} from '@/lib/friends-shared'

declare global {
  interface Window {
    gameHubMatchmaking?: {
      joinLobbyInvite?: (invite: LobbyInviteSummary) => Promise<void> | void
    }
  }
}

type AutoJoinState =
  | { tone: 'idle'; message: string }
  | { tone: 'info'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }

export default function TicTacToeLobbyAutoJoin() {
  const searchParams = useSearchParams()
  const shouldAutoJoin = searchParams.get('autojoin') === '1'
  const inviteId = searchParams.get('inviteId')
  const invite = shouldAutoJoin && inviteId ? readPendingLobbyInvite(inviteId) : null
  const [state, setState] = useState<AutoJoinState>({
    tone: 'idle',
    message: '',
  })

  useEffect(() => {
    if (!shouldAutoJoin || !invite) {
      return
    }

    window.dispatchEvent(
      new CustomEvent('gamehub:lobby-autojoin', {
        detail: invite,
      })
    )

    const joinLobbyInvite = window.gameHubMatchmaking?.joinLobbyInvite

    if (!joinLobbyInvite) {
      return
    }

    Promise.resolve(joinLobbyInvite(invite))
      .then(() => {
        removePendingLobbyInvite(invite.id)
        setState({
          tone: 'success',
          message: `Joining ${invite.lobbyName} with ${invite.from.inGameName}...`,
        })
      })
      .catch(() => {
        setState({
          tone: 'error',
          message: 'Unable to join the invited lobby right now.',
        })
      })
  }, [invite, shouldAutoJoin])

  if (!shouldAutoJoin) {
    return null
  }

  const hasMatchmakingConnector =
    typeof window !== 'undefined' && Boolean(window.gameHubMatchmaking?.joinLobbyInvite)

  const derivedState = !invite
    ? ({
        tone: 'error',
        message: 'The selected invite is no longer available.',
      } satisfies AutoJoinState)
    : !hasMatchmakingConnector && state.tone === 'idle'
      ? ({
          tone: 'info',
          message:
            'Invite captured. Automatic join will complete as soon as the realtime TicTacToe matchmaking connector is wired.',
        } satisfies AutoJoinState)
      : state.tone === 'idle'
        ? ({
            tone: 'info',
            message: `Preparing automatic join for ${invite.lobbyName}...`,
          } satisfies AutoJoinState)
        : state

  if (!derivedState.message) {
    return null
  }

  const toneClassName =
    derivedState.tone === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : derivedState.tone === 'error'
        ? 'border-rose-100 bg-rose-50 text-rose-700'
        : 'border-orange-100 bg-orange-50 text-orange-700'

  return (
    <div className={`rounded-3xl border px-5 py-4 text-sm font-medium ${toneClassName}`}>
      {derivedState.message}
    </div>
  )
}
