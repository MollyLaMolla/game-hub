'use client'
import { FcGoogle } from 'react-icons/fc'
import { signIn } from 'next-auth/react'

export default function GoogleLogBtn() {
  return (
    <button
      onClick={() => signIn('google')}
      className="inline-flex items-center justify-center gap-3 rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(249,115,22,0.28)] transition hover:bg-orange-600"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
        <FcGoogle className="h-4 w-4" />
      </span>
      <span>Sign in with Google</span>
    </button>
  )
}
