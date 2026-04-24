import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getMatchSnapshot } from '@/lib/matches'
import type { MatchActionResponse } from '@/lib/lobbies-shared'

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' } satisfies MatchActionResponse, { status: 401 })
}

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return unauthorizedResponse()
  }

  const { matchId } = await params

  try {
    const data = await getMatchSnapshot(matchId, session.user.id)
    return NextResponse.json({ data } satisfies MatchActionResponse)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load match.',
      } satisfies MatchActionResponse,
      { status: 400 }
    )
  }
}
