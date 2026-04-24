'use client'

import Image from 'next/image'
import { useActionState, useEffect, useRef, useState } from 'react'
import { FiEdit3 } from 'react-icons/fi'
import { HiOutlineXMark } from 'react-icons/hi2'
import type { ProfileIconOption } from '@/data/profileIcons'
import type {
  AccountAvatarFormState,
  AccountIdentityFormState,
  DeleteAccountFormState,
} from './actions'

function SaveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
    >
      {label}
    </button>
  )
}

export default function AccountProfileForm({
  currentAvatarUrl,
  currentInGameName,
  currentTag,
  deleteAction,
  identityAction,
  icons,
  updateAvatarAction,
}: {
  currentAvatarUrl: string
  currentInGameName: string
  currentTag: string
  deleteAction: (state: DeleteAccountFormState) => Promise<DeleteAccountFormState>
  identityAction: (
    state: AccountIdentityFormState,
    formData: FormData
  ) => Promise<AccountIdentityFormState>
  icons: ProfileIconOption[]
  updateAvatarAction: (
    state: AccountAvatarFormState,
    formData: FormData
  ) => Promise<AccountAvatarFormState>
}) {
  const [identityState, identityFormAction, isIdentityPending] = useActionState(identityAction, {
    fieldErrors: {},
  })
  const [avatarState, avatarFormAction, isAvatarPending] = useActionState(updateAvatarAction, {
    fieldErrors: {},
  })
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(deleteAction, {})
  const [committedAvatarUrl, setCommittedAvatarUrl] = useState(currentAvatarUrl)
  const [committedTag, setCommittedTag] = useState(currentTag)
  const [committedInGameName, setCommittedInGameName] = useState(currentInGameName)
  const [selectedIcon, setSelectedIcon] = useState(currentAvatarUrl)
  const [tag, setTag] = useState(currentTag)
  const [inGameName, setInGameName] = useState(currentInGameName)
  const [isEditingIdentity, setIsEditingIdentity] = useState(false)
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const wasIdentityPendingRef = useRef(false)
  const wasAvatarPendingRef = useRef(false)

  const displayName = committedInGameName || 'Player'
  const displayTag = committedTag ? `#${committedTag}` : '#READY'

  useEffect(() => {
    if (wasIdentityPendingRef.current && !isIdentityPending && identityState.successMessage) {
      const timeoutId = window.setTimeout(() => {
        setCommittedInGameName(inGameName)
        setCommittedTag(tag)
        setIsEditingIdentity(false)
      }, 0)

      wasIdentityPendingRef.current = isIdentityPending

      return () => window.clearTimeout(timeoutId)
    }

    wasIdentityPendingRef.current = isIdentityPending
  }, [identityState.successMessage, inGameName, isIdentityPending, tag])

  useEffect(() => {
    if (wasAvatarPendingRef.current && !isAvatarPending && avatarState.successMessage) {
      const timeoutId = window.setTimeout(() => {
        setCommittedAvatarUrl(selectedIcon)
        setIsAvatarModalOpen(false)
      }, 0)

      wasAvatarPendingRef.current = isAvatarPending

      return () => window.clearTimeout(timeoutId)
    }

    wasAvatarPendingRef.current = isAvatarPending
  }, [avatarState.successMessage, isAvatarPending, selectedIcon])

  const toggleIdentityEdit = () => {
    if (isIdentityPending) {
      return
    }

    if (isEditingIdentity) {
      setInGameName(committedInGameName)
      setTag(committedTag)
      setIsEditingIdentity(false)
      return
    }

    setInGameName(committedInGameName)
    setTag(committedTag)
    setIsEditingIdentity(true)
  }

  const openAvatarModal = () => {
    setSelectedIcon(committedAvatarUrl)
    setIsAvatarModalOpen(true)
  }

  const closeAvatarModal = () => {
    if (!isAvatarPending) {
      setSelectedIcon(committedAvatarUrl)
      setIsAvatarModalOpen(false)
    }
  }

  return (
    <div className="space-y-6 h-full">
      <section className="rounded-4xl border border-orange-100 bg-white p-8 lg:p-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
              Player card
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-stone-900">Name and tag</h2>
            <p className="mt-3 text-sm leading-7 text-stone-500">
              Keep these visible so friends can search and add you, then edit only when you want to
              change your public player ID.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleIdentityEdit}
            className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
          >
            <FiEdit3 className="h-4 w-4" />
            {isEditingIdentity ? 'Cancel' : 'Edit'}
          </button>
        </div>

        <form action={identityFormAction} className="mt-8 space-y-6">
          {!isEditingIdentity ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">In-game name</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{displayName}</p>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Tag</p>
                <p className="mt-2 text-2xl font-semibold uppercase text-orange-600">
                  {displayTag}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-[1.4fr_0.8fr] sm:items-start">
              <div className="space-y-2">
                <label htmlFor="inGameName" className="text-sm font-medium text-stone-800">
                  In-game name
                </label>
                <input
                  id="inGameName"
                  name="inGameName"
                  type="text"
                  maxLength={32}
                  required
                  autoComplete="off"
                  value={inGameName}
                  onChange={event => setInGameName(event.target.value.slice(0, 32))}
                  placeholder="Player123"
                  className="w-full rounded-3xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-orange-500 focus:bg-white"
                />
                <p className="text-xs text-stone-500">Maximum 32 characters.</p>
                {identityState.fieldErrors?.inGameName ? (
                  <p className="text-sm text-red-600">{identityState.fieldErrors.inGameName}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="tag" className="text-sm font-medium text-stone-800">
                  Tag
                </label>
                <input
                  id="tag"
                  name="tag"
                  type="text"
                  maxLength={5}
                  required
                  autoComplete="off"
                  value={tag}
                  onChange={event => {
                    const nextValue = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
                    setTag(nextValue.slice(0, 5))
                  }}
                  placeholder="EUW1"
                  className="w-full rounded-3xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 uppercase outline-none transition focus:border-orange-500 focus:bg-white"
                />
                <p className="text-xs text-stone-500">Uppercase letters and numbers only, max 5.</p>
                {identityState.fieldErrors?.tag ? (
                  <p className="text-sm text-red-600">{identityState.fieldErrors.tag}</p>
                ) : null}
              </div>
            </div>
          )}

          {identityState.formError ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {identityState.formError}
            </div>
          ) : null}

          {identityState.successMessage ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {identityState.successMessage}
            </div>
          ) : null}

          {isEditingIdentity ? (
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <p className="text-sm text-stone-500">
                Save only when you really want to update your public friend code.
              </p>
              <div className="w-full sm:max-w-56">
                <SaveButton label="Save name and tag" />
              </div>
            </div>
          ) : null}

          {isIdentityPending ? (
            <p className="text-sm text-stone-500">Saving name and tag...</p>
          ) : null}
        </form>
      </section>

      <section className="rounded-4xl border border-orange-100 bg-white p-8 lg:p-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
              Avatar
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-stone-900">Profile icon</h2>
            <p className="mt-3 text-sm leading-7 text-stone-500">
              Click the current icon to open the full gallery and choose a new one.
            </p>
          </div>

          <button
            type="button"
            onClick={openAvatarModal}
            className="group relative rounded-full border p-1 border-orange-200 bg-orange-50 transition hover:border-orange-300 hover:bg-orange-100"
            aria-label="Change avatar"
          >
            <Image
              src={committedAvatarUrl}
              alt="Current avatar"
              width={88}
              height={88}
              className="min-h-22 min-w-22 object-cover p-2"
            />
            <span className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-full bg-white/0 opacity-0 transition duration-200 group-hover:bg-white/28 group-hover:opacity-100 group-focus-visible:bg-white/28 group-focus-visible:opacity-100">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/55 text-stone-700 backdrop-blur-sm">
                <FiEdit3 className="h-8 w-8" />
              </span>
            </span>
          </button>
        </div>

        {avatarState.formError ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {avatarState.formError}
          </div>
        ) : null}

        {avatarState.successMessage ? (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {avatarState.successMessage}
          </div>
        ) : null}
      </section>

      <section className="rounded-4xl border border-red-200 bg-red-50/70 p-5 lg:px-6 lg:py-5">
        <form
          action={deleteFormAction}
          onSubmit={event => {
            if (!window.confirm('Do you really want to delete your account permanently?')) {
              event.preventDefault()
            }
          }}
          className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
            Danger zone
          </p>
          <button
            type="submit"
            disabled={isDeletePending}
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isDeletePending ? 'Deleting account...' : 'Delete account'}
          </button>
        </form>

        {deleteState.formError ? (
          <div className="mt-4 rounded-3xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
            {deleteState.formError}
          </div>
        ) : null}
      </section>

      {isAvatarModalOpen ? (
        <div className="fixed inset-0 z-50 flex min-h-dvh flex-col bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-b border-orange-100 px-6 py-5 sm:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
                Avatar gallery
              </p>
              <h3 className="mt-2 text-3xl font-semibold text-stone-900">
                Choose your profile icon
              </h3>
            </div>
            <button
              type="button"
              onClick={closeAvatarModal}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-orange-300 hover:text-orange-600"
              aria-label="Close avatar picker"
            >
              <HiOutlineXMark className="h-6 w-6" />
            </button>
          </div>

          <form
            action={avatarFormAction}
            className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col px-6 py-6 sm:px-8"
          >
            <div className="mb-6 flex items-center gap-4 rounded-4xl border border-orange-100 bg-orange-50 p-5">
              <div className="rounded-full bg-white shadow-sm flex items-center justify-center p-4">
                <Image
                  src={selectedIcon}
                  alt="Selected avatar preview"
                  width={88}
                  height={88}
                  className="h-22 w-22 object-cover"
                />
              </div>
              <div>
                <p className="text-sm text-stone-500">Selected icon</p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">{displayName}</p>
                <p className="mt-1 text-md font-medium uppercase tracking-[0.18em] text-orange-600">
                  {displayTag}
                </p>
              </div>
            </div>

            <input type="hidden" name="avatarUrl" value={selectedIcon} />

            <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 overflow-y-auto pr-1 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {icons.map(icon => {
                const isSelected = selectedIcon === icon.src

                return (
                  <button
                    key={icon.id}
                    type="button"
                    onClick={() => setSelectedIcon(icon.src)}
                    className={`rounded-4xl border p-3 transition ${
                      isSelected
                        ? 'border-orange-500 bg-orange-100 shadow-[0_0_0_3px_rgba(249,115,22,0.16)]'
                        : 'border-stone-200 bg-white hover:border-orange-300 hover:bg-orange-50'
                    }`}
                    aria-pressed={isSelected}
                    aria-label={`Select ${icon.alt}`}
                  >
                    <Image
                      src={icon.src}
                      alt={icon.alt}
                      width={72}
                      height={72}
                      className="mx-auto h-18 w-18 object-cover"
                    />
                  </button>
                )
              })}
            </div>

            {avatarState.fieldErrors?.avatarUrl ? (
              <p className="mt-4 text-sm text-red-600">{avatarState.fieldErrors.avatarUrl}</p>
            ) : null}

            <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-orange-100 pt-6 sm:flex-row sm:items-center">
              <p className="text-sm text-stone-500">
                Your avatar updates separately from your name and tag.
              </p>
              <div className="flex w-full gap-3 sm:w-auto">
                <button
                  type="button"
                  onClick={closeAvatarModal}
                  className="inline-flex w-full items-center justify-center rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-orange-300 hover:text-orange-600 sm:w-auto"
                >
                  Cancel
                </button>
                <div className="w-full sm:w-56">
                  <SaveButton label="Save avatar" />
                </div>
              </div>
            </div>

            {isAvatarPending ? (
              <p className="mt-4 text-sm text-stone-500">Saving avatar...</p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}
