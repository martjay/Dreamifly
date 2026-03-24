'use client'


import { createScopedT } from '@/lib/strings'
import { useState, useRef, useEffect } from 'react'
import { useSession, changePassword, signOut } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { ExtendedUser } from '@/types/auth'
import { useAvatar } from '@/contexts/AvatarContext'
import AvatarCropper from '@/components/AvatarCropper'
import AvatarWithFrame from '@/components/AvatarWithFrame'
import { generateDynamicTokenWithServerTime } from '@/utils/dynamicToken'
import { usePoints } from '@/contexts/PointsContext'

export default function ProfilePage() {
  const t = createScopedT('auth')
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const { avatar: globalAvatar, nickname: globalNickname, avatarFrameId, updateProfile, setAvatarFrameId } = useAvatar()
  const { refreshPoints } = usePoints()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState('/images/default-avatar.svg')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Local avatar selection state
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const [isGifFile, setIsGifFile] = useState(false)

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false)

  // Quota state
  const [quota, setQuota] = useState<{
    todayCount: number
    maxDailyRequests: number | null
    isAdmin: boolean
    isPremium: boolean
    isOldUser: boolean
    isActive: boolean
  } | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)

  const [subscription, setSubscription] = useState<{
    isSubscribed: boolean
    planType: string | null
    expiresAt: string | null
  } | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)

  // CDK state
  const [cdkCode, setCdkCode] = useState('')
  const [cdkRedeeming, setCdkRedeeming] = useState(false)
  const [cdkConfig, setCdkConfig] = useState({ userDailyLimit: 5 })
  const [cdkRemainingCount, setCdkRemainingCount] = useState(5)

  // Modal state for CDK redemption result
  const [showCdkResultModal, setShowCdkResultModal] = useState(false)
  const [cdkResult, setCdkResult] = useState<{
    type: 'success' | 'error'
    title: string
    message: string
    packageName?: string
  } | null>(null)

  // Check-in state
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [checkInStatusLoading, setCheckInStatusLoading] = useState(false)
  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [checkInResult, setCheckInResult] = useState<{
    points: number
    expiresInDays: number
    userType: string
    isSubscribed: boolean
  } | null>(null)

  // Avatar frame selection state
  const [showAvatarFrameSelector, setShowAvatarFrameSelector] = useState(false)
  const [availableFrames, setAvailableFrames] = useState<Array<{ id: number; category: string; imageUrl: string | null }>>([])
  const [previewFrameId, setPreviewFrameId] = useState<number | null>(null)
  const [framesLoading, setFramesLoading] = useState(false)


  // 监听session变化，更新用户数据
  useEffect(() => {
    if (session?.user) {
      const user = session.user as ExtendedUser
      setNickname(user.nickname || '')
      setAvatar(user.avatar || '/images/default-avatar.svg')
      setPreviewFrameId(user.avatarFrameId ?? null)
    }
  }, [session])

  // 获取用户可用的头像框列表
  useEffect(() => {
    const fetchAvailableFrames = async () => {
      if (!session?.user) return

      setFramesLoading(true)
      try {
        const user = session.user as ExtendedUser
        const availableFrameIds = user.availableAvatarFrameIds
          ? user.availableAvatarFrameIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
          : []

        // 如果用户没有可用头像框ID列表，则不显示任何头像框选项
        if (availableFrameIds.length === 0) {
          setAvailableFrames([])
          setFramesLoading(false)
          return
        }

        // 获取所有头像框
        const response = await fetch(`/api/avatar-frames?t=${Date.now()}`)
        if (response.ok) {
          const data = await response.json()
          const allFrames = data.frames || []
          
          // 只显示available_avatar_frame_ids字段中允许的头像框
          const frames = allFrames.filter((frame: { id: number }) => availableFrameIds.includes(frame.id))
          
          setAvailableFrames(frames)
        }
      } catch (error) {
        console.error('Error fetching available frames:', error)
      } finally {
        setFramesLoading(false)
      }
    }

    fetchAvailableFrames()
  }, [session])

  // 同步全局头像和昵称状态到本地状态
  useEffect(() => {
    setAvatar(globalAvatar)
  }, [globalAvatar])

  useEffect(() => {
    setNickname(globalNickname)
  }, [globalNickname])

  // 获取今日额度信息
  useEffect(() => {
    const fetchQuota = async () => {
      if (!session?.user) return
      
      setQuotaLoading(true)
      try {
        // 获取动态token（使用服务器时间）
        const token = await generateDynamicTokenWithServerTime()
        
        // 添加时间戳参数以避免缓存
        const response = await fetch(`/api/user/quota?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          setQuota(data)
        }
      } catch (error) {
        console.error('Error fetching quota:', error)
      } finally {
        setQuotaLoading(false)
      }
    }

    fetchQuota()
  }, [session])

  // 获取订阅状态
  useEffect(() => {
    const fetchSubscription = async () => {
      if (!session?.user) return

      setSubscriptionLoading(true)
      try {
        const res = await fetch(`/api/subscription/status?t=${Date.now()}`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setSubscription({
            isSubscribed: Boolean(data.isSubscribed),
            planType: data.subscription?.planType ?? null,
            expiresAt: data.expiresAt ?? null,
          })
        }
      } catch (error) {
        console.error('Error fetching subscription status:', error)
      } finally {
        setSubscriptionLoading(false)
      }
    }

    fetchSubscription()
  }, [session])

  // 检查签到状态 - 页面加载时立即检查
  useEffect(() => {
    const fetchCheckInStatus = async () => {
      if (!session?.user) {
        setCheckedIn(null)
        return
      }

      setCheckInStatusLoading(true)
      try {
        const res = await fetch(`/api/points/check-status?t=${Date.now()}`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          // 确保正确处理返回的checkedIn值
          const isCheckedIn = data.checkedIn === true
          setCheckedIn(isCheckedIn)
          console.log('Check-in status:', isCheckedIn, data)
        } else {
          console.error('Failed to fetch check-in status:', res.status)
          setCheckedIn(false)
        }
      } catch (error) {
        console.error('Error fetching check-in status:', error)
        setCheckedIn(false)
      } finally {
        setCheckInStatusLoading(false)
      }
    }

    // 如果session存在，立即检查；否则等待session加载
    if (session?.user) {
      fetchCheckInStatus()
    } else if (session === null && !isPending) {
      // session已确定不存在
      setCheckedIn(null)
    }
  }, [session, isPending])

  // 加载CDK配置和每日使用情况
  useEffect(() => {
    const loadCdkData = async () => {
      if (!session?.user) return

      try {
        // 加载CDK配置
        const token = await generateDynamicTokenWithServerTime()
        const configResponse = await fetch('/api/cdk/config', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        if (configResponse.ok) {
          const configData = await configResponse.json()
          setCdkConfig(configData.config)
        }

        // 加载用户CDK剩余次数
        await loadCdkRemainingCount()
      } catch (error) {
        console.error('加载CDK数据失败:', error)
      }
    }

    loadCdkData()
  }, [session])

  // 仅在保存成功时通过 updateProfile 同步全局昵称，输入时不实时同步

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400"></div>
      </div>
    )
  }

  if (!session?.user) {
    router.push('/')
    return null
  }

  const user = session.user as ExtendedUser
  const quotaProgress =
    quota?.maxDailyRequests && quota.maxDailyRequests > 0
      ? Math.min(100, Math.round((quota.todayCount / quota.maxDailyRequests) * 100))
      : quota?.maxDailyRequests === 0
        ? 100
        : null

  const userTypeBadge = quota
    ? quota.isAdmin
      ? { label: '管理员', className: 'border-red-200 bg-red-50 text-red-600' }
      : quota.isPremium
        ? { label: '优质用户', className: 'border-amber-200 bg-amber-50 text-amber-700' }
        : quota.isOldUser
          ? { label: '首批用户', className: 'border-blue-200 bg-blue-50 text-blue-700' }
          : { label: '普通用户', className: 'border-gray-200 bg-gray-50 text-gray-600' }
    : null

  const membershipBadge = subscription
    ? subscription.isSubscribed
      ? { label: '会员', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
      : { label: '未订阅', className: 'border-gray-200 bg-gray-50 text-gray-600' }
    : { label: '加载中', className: 'border-white/20 bg-white/10 text-white/80' }

  const showUserTypeBadge =
    userTypeBadge && !(membershipBadge?.label === '会员' && userTypeBadge.label === '普通用户')

  const uidBadge =
    user.uid !== undefined && user.uid !== null
      ? { label: `UID #${user.uid}`, className: 'border-orange-200 bg-orange-50 text-orange-700' }
      : null

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError(t('error.invalidFileType'))
      return
    }

    // Validate file size (10MB for original file, will be compressed after crop)
    if (file.size > 10 * 1024 * 1024) {
      setError(t('error.fileTooLarge'))
      return
    }

    setError('')
    setSuccess('')

    // Check if it's a GIF file
    const isGif = file.type === 'image/gif'
    setIsGifFile(isGif)

    // Revoke previous preview URL if exists
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    if (cropperImageSrc) URL.revokeObjectURL(cropperImageSrc)

    // Create object URL for cropper
    const objectUrl = URL.createObjectURL(file)
    setCropperImageSrc(objectUrl)
    setShowCropper(true)
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = (croppedBlob: Blob) => {
    // Create a File from the Blob
    const fileExtension = isGifFile ? 'gif' : 'jpg'
    const croppedFile = new File([croppedBlob], `avatar.${fileExtension}`, { type: croppedBlob.type })
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(croppedBlob)
    
    // Update states
    setPendingAvatarFile(croppedFile)
    setAvatarPreview(previewUrl)
    setShowCropper(false)
    
    // Clean up cropper image URL
    if (cropperImageSrc) {
      URL.revokeObjectURL(cropperImageSrc)
      setCropperImageSrc(null)
    }
  }

  const handleCropCancel = () => {
    setShowCropper(false)
    
    // Clean up cropper image URL
    if (cropperImageSrc) {
      URL.revokeObjectURL(cropperImageSrc)
      setCropperImageSrc(null)
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSaveProfile = async () => {
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      let avatarUrlToSave = avatar

      // If user selected a new avatar, upload it now
      if (pendingAvatarFile) {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', pendingAvatarFile)
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}))
          const errorMessage = errorData.error || 'Upload failed'
          throw new Error(errorMessage)
        }
        const uploadData = await uploadResponse.json()
        avatarUrlToSave = uploadData.url
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nickname,
          avatar: avatarUrlToSave,
          avatarFrameId: previewFrameId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      // Apply new avatar state and clear pending preview
      setAvatar(avatarUrlToSave)
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarPreview(null)
      setPendingAvatarFile(null)
      
      // 立即更新全局头像和昵称状态
      updateProfile(avatarUrlToSave, nickname)
      
      // 更新全局头像框ID
      setAvatarFrameId(previewFrameId)
      
      setSuccess(t('success.profileUpdated'))
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch (err) {
      console.error('Update error:', err)
      // 显示具体错误消息，如果是审核失败等，会显示服务器返回的具体消息
      const errorMessage = err instanceof Error ? err.message : t('error.updateFailed')
      setError(errorMessage)
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validation
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError(t('error.passwordRequired'))
      return
    }

    if (newPassword.length < 8) {
      setError(t('error.invalidPassword'))
      return
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('error.passwordMismatch'))
      return
    }

    setPasswordLoading(true)

    try {
      await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      })

      setSuccess(t('success.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setShowPasswordForm(false)
    } catch (err) {
      console.error('Password change error:', err)
      setError(t('error.passwordChangeFailed'))
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/')
  }

  const handleCheckIn = async () => {
    if (checkInLoading || checkedIn) return

    setCheckInLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/points/award-daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          manual: true, // 标识这是手动签到请求（新版本前端）
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '签到失败')
      }

      const data = await response.json()
      console.log('Check-in response:', data)
      
      if (data.awarded === true) {
        // 签到成功
        setCheckInResult({
          points: data.points,
          expiresInDays: data.expiresInDays,
          userType: data.userType || 'regular',
          isSubscribed: data.isSubscribed || false,
        })
        setCheckedIn(true)
        // 确保弹窗显示
        setShowCheckInModal(true)
        await refreshPoints()
      } else if (data.success === true && data.awarded === false) {
        // 今日已签到
        setError('今日已签到，请明天再来')
        setCheckedIn(true)
        // 重新检查状态以确保UI同步
        const statusRes = await fetch(`/api/points/check-status?t=${Date.now()}`, {
          credentials: 'include',
        })
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setCheckedIn(statusData.checkedIn === true)
        }
      } else {
        throw new Error(data.error || '签到失败')
      }
    } catch (err) {
      console.error('Check-in error:', err)
      const errorMessage = err instanceof Error ? err.message : '签到失败，请稍后重试'
      setError(errorMessage)
    } finally {
      setCheckInLoading(false)
    }
  }

  // CDK兑换处理函数
  const handleRedeemCDK = async () => {
    if (cdkRedeeming || !cdkCode.trim()) return

    setCdkRedeeming(true)

    try {
      const response = await fetch('/api/cdk/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: cdkCode.trim(),
        }),
      })

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        // JSON解析失败
        console.error('API响应解析失败:', parseError)
        setCdkResult({
          type: 'error',
          title: '兑换失败',
          message: '服务器响应异常，请稍后重试'
        })
        setShowCdkResultModal(true)
        // 即使JSON解析失败，如果请求已发送到服务器，次数可能已消耗，刷新剩余次数
        await loadCdkRemainingCount()
        return
      }

      if (response.ok && data.success) {
        // 兑换成功
        setCdkResult({
          type: 'success',
          title: '兑换成功',
          message: `恭喜您成功兑换 ${data.data?.packageName || '礼包'}！`,
          packageName: data.data?.packageName
        })
        setShowCdkResultModal(true)
        setCdkCode('')

        // 刷新积分和会员状态
        await refreshPoints()

        // 如果兑换的是会员，刷新订阅状态
        if (data.data?.packageType === 'subscription_plan') {
          // 重新获取订阅状态
          try {
            const res = await fetch(`/api/subscription/status?t=${Date.now()}`, {
              credentials: 'include',
            })
            if (res.ok) {
              const subData = await res.json()
              setSubscription({
                isSubscribed: Boolean(subData.isSubscribed),
                planType: subData.subscription?.planType ?? null,
                expiresAt: subData.expiresAt ?? null,
              })
            }
          } catch (error) {
            console.error('Error fetching subscription status:', error)
          }
        }

        // 重新获取CDK剩余次数
        await loadCdkRemainingCount()
      } else {
        // 兑换失败（但次数已经消耗，需要刷新剩余次数）
        const errorMessage = data.error || (response.status === 500 ? '服务器错误，请稍后重试' : '兑换失败')
        setCdkResult({
          type: 'error',
          title: '兑换失败',
          message: errorMessage
        })
        setShowCdkResultModal(true)
        
        // 兑换失败也需要刷新剩余次数（因为次数已经消耗）
        await loadCdkRemainingCount()
      }
    } catch (err) {
      console.error('CDK兑换网络错误:', err)
      setCdkResult({
        type: 'error',
        title: '网络错误',
        message: '网络连接失败，请检查网络后重试'
      })
      setShowCdkResultModal(true)
      
      // 网络错误时，如果请求已发送到服务器，次数可能已消耗，尝试刷新
      // 如果请求未发送，刷新也不会影响（只是多一次请求）
      await loadCdkRemainingCount()
    } finally {
      setCdkRedeeming(false)
    }
  }

  // 加载CDK剩余次数
  const loadCdkRemainingCount = async () => {
    try {
      const response = await fetch('/api/cdk/remaining', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCdkRemainingCount(data.remainingCount)
          // 同时更新配置中的最大限制
          if (data.maxLimit) {
            setCdkConfig({ userDailyLimit: data.maxLimit })
          }
        }
      }
    } catch (error) {
      console.error('加载CDK剩余次数失败:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white">
      <div className="max-w-6xl mx-auto px-4 pb-16 pt-10 lg:pl-48">
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,200,150,0.25),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.05),transparent_40%)]" />
          <div className="relative flex flex-col gap-8 p-8 pt-14 lg:p-10 lg:pt-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-6 lg:flex-nowrap">
              <div className="relative">
                <AvatarWithFrame
                  avatar={avatarPreview || avatar}
                  avatarFrameId={previewFrameId !== null ? previewFrameId : avatarFrameId}
                  size={112}
                  className="ring-4 ring-white/10 shadow-xl shadow-orange-500/20 rounded-full"
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-white" />
                  </div>
                )}
                <button
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="absolute -right-2 -bottom-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/80 text-slate-900 shadow-lg backdrop-blur transition hover:bg-white disabled:opacity-50"
                  aria-label={t('changeAvatar')}
                >
                  <img src="/common/edit.svg" alt="" className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <div className="space-y-2 w-full max-w-4xl">
                <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold leading-tight text-white">
                  <span>{nickname || user.name || user.email}</span>
                  {membershipBadge && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${membershipBadge.className}`}>
                      <img src="/common/crown.svg" alt="" className="h-3 w-3" />
                      {membershipBadge.label}
                    </span>
                  )}
                  {showUserTypeBadge && userTypeBadge && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${quota && !quota.isActive ? 'text-gray-400 line-through border-gray-300 bg-gray-100' : userTypeBadge.className}`}>
                      {userTypeBadge.label}
                    </span>
                  )}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-white/70">
                  <span>{user.email}</span>
                  {uidBadge && (
                    <>
                      <span className="h-4 w-px bg-white/20" aria-hidden="true" />
                      <span className="text-sm text-white/80">{uidBadge.label}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {/* 签到按钮 - 放在header右上角 */}
            {quota?.isActive !== false && (
              <button
                onClick={handleCheckIn}
                disabled={checkInLoading || checkInStatusLoading || checkedIn === null || checkedIn}
                className={`absolute right-5 top-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-white transition ${
                  checkedIn
                    ? 'border-white/30 bg-white/10 cursor-not-allowed opacity-60'
                    : 'border-white/20 bg-white/10 hover:bg-white/20'
                } ${checkInLoading || checkInStatusLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={checkedIn ? '今日已签到' : '点击签到'}
              >
                {checkInLoading || checkInStatusLoading ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : checkedIn ? (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>今日已签</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>每日签到</span>
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
            {success}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <section className="rounded-2xl border border-orange-100/70 bg-white p-6 shadow-xl shadow-orange-500/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">资料</p>
                <h2 className="text-xl font-semibold text-gray-900">基础信息</h2>
                <p className="text-sm text-gray-500">保持公开资料简洁又有态度。</p>
              </div>
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                即时保存
              </span>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">{t('name')}</p>
                <p className="font-semibold text-gray-800">{user.name}</p>
                <p className="text-xs text-gray-400">系统账户名</p>
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                {t('nickname')}
              </label>
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-inner shadow-gray-100/40">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t('nicknamePlaceholder')}
                  className="w-full rounded-lg border border-transparent bg-gray-100 text-gray-900 outline-none placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-orange-200"
                />
                <p className="mt-2 text-xs text-gray-500">昵称将展示在社区与作品页。</p>
              </div>
            </div>

            {/* 更换头像框折叠框 - 仅当用户有可用头像框ID列表时显示 */}
            {(() => {
              const user = session?.user as ExtendedUser | undefined
              const hasAvailableFrames = user?.availableAvatarFrameIds && user.availableAvatarFrameIds.trim() !== ''
              
              if (!hasAvailableFrames) {
                return null
              }

              return (
                <div className="mt-6 rounded-xl border border-gray-200 bg-white">
                  <button
                    onClick={() => setShowAvatarFrameSelector(!showAvatarFrameSelector)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left transition hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">更换头像框</p>
                      <p className="text-xs text-gray-500">选择你喜欢的头像框样式</p>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${showAvatarFrameSelector ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showAvatarFrameSelector && (
                    <div className="border-t border-gray-200 p-4">
                      {framesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-orange-400"></div>
                        </div>
                      ) : availableFrames.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">暂无可用头像框</p>
                      ) : (
                        <div className="space-y-4">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {/* 无头像框选项 */}
                        <button
                          onClick={() => setPreviewFrameId(null)}
                          className={`relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                            previewFrameId === null
                              ? 'border-orange-400 bg-orange-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                            <AvatarWithFrame
                              avatar={avatarPreview || avatar}
                              avatarFrameId={null}
                              size={64}
                            />
                          </div>
                          <span className="text-xs text-gray-600">无头像框</span>
                          {previewFrameId === null && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-orange-400 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>

                        {/* 头像框选项 */}
                        {availableFrames.map((frame) => (
                          <button
                            key={frame.id}
                            onClick={() => setPreviewFrameId(frame.id)}
                            className={`relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                              previewFrameId === frame.id
                                ? 'border-orange-400 bg-orange-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-2 overflow-hidden">
                              {frame.imageUrl ? (
                                <AvatarWithFrame
                                  avatar={avatarPreview || avatar}
                                  avatarFrameId={frame.id}
                                  size={64}
                                />
                              ) : (
                                <AvatarWithFrame
                                  avatar={avatarPreview || avatar}
                                  avatarFrameId={null}
                                  size={64}
                                />
                              )}
                            </div>
                            <span className="text-xs text-gray-600 truncate w-full text-center">ID: {frame.id}</span>
                            {previewFrameId === frame.id && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-orange-400 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        当前预览：{previewFrameId === null ? '无头像框' : `头像框 ID ${previewFrameId}`}
                      </p>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="mt-8">
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-700">💡 头像和头像框更换后记得点击保存同步。</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-400 to-amber-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-400/30 transition hover:from-orange-500 hover:to-amber-500 disabled:opacity-50"
                >
                  {saving && (
                    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {t('saveChanges')}
                </button>
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  🔒 {t('changePassword')}
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-orange-500/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">会员订阅</p>
                  <h3 className="text-lg font-semibold text-gray-900">权益状态</h3>
                  <p className="text-sm text-gray-500">查看你的当前方案与到期时间。</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${membershipBadge.className}`}>
                  {membershipBadge.label}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
                {subscriptionLoading ? (
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    加载订阅信息...
                  </div>
                ) : subscription ? (
                  <div className="space-y-1 text-gray-800">
                    <p className="text-base font-semibold">
                      {subscription.isSubscribed ? '已开通 · ' : '未开通'}
                      {subscription.planType || '默认方案'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {subscription.isSubscribed
                        ? subscription.expiresAt
                          ? `到期时间：${new Date(subscription.expiresAt).toLocaleString()}`
                          : '有效期：暂未获取到到期时间'
                        : '订阅后获得更高算力额度与商用无忧'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">无法加载订阅信息</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-orange-500/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">今日免费额度</p>
                  <h3 className="text-lg font-semibold text-gray-900">调用统计</h3>
                  <p className="text-sm text-gray-500">关注上限，合理分配创作节奏。</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {quota && !quota.isActive && (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      账号已封禁
                    </span>
                  )}
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {quotaLoading ? '加载中' : quota ? '已同步' : '未获取'}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
                {quotaLoading ? (
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    正在读取额度...
                  </div>
                ) : quota ? (
                  <div className="space-y-2 text-gray-800">
                    {!quota.isActive && (
                      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div>
                            <p className="text-sm font-semibold text-red-800">账号已被封禁</p>
                            <p className="text-xs text-red-600">您的账号已被封禁，无法使用生图服务和签到功能。如有疑问，请加群联系管理员。</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className={`text-base font-semibold ${!quota.isActive ? 'text-gray-400 line-through' : ''}`}>
                        {quota.todayCount} / {quota.maxDailyRequests === null ? '∞' : quota.maxDailyRequests}
                      </p>
                      {/* 如果用户是会员，显示会员标识；否则显示用户类型标识 */}
                      {subscription?.isSubscribed ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          <img src="/common/crown.svg" alt="" className="h-3 w-3" />
                          会员
                        </span>
                      ) : (
                        userTypeBadge && (
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${!quota.isActive ? 'text-gray-400 line-through border-gray-300 bg-gray-100' : userTypeBadge.className}`}>
                            {userTypeBadge.label}
                          </span>
                        )
                      )}
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full transition-all ${!quota.isActive ? 'bg-gray-300' : 'bg-gradient-to-r from-orange-400 to-amber-400'}`}
                        style={{
                          width: `${quotaProgress ?? 8}%`,
                          opacity: quotaProgress === null ? 0.3 : 1,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      {quota.maxDailyRequests === null
                        ? '当前为无限制模式，请合理使用算力资源。'
                        : '免费额度达到上限后需等次日刷新，积分可替代额度。'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">无法加载额度信息</p>
                )}
              </div>
            </div>

            {/* 兑换码模块 */}
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-orange-500/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">福利中心</p>
                  <h3 className="text-lg font-semibold text-gray-900">兑换码</h3>
                  <p className="text-sm text-gray-500">输入兑换码，获得积分或会员权益。</p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={cdkCode}
                    onChange={(e) => setCdkCode(e.target.value.toUpperCase())}
                    placeholder="请输入兑换码"
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-3 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    disabled={cdkRedeeming}
                  />
                  <button
                    onClick={handleRedeemCDK}
                    disabled={cdkRedeeming || !cdkCode.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-400 to-amber-400 px-6 py-3 text-sm font-semibold text-white transition hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cdkRedeeming ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        兑换中...
                      </>
                    ) : (
                      '兑换'
                    )}
                  </button>
                </div>

                {/* 每日兑换限制提示 */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-blue-800">
                      今日剩余 {cdkRemainingCount} 次兑换机会（每日最多 {cdkConfig.userDailyLimit} 次） 
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl shadow-orange-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">安全中心</p>
                <h3 className="text-lg font-semibold text-gray-900">{t('changePassword')}</h3>
                <p className="text-sm text-gray-500">定期更换密码，保障账户安全。</p>
              </div>
              <button
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                {showPasswordForm ? '收起' : '展开'}
              </button>
            </div>

            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{t('currentPassword')}</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 pr-10 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label={showCurrentPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showCurrentPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{t('newPassword')}</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 pr-10 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label={showNewPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showNewPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{t('confirmNewPassword')}</label>
                  <div className="relative">
                    <input
                      type={showConfirmNewPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 pr-10 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label={showConfirmNewPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showConfirmNewPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-400 to-amber-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-400/30 transition hover:from-orange-500 hover:to-amber-500 disabled:opacity-50"
                  >
                    {passwordLoading && (
                      <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {t('changePassword')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false)
                      setCurrentPassword('')
                      setNewPassword('')
                      setConfirmNewPassword('')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 hover:border-red-300"
              >
                <span className="h-2 w-2 rounded-full bg-red-500 shadow shadow-red-500/50" />
                {t('logout')}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-orange-50 via-white to-white p-6 shadow-xl shadow-orange-500/5">
            <h3 className="text-lg font-semibold text-gray-900">使用提醒</h3>
            <p className="mt-2 text-sm text-gray-600">
              更换头像支持 JPG、PNG、GIF，建议先裁剪为正方形；保存资料后会即时同步到全局。
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>· 若上传失败，请检查网络或稍后重试。</li>
              <li>· 遇到额度紧张，可考虑升级会员或次日再用。</li>
              <li>· 任何异常请携带 注册邮箱 联系管理员。</li>
            </ul>
          </div>
        </section>
      </div>

      {/* 头像裁剪器 */}
      {showCropper && cropperImageSrc && (
        <AvatarCropper
          imageSrc={cropperImageSrc || ''}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          isGif={isGifFile}
        />
      )}

      {/* 签到成功弹窗 */}
      {showCheckInModal && checkInResult && checkInResult.points > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 relative">
            <button
              aria-label="Close"
              onClick={() => setShowCheckInModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-3 rounded-full bg-orange-100 text-orange-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.7 2.288a1 1 0 01.6 0l7 2.333A1 1 0 0120 5.567v6.933c0 3.831-2.82 7.612-8.423 11.334a1 1 0 01-1.154 0C4.82 20.112 2 16.33 2 12.5V5.567a1 1 0 01.7-.946l7-2.333z" />
                </svg>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-orange-600">
                  {checkInResult?.isSubscribed ? '会员用户' : checkInResult?.userType === 'premium' ? '优质用户' : '欢迎回来'}
                </p>
                <h3 className="text-lg font-bold text-gray-900">
                  今日签到获得 {checkInResult?.points} 积分
                </h3>
                <p className="text-sm text-gray-600">
                  {checkInResult?.isSubscribed ? '每日登录奖励（会员双倍）' : '每日登录奖励'}
                </p>
                <p className="text-sm text-gray-600">
                  有效期为 {checkInResult?.expiresInDays} 天
                </p>
              </div>

              <button
                onClick={() => setShowCheckInModal(false)}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors"
              >
                知道啦
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CDK兑换结果弹窗 */}
      {showCdkResultModal && cdkResult && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 relative">
            <button
              aria-label="Close"
              onClick={() => {
                setShowCdkResultModal(false)
                setCdkResult(null)
              }}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex flex-col items-center gap-4 text-center">
              <div className={`p-3 rounded-full ${cdkResult.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                {cdkResult.type === 'success' ? (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>

              <div className="space-y-2">
                <h3 className={`text-lg font-bold ${cdkResult.type === 'success' ? 'text-emerald-900' : 'text-red-900'}`}>
                  {cdkResult.title}
                </h3>
                <p className={`text-sm ${cdkResult.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {cdkResult.message}
                </p>
                {cdkResult.type === 'success' && cdkResult.packageName && (
                  <p className="text-xs text-gray-500 mt-2">
                    您已成功兑换 &quot;{cdkResult.packageName}&quot;
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  setShowCdkResultModal(false)
                  setCdkResult(null)
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  cdkResult.type === 'success'
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-red-500 text-white hover:bg-red-600'
                }`}
              >
                {cdkResult.type === 'success' ? '太好了' : '知道了'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

