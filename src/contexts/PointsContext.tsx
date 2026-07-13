'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useUserSummary } from '@/contexts/UserSummaryContext'

interface PointsContextType {
  pointsBalance: number | null
  isLoading: boolean
  refreshPoints: () => Promise<void>
}

const PointsContext = createContext<PointsContextType | undefined>(undefined)

export function PointsProvider({ children }: { children: ReactNode }) {
  const { pointsBalance, isLoading, refreshSummary } = useUserSummary()

  const refreshPoints = async () => {
    await refreshSummary()
  }

  return (
    <PointsContext.Provider value={{ pointsBalance, isLoading, refreshPoints }}>
      {children}
    </PointsContext.Provider>
  )
}

export function usePoints() {
  const context = useContext(PointsContext)
  if (context === undefined) {
    throw new Error('usePoints must be used within a PointsProvider')
  }
  return context
}

