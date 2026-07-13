'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { useSession } from '@/lib/auth-client'
import { generateDynamicTokenWithServerTime } from '@/utils/dynamicToken'

export type UserSummary = {
  success: true
  user: {
    id: string
    email: string
    name: string | null
    image: string | null
    nickname: string | null
    uid: number | null
    avatar: string
    avatarFrameId: number | null
    availableAvatarFrameIds: string | null
    isActive: boolean
    isAdmin: boolean
    isPremium: boolean
    isOldUser: boolean
  }
  points: {
    balance: number
  }
  quota: {
    todayCount: number
    maxDailyRequests: number | null
    isAdmin: boolean
    isPremium: boolean
    isOldUser: boolean
    isActive: boolean
    hasQuota: boolean
  }
  subscription: {
    isSubscribed: boolean
    planType: string | null
    status: string | null
    startedAt: string | null
    expiresAt: string | null
  }
  checkIn: {
    checkedIn: boolean
  }
}

type UserSummaryContextType = {
  summary: UserSummary | null
  isLoading: boolean
  error: string | null
  pointsBalance: number | null
  refreshSummary: () => Promise<UserSummary | null>
}

const UserSummaryContext = createContext<UserSummaryContextType | undefined>(undefined)

export function UserSummaryProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: sessionLoading } = useSession()
  const sessionUserId = session?.user?.id
  const hasSessionUser = Boolean(session?.user)
  const [summary, setSummary] = useState<UserSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inflightRequestRef = useRef<Promise<UserSummary | null> | null>(null)
  const effectiveLoading = sessionLoading || isLoading || Boolean(hasSessionUser && !summary && !error)

  const refreshSummary = useCallback(async () => {
    if (sessionLoading) return null

    if (!sessionUserId) {
      setSummary(null)
      setError(null)
      return null
    }

    if (inflightRequestRef.current) {
      return inflightRequestRef.current
    }

    setIsLoading(true)
    const request = (async () => {
      try {
        const token = await generateDynamicTokenWithServerTime()
        const response = await fetch(`/api/user/summary?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          if (response.status === 401) {
            setSummary(null)
          }
          throw new Error(`Failed to fetch user summary: ${response.status}`)
        }

        const data = await response.json() as UserSummary
        setSummary(data)
        setError(null)
        return data
      } catch (err) {
        console.error('Failed to fetch user summary:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch user summary')
        return null
      } finally {
        setIsLoading(false)
        inflightRequestRef.current = null
      }
    })()

    inflightRequestRef.current = request
    return request
  }, [sessionUserId, sessionLoading])

  useEffect(() => {
    void refreshSummary()
  }, [refreshSummary])

  return (
    <UserSummaryContext.Provider
      value={{
        summary,
        isLoading: effectiveLoading,
        error,
        pointsBalance: summary?.points.balance ?? null,
        refreshSummary,
      }}
    >
      {children}
    </UserSummaryContext.Provider>
  )
}

export function useUserSummary() {
  const context = useContext(UserSummaryContext)
  if (context === undefined) {
    throw new Error('useUserSummary must be used within a UserSummaryProvider')
  }
  return context
}
