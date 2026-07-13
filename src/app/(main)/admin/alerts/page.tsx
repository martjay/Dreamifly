'use client'

import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import { transferUrl } from '@/utils/locale'
import { generateDynamicTokenWithServerTime } from '@/utils/dynamicToken'
import Image from 'next/image'
import { useAvatar } from '@/contexts/AvatarContext'
import { ExtendedUser } from '@/types/auth'
import { BellRing, Info, RotateCcw, Save } from 'lucide-react'

type AlertRule = {
  id: string
  modelNames: string[]
  modelTypes: string[]
  minCalls: number
  emails: string[]
  isEnabled: boolean
}

type ModelOption = {
  modelName: string
  displayName: string
  modelType: string
}

type AlertRow = {
  key: string
  id: string | null
  modelName: string
  displayName: string
  modelType: string
  isEnabled: boolean
  consecutiveFailureCount: number | ''
  emails: string
}

const DEFAULT_EMAILS = 'admin@example.com\nops@example.com'

function getModelTypeText(modelType: string) {
  switch (modelType) {
    case 'image_generation':
      return '图片'
    case 'video_generation':
      return '视频'
    case 'moderation':
      return '审核'
    case 'prompt_optimization':
      return '提示词'
    default:
      return modelType
  }
}

function getModelTypeClass(modelType: string) {
  switch (modelType) {
    case 'image_generation':
      return 'bg-blue-50 text-blue-600 ring-blue-200'
    case 'video_generation':
      return 'bg-green-50 text-green-600 ring-green-200'
    case 'moderation':
      return 'bg-violet-50 text-violet-600 ring-violet-200'
    default:
      return 'bg-gray-100 text-gray-600 ring-gray-200'
  }
}

function getDefaultValues(option: ModelOption): Omit<AlertRow, 'key' | 'id' | 'modelName' | 'displayName' | 'modelType'> {
  return {
    isEnabled: false,
    consecutiveFailureCount: option.modelType === 'moderation' ? 10 : 50,
    emails: DEFAULT_EMAILS,
  }
}

function splitEmails(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，;；]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function findModelRule(rules: AlertRule[], option: ModelOption) {
  return rules.find((rule) => {
    const modelNames = rule.modelNames || []
    const modelTypes = rule.modelTypes || []
    return modelNames.length === 1
      && modelNames[0] === option.modelName
      && (modelTypes.length === 0 || modelTypes.includes(option.modelType))
  }) || null
}

function buildRows(modelOptions: ModelOption[], rules: AlertRule[]): AlertRow[] {
  return modelOptions.map((option) => {
    const rule = findModelRule(rules, option)
    const defaults = getDefaultValues(option)

    return {
      key: `${option.modelName}:${option.modelType}`,
      id: rule?.id || null,
      modelName: option.modelName,
      displayName: option.displayName || option.modelName,
      modelType: option.modelType,
      isEnabled: rule?.isEnabled ?? defaults.isEnabled,
      consecutiveFailureCount: rule?.minCalls ?? defaults.consecutiveFailureCount,
      emails: rule?.emails?.join('\n') || defaults.emails,
    }
  })
}

function normalizeNumber(value: number | '') {
  return value === '' ? '' : Number(value)
}

export default function ModelAlertsPage() {
  const { data: session, isPending: sessionLoading } = useSession()
  const { avatar: globalAvatar } = useAvatar()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<AlertRow[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const navbar = document.getElementById('main-nav')
    const footer = document.querySelector('footer')
    const mobileNavbar = document.querySelector('nav')

    if (navbar) navbar.style.display = 'none'
    if (footer) footer.style.display = 'none'
    if (mobileNavbar && mobileNavbar.id !== 'main-nav') {
      const parent = mobileNavbar.closest('.lg\\:hidden') as HTMLElement | null
      if (parent) parent.style.display = 'none'
    }

    return () => {
      if (navbar) navbar.style.display = ''
      if (footer) footer.style.display = ''
      if (mobileNavbar && mobileNavbar.id !== 'main-nav') {
        const parent = mobileNavbar.closest('.lg\\:hidden') as HTMLElement | null
        if (parent) parent.style.display = ''
      }
    }
  }, [])

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (sessionLoading) return

      if (!session?.user) {
        router.push(transferUrl('/'))
        return
      }

      try {
        const token = await generateDynamicTokenWithServerTime()
        const response = await fetch('/api/admin/check', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data = await response.json()

        if (data.isAdmin) {
          setIsAdmin(true)
        } else {
          router.push(transferUrl('/'))
        }
      } catch (error) {
        console.error('Failed to check admin status:', error)
        router.push(transferUrl('/'))
      } finally {
        setCheckingAdmin(false)
      }
    }

    checkAdminStatus()
  }, [session, sessionLoading, router])

  const fetchRows = useCallback(async () => {
    if (!isAdmin) return

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/model-alert-rules?t=${Date.now()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '获取预警配置失败')
      }

      const options = data.modelOptions || []
      setModelOptions(options)
      setRows(buildRows(options, data.rules || []))
    } catch (error) {
      setError(error instanceof Error ? error.message : '获取预警配置失败')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const enabledCount = useMemo(() => rows.filter((row) => row.isEnabled).length, [rows])

  const updateRow = <K extends keyof AlertRow>(key: string, field: K, value: AlertRow[K]) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    )
  }

  const resetRow = (key: string) => {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row
        const option = modelOptions.find((item) => `${item.modelName}:${item.modelType}` === key)
        if (!option) return row
        const defaults = getDefaultValues(option)

        return {
          ...row,
          ...defaults,
        }
      })
    )
  }

  const resetAllRows = () => {
    setRows((current) =>
      current.map((row) => {
        const option = modelOptions.find((item) => `${item.modelName}:${item.modelType}` === row.key)
        if (!option) return row

        return {
          ...row,
          ...getDefaultValues(option),
        }
      })
    )
  }

  const saveAll = async () => {
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/admin/model-alert-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rows: rows.map((row) => ({
            id: row.id,
            modelName: row.modelName,
            displayName: row.displayName,
            modelType: row.modelType,
            isEnabled: row.isEnabled,
            minCalls: normalizeNumber(row.consecutiveFailureCount),
            emails: splitEmails(row.emails),
          })),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存预警配置失败')
      }

      setMessage('预警配置已保存')
      await fetchRows()
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存预警配置失败')
    } finally {
      setSaving(false)
    }
  }

  if (sessionLoading || checkingAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  const rawAvatarSrc =
    globalAvatar ||
    (session?.user as ExtendedUser | undefined)?.avatar ||
    session?.user?.image ||
    '/images/default-avatar.svg'
  const normalizedAvatarSrc =
    rawAvatarSrc.startsWith('http') || rawAvatarSrc.startsWith('/') ? rawAvatarSrc : `/${rawAvatarSrc}`

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar />

      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <header className="bg-gradient-to-r from-white to-gray-50 border-b border-orange-200/50 shadow-sm sticky top-0 z-30 lg:static">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="rounded-lg bg-gradient-to-r from-orange-400/10 to-amber-400/10 p-2">
                  <BellRing className="h-5 w-5 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-xl font-bold text-transparent">
                    预警设置
                  </h1>
                  <p className="-mt-0.5 truncate text-xs text-gray-500">模型连续失败监控与邮件通知配置</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-orange-200/50 bg-white/80 px-4 py-2 shadow-sm transition-all duration-200 hover:shadow-md">
                <Image
                  src={normalizedAvatarSrc}
                  alt="Avatar"
                  width={36}
                  height={36}
                  className="rounded-full border-2 border-orange-400/40 object-cover shadow-sm"
                  unoptimized={normalizedAvatarSrc.startsWith('http')}
                  onError={(event) => {
                    const target = event.target as HTMLImageElement
                    if (!target.src.includes('default-avatar.svg')) {
                      target.src = '/images/default-avatar.svg'
                    }
                  }}
                />
                <div className="hidden flex-col items-start sm:flex">
                  <span className="max-w-[180px] truncate text-sm font-medium leading-tight text-gray-900">
                    {session?.user?.name || session?.user?.email}
                  </span>
                  <span className="text-xs font-medium text-orange-600">管理员</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-500">
              已启用 {enabledCount} 个模型
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <button
                type="button"
                onClick={resetAllRows}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                重置
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
              >
                <Save className="h-4 w-4" />
                {saving ? '保存中...' : '保存全部配置'}
              </button>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-orange-200 bg-orange-50/80 px-4 py-3 text-sm font-medium text-gray-700 flex items-start gap-2">
            <Info className="w-4 h-4 text-orange-500 shrink-0" />
            <span>模型连续失败达到配置次数时，系统将发送邮件预警。</span>
          </div>

          {message && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed divide-y divide-gray-200">
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[11%]" />
                  <col className="w-[18%]" />
                  <col className="w-[34%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">模型</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-gray-900">启用</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-gray-900">连续失败次数</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-gray-900">通知邮箱</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">操作</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                        加载中...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                        暂无模型
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const disabled = !row.isEnabled

                      return (
                        <tr key={row.key} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-6 py-3 align-middle">
                            <div className="text-sm font-medium text-gray-900 leading-5">{row.displayName}</div>
                            <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getModelTypeClass(row.modelType)}`}>
                              {getModelTypeText(row.modelType)}
                            </span>
                          </td>

                          <td className="px-4 py-3 align-middle">
                            <button
                              type="button"
                              onClick={() => updateRow(row.key, 'isEnabled', !row.isEnabled)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                row.isEnabled ? 'bg-orange-500' : 'bg-gray-300'
                              }`}
                              aria-label="切换启用状态"
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                  row.isEnabled ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>

                          <td className="px-4 py-3 align-middle">
                            <input
                              type="number"
                              min={1}
                              max={10000}
                              disabled={disabled}
                              value={row.consecutiveFailureCount}
                              onChange={(event) => updateRow(row.key, 'consecutiveFailureCount', event.target.value === '' ? '' : Number(event.target.value))}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                              placeholder="请输入"
                            />
                          </td>

                          <td className="px-4 py-3 align-middle">
                            <textarea
                              disabled={disabled}
                              value={row.emails}
                              rows={2}
                              onChange={(event) => updateRow(row.key, 'emails', event.target.value)}
                              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                              placeholder="请输入邮箱，多个用换行分隔"
                            />
                          </td>

                          <td className="px-6 py-3 align-middle text-right">
                            <button
                              type="button"
                              onClick={() => resetRow(row.key)}
                              className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
                            >
                              重置
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="space-y-3 md:hidden">
            {loading ? (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
                加载中...
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
                暂无模型
              </div>
            ) : (
              rows.map((row) => {
                const disabled = !row.isEnabled

                return (
                  <section key={row.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold leading-5 text-gray-900">{row.displayName}</div>
                        <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getModelTypeClass(row.modelType)}`}>
                          {getModelTypeText(row.modelType)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRow(row.key, 'isEnabled', !row.isEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          row.isEnabled ? 'bg-orange-500' : 'bg-gray-300'
                        }`}
                        aria-label="切换启用状态"
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            row.isEnabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">连续失败次数</span>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          disabled={disabled}
                          value={row.consecutiveFailureCount}
                          onChange={(event) => updateRow(row.key, 'consecutiveFailureCount', event.target.value === '' ? '' : Number(event.target.value))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                          placeholder="请输入"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">通知邮箱</span>
                        <textarea
                          disabled={disabled}
                          value={row.emails}
                          rows={2}
                          onChange={(event) => updateRow(row.key, 'emails', event.target.value)}
                          className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                          placeholder="请输入邮箱，多个用换行分隔"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => resetRow(row.key)}
                        className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
                      >
                        重置
                      </button>
                    </div>
                  </section>
                )
              })
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
