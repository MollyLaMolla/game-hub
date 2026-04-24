import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import type { MatchActionResponse } from '@/lib/lobbies-shared'
import { touchMatchPresence } from '@/lib/matches'

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' } satisfies MatchActionResponse, { status: 401 })
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return unauthorizedResponse()
  }

  const { matchId } = await params

  try {
    const data = await touchMatchPresence(matchId, session.user.id)
    return NextResponse.json({ data } satisfies MatchActionResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync match presence.'
    const status = message === 'Match not found.' ? 404 : 400

    return NextResponse.json({ error: message } satisfies MatchActionResponse, { status })
  }
}
