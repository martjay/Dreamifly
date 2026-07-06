'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useUserSummary } from '@/contexts/UserSummaryContext'

interface AvatarContextType {
  avatar: string
  nickname: string
  avatarFrameId: number | null
  setAvatar: (avatar: string) => void
  setNickname: (nickname: string) => void
  setAvatarFrameId: (frameId: number | null) => void
  updateAvatar: (newAvatar: string) => void
  updateNickname: (newNickname: string) => void
  updateProfile: (avatar: string, nickname: string) => void
}

const AvatarContext = createContext<AvatarContextType | undefined>(undefined)

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { summary, isLoading } = useUserSummary()
  const summaryUser = summary?.user
  const [avatar, setAvatar] = useState('/images/default-avatar.svg')
  const [nickname, setNickname] = useState('')
  const [avatarFrameId, setAvatarFrameId] = useState<number | null>(null)

  useEffect(() => {
    if (isLoading) return

    if (summaryUser) {
      setAvatar(summaryUser.avatar || '/images/default-avatar.svg')
      setNickname(summaryUser.nickname || summaryUser.name || '')
      setAvatarFrameId(summaryUser.avatarFrameId ?? null)
    } else {
      setAvatar('/images/default-avatar.svg')
      setNickname('')
      setAvatarFrameId(null)
    }
  }, [
    isLoading,
    summaryUser,
  ])

  // 更新头像的方法
  const updateAvatar = (newAvatar: string) => {
    setAvatar(newAvatar)
  }

  // 更新昵称的方法
  const updateNickname = (newNickname: string) => {
    console.log('AvatarContext: Updating nickname to:', newNickname)
    setNickname(newNickname)
  }

  // 同时更新头像和昵称的方法
  const updateProfile = (newAvatar: string, newNickname: string) => {
    setAvatar(newAvatar)
    setNickname(newNickname)
  }


  return (
    <AvatarContext.Provider value={{ 
      avatar, 
      nickname,
      avatarFrameId,
      setAvatar, 
      setNickname,
      setAvatarFrameId,
      updateAvatar, 
      updateNickname, 
      updateProfile 
    }}>
      {children}
    </AvatarContext.Provider>
  )
}

export function useAvatar() {
  const context = useContext(AvatarContext)
  if (context === undefined) {
    throw new Error('useAvatar must be used within an AvatarProvider')
  }
  return context
}
