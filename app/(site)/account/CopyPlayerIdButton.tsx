'use client'

import { useState } from 'react'
import { HiOutlineCheck, HiOutlineClipboardDocument } from 'react-icons/hi2'

export default function CopyPlayerIdButton({ playerId }: { playerId: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(playerId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-w-24.5 items-center gap-1 rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
      aria-label={`Copy player id ${playerId}`}
    >
      {copied ? (
        <HiOutlineCheck className="h-4 w-4" />
      ) : (
        <HiOutlineClipboardDocument className="h-4 w-4" />
      )}
      {copied ? 'Copied' : 'Copy ID'}
    </button>
  )
}
