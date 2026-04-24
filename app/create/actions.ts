'use server'

import profileIcons from '@/data/profileIcons'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

export type CreateProfileFormState = {
  formError?: string
  fieldErrors?: {
    inGameName?: string
    tag?: string
    avatarUrl?: string
  }
}

const allowedAvatarUrls = new Set(profileIcons.map(icon => icon.src))

export async function completeOnboarding(
  _prevState: CreateProfileFormState,
  formData: FormData
): Promise<CreateProfileFormState> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  const inGameName = String(formData.get('inGameName') ?? '').trim()
  const tag = String(formData.get('tag') ?? '')
    .trim()
    .toUpperCase()
  const avatarUrl = String(formData.get('avatarUrl') ?? '').trim()

  const fieldErrors: CreateProfileFormState['fieldErrors'] = {}

  if (!inGameName) {
    fieldErrors.inGameName = 'Enter an in-game name.'
  } else if (inGameName.length > 32) {
    fieldErrors.inGameName = 'The in-game name cannot exceed 32 characters.'
  }

  if (!tag) {
    fieldErrors.tag = 'Enter a tag.'
  } else if (tag.length > 5) {
    fieldErrors.tag = 'The tag cannot exceed 5 characters.'
  } else if (!/^[A-Z0-9]+$/.test(tag)) {
    fieldErrors.tag = 'Use only uppercase letters and numbers.'
  }

  if (!allowedAvatarUrls.has(avatarUrl)) {
    fieldErrors.avatarUrl = 'Choose one of the available profile icons.'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  const duplicateProfile = await prisma.user.findFirst({
    where: {
      inGameName,
      tag,
      NOT: {
        id: session.user.id,
      },
    },
    select: {
      id: true,
    },
  })

  if (duplicateProfile) {
    return {
      formError: 'This in-game name and tag are already in use.',
    }
  }

  try {
    await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        inGameName,
        tag,
        avatarUrl,
        onboardingCompleted: true,
      },
    })
  } catch {
    return {
      formError: 'The profile could not be saved. Try again.',
    }
  }

  redirect('/')
}
