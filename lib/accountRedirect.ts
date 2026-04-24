import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { redirect } from 'next/navigation'

export default async function AccountRedirect(from?: string) {
  const session = await getServerSession(authOptions)
  if (from === undefined) {
    return
  }
  if (session?.user?.onboardingCompleted === false && from !== '/create') {
    redirect('/create')
  }
  if (!session && from !== '/login') {
    redirect('/login')
  }
  if (session?.user?.onboardingCompleted === true && from === '/create') {
    redirect('/')
  }
  if (session && from === '/login') {
    redirect('/')
  }
}
