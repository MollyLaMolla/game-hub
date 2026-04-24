'use client'
import { CiLogout } from 'react-icons/ci'
import { signOut } from 'next-auth/react'

export default function LogoutBtn() {
  return (
    <button
      onClick={() => signOut()}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
    >
      <CiLogout className="h-5 w-5" />
      <span>Logout</span>
    </button>
  )
}
