import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import type { MatchActionResponse } from '@/lib/lobbies-shared'
import {
  getMatchParticipantUserIds,
  makeTicTacToeMove,
  requestTicTacToeRematch,
} from '@/lib/matches'
import { emitRealtimeToUser } from '@/lib/realtime-bridge.mjs'

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' } satisfies MatchActionResponse, { status: 401 })
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return unauthorizedResponse()
  }

  const body = (await request.json().catch(() => null)) as
    | { type?: 'move'; cellIndex?: number }
    | { type: 'rematch' }
    | null

  const { matchId } = await params

  try {
    const data =
      body?.type === 'rematch'
        ? await requestTicTacToeRematch(matchId, session.user.id)
        : typeof body?.cellIndex === 'number'
          ? await makeTicTacToeMove(matchId, session.user.id, body.cellIndex)
          : null

    if (!data) {
      return NextResponse.json({ error: 'Missing board cell.' } satisfies MatchActionResponse, {
        status: 400,
      })
    }

    const participantIds = await getMatchParticipantUserIds(matchId)

    for (const participantId of participantIds) {
      emitRealtimeToUser(participantId, {
        type: 'match_updated',
        match: data,
      })
    }

    return NextResponse.json({
      data,
      message: body?.type === 'rematch' ? 'Rematch updated.' : 'Move registered.',
    } satisfies MatchActionResponse)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : body?.type === 'rematch'
              ? 'Unable to update rematch state.'
              : 'Unable to play move.',
      } satisfies MatchActionResponse,
      { status: 400 }
    )
  }
}
