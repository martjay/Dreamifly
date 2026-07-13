'use client'


import { createScopedT } from '@/lib/strings'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import AuthModal from '@/components/AuthModal'

interface SubscriptionPlan {
  id: number
  name: string
  type: string
  price: number
  originalPrice: number | null
  bonusPoints: number
  dailyPointsMultiplier: number
  description: string | null
  features: string[]
  isPopular: boolean
  isActive: boolean
}

interface PointsPackage {
  id: number
  name: string
  nameTag: string | null
  points: number
  price: number
  originalPrice: number | null
  isPopular: boolean
  isActive: boolean
}

type PricingTab = 'subscription' | 'points'

type SubscriptionPlanGroup = {
  key: string
  displayName: string
  monthlyPlan?: SubscriptionPlan
  quarterlyPlan?: SubscriptionPlan
}

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export default function PricingPage() {
  const t = createScopedT('pricing')
  const { data: session } = useSession()

  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([])
  const [pointsPackages, setPointsPackages] = useState<PointsPackage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<PricingTab>('subscription')
  const [expandedPlans, setExpandedPlans] = useState<Record<number, boolean>>({})
  const [, setSelectedPlan] = useState<number | null>(null)
  const [, setSelectedPackage] = useState<number | null>(null)
  const [payingPlanId, setPayingPlanId] = useState<number | null>(null)
  const [payingPackageId, setPayingPackageId] = useState<number | null>(null)
  const [showLoginPromptModal, setShowLoginPromptModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isCreatingOrder = payingPlanId !== null || payingPackageId !== null

  // 获取套餐数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, packagesRes] = await Promise.all([
          fetch('/api/subscription/plans'),
          fetch('/api/points/packages'),
        ])

        if (plansRes.ok) {
          const plansData = await plansRes.json()
          setSubscriptionPlans(plansData.plans || [])
        }

        if (packagesRes.ok) {
          const packagesData = await packagesRes.json()
          setPointsPackages(packagesData.packages || [])
        }
      } catch (error) {
        console.error('Failed to fetch pricing data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    return () => {
      if (pollingTimer.current) {
        clearTimeout(pollingTimer.current)
      }
    }
  }, [])

  const clearPolling = () => {
    if (pollingTimer.current) {
      clearTimeout(pollingTimer.current)
      pollingTimer.current = null
    }
  }

  const pollOrderStatus = async (orderId: string, attempt = 0) => {
    const pollingInterval = 6000
    const maxAttempts = Math.ceil((30 * 60 * 1000) / pollingInterval) // 支付宝订单30分钟关闭，轮询覆盖整个支付窗口
    if (attempt >= maxAttempts) {
      clearPolling()
      setPayingPlanId(null)
      setPayingPackageId(null)
      console.warn('支付结果正在确认，请稍后在订单记录或个人中心查看。')
      return
    }

    try {
      const res = await fetch(`/api/alipay/query?orderId=${orderId}`, {
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error('查询支付状态失败')
      }

      const data = await res.json()
      const status = data?.order?.status
      const alipayStatus = data?.order?.alipayStatus

      if (status === 'paid') {
        clearPolling()
        setPayingPlanId(null)
        setPayingPackageId(null)
        console.info('支付成功，感谢您的购买！')
        return
      }

      if (status === 'failed') {
        clearPolling()
        setPayingPlanId(null)
        setPayingPackageId(null)
        console.warn('支付失败，请稍后重试。')
        return
      }

      // processing 或支付宝已返回成功但本地仍待处理，继续轮询
      if (
        status === 'processing' ||
        alipayStatus === 'TRADE_SUCCESS' ||
        alipayStatus === 'TRADE_FINISHED'
      ) {
        pollingTimer.current = setTimeout(() => pollOrderStatus(orderId, attempt + 1), pollingInterval)
        return
      }

      pollingTimer.current = setTimeout(() => pollOrderStatus(orderId, attempt + 1), pollingInterval)
    } catch (error) {
      console.error('查询支付状态失败:', error)
      pollingTimer.current = setTimeout(() => pollOrderStatus(orderId, attempt + 1), 4000)
    }
  }

  const startPayment = async (options: { orderType: 'subscription' | 'points'; productId: number }) => {
    clearPolling()
    const paymentScene = isMobileBrowser() ? 'mobile' : 'pc'
    if (options.orderType === 'subscription') {
      setPayingPlanId(options.productId)
      setPayingPackageId(null)
    } else {
      setPayingPackageId(options.productId)
      setPayingPlanId(null)
    }

    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderType: options.orderType,
          productId: options.productId,
          paymentMethod: 'alipay',
          paymentScene,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '创建订单失败，请稍后重试。')
      }

      if (!data?.paymentUrl || !data?.orderId) {
        throw new Error('未获取到支付链接，请稍后重试。')
      }

      console.info('正在跳转支付宝，请完成支付。')
      if (paymentScene === 'mobile') {
        window.location.href = data.paymentUrl
      } else {
        const opened = window.open(data.paymentUrl, '_blank')
        if (!opened) {
          window.location.href = data.paymentUrl
        }
      }

      pollOrderStatus(data.orderId)
    } catch (error) {
      console.error('创建订单失败:', error)
      setPayingPlanId(null)
      setPayingPackageId(null)
    } finally {
      // 创建订单期间展示加载提示，完成后恢复按钮
      setPayingPlanId((prev) => (options.orderType === 'subscription' && prev === options.productId ? null : prev))
      setPayingPackageId((prev) => (options.orderType === 'points' && prev === options.productId ? null : prev))
    }
  }

  const getBillingLabel = (planType: string) => {
    if (planType === 'monthly') return t('perMonth')
    if (planType === 'yearly') return t('perYear')
    if (planType === 'quarterly') return t('perQuarter')
    return ''
  }

  const getPlanFeatures = (plan: SubscriptionPlan) => {
    if (plan.features && plan.features.length > 0) {
      return plan.features
    }

    if (plan.type === 'yearly') {
      return ['无生成水印', '高峰期优先队列', '每日签到高倍积分']
    }

    if (plan.type === 'monthly' || plan.type === 'quarterly') {
      return ['无生成水印', '极速生成', '创作权益升级']
    }

    return []
  }

  const getNormalizedPlanGroupName = (name: string) => {
    const normalized = name
      .replace(/\s+/g, '')
      .replace(/月度|季度|年度|月付|季付|年付|月卡|季卡|年卡|月版|季版|年版/g, '')
      .trim()

    return normalized || name
  }

  const getCombinedPlanFeatures = (
    monthlyPlan?: SubscriptionPlan,
    quarterlyPlan?: SubscriptionPlan
  ) => {
    const availablePlans = [monthlyPlan, quarterlyPlan].filter(
      (plan): plan is SubscriptionPlan => Boolean(plan)
    )

    if (availablePlans.length === 0) {
      return []
    }

    const featureSource = [...availablePlans].sort(
      (a, b) => getPlanFeatures(b).length - getPlanFeatures(a).length
    )[0]

    const combinedPointsText = `立即获得积分（${availablePlans
      .map((plan) => `${plan.type === 'monthly' ? '月度' : '季度'}${plan.bonusPoints}积分`)
      .join('/')}）`

    const features = getPlanFeatures(featureSource)
    const bonusFeatureIndex = features.findIndex(
      (feature) => feature.includes('积分') && (feature.includes('立即') || feature.includes('赠送'))
    )

    if (bonusFeatureIndex === -1) {
      return [combinedPointsText, ...features]
    }

    return features.map((feature, index) => (index === bonusFeatureIndex ? combinedPointsText : feature))
  }

  const togglePlanFeatures = (planId: number) => {
    setExpandedPlans((prev) => ({
      ...prev,
      [planId]: !prev[planId],
    }))
  }

  const handleSubscribe = async (planId: number) => {
    if (!session?.user) {
      setShowLoginPromptModal(true)
      return
    }

    setSelectedPlan(planId)
    await startPayment({ orderType: 'subscription', productId: planId })
  }

  const handleBuyPoints = async (packageId: number) => {
    if (!session?.user) {
      setShowLoginPromptModal(true)
      return
    }

    setSelectedPackage(packageId)
    await startPayment({ orderType: 'points', productId: packageId })
  }

  const subscriptionPlanGroupsMap = new Map<string, SubscriptionPlanGroup>()
  const standaloneSubscriptionPlans: SubscriptionPlan[] = []

  subscriptionPlans.forEach((plan) => {
    if (plan.type === 'monthly' || plan.type === 'quarterly') {
      const groupKey = getNormalizedPlanGroupName(plan.name)
      const group = subscriptionPlanGroupsMap.get(groupKey) ?? {
        key: groupKey,
        displayName: getNormalizedPlanGroupName(plan.name),
      }

      if (plan.type === 'monthly') {
        group.monthlyPlan = plan
      } else {
        group.quarterlyPlan = plan
      }

      subscriptionPlanGroupsMap.set(groupKey, group)
      return
    }

    standaloneSubscriptionPlans.push(plan)
  })

  const subscriptionPlanGroups = Array.from(subscriptionPlanGroupsMap.values())

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white lg:ml-48">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-orange-100 border-t-orange-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] lg:ml-48">
      {showLoginPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[24px] bg-white p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <h2 className="text-xl font-semibold text-[#1d1d1f]">请先登录</h2>
            <p className="mt-3 text-sm leading-6 text-[#6e6e73]">
              登录后才能订阅会员或购买积分。
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowLoginPromptModal(false)}
                className="h-11 flex-1 rounded-full border border-orange-200 bg-white text-sm font-medium text-orange-700 transition hover:bg-orange-50"
              >
                稍后再说
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLoginPromptModal(false)
                  setShowAuthModal(true)
                }}
                className="h-11 flex-1 rounded-full bg-orange-500 text-sm font-medium text-white transition hover:bg-orange-400"
              >
                去登录
              </button>
            </div>
          </div>
        </div>
      )}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode="login" />
      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-[1200px] px-4 pb-12 pt-20 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
          <div className="mb-8 flex justify-center">
            <div className="inline-flex rounded-full bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <button
              onClick={() => setActiveTab('subscription')}
              className={`rounded-full px-4 py-2 text-sm transition sm:px-5 ${
                activeTab === 'subscription'
                  ? 'bg-orange-500 text-white'
                  : 'text-[#424245] hover:text-[#1d1d1f]'
              }`}
            >
              {t('subscriptionTab')}
            </button>
            <button
              onClick={() => setActiveTab('points')}
              className={`rounded-full px-4 py-2 text-sm transition sm:px-5 ${
                activeTab === 'points'
                  ? 'bg-orange-500 text-white'
                  : 'text-[#424245] hover:text-[#1d1d1f]'
              }`}
            >
              {t('pointsTab')}
            </button>
            </div>
          </div>

          {activeTab === 'subscription' && (
            <div className="space-y-10" id="subscription">
              <div className="grid gap-5 lg:grid-cols-2">
                {subscriptionPlanGroups.length === 0 && standaloneSubscriptionPlans.length === 0 && (
                  <div className="rounded-[32px] bg-white p-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)] lg:col-span-3">
                    <p className="text-xl font-semibold text-[#1d1d1f]">{t('subscriptionEmptyTitle')}</p>
                    <p className="mt-2 text-sm text-[#6e6e73]">{t('subscriptionEmptyDesc')}</p>
                  </div>
                )}

                {subscriptionPlanGroups.map((group) => {
                  const features = getCombinedPlanFeatures(group.monthlyPlan, group.quarterlyPlan)
                  const expandedKey = group.monthlyPlan?.id ?? group.quarterlyPlan?.id ?? 0
                  const isExpanded = Boolean(expandedPlans[expandedKey])
                  const visibleFeatures = isExpanded ? features : features.slice(0, 2)
                  const hiddenFeatures = isExpanded ? [] : features.slice(2)

                  return (
                    <div
                      key={group.key}
                      className="relative overflow-hidden rounded-[32px] bg-white p-6 text-[#1d1d1f] shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-7"
                    >
                      <div className="flex min-h-full flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#1d1d1f]">
                              {group.displayName}
                            </h3>
                          </div>
                        </div>

                        <div className="mt-6 rounded-[24px] bg-[#f5f5f7] p-4">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-[#86868b]">订阅价格</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
                            {group.monthlyPlan && (
                              <div className="min-w-0 rounded-[18px] bg-white px-3 py-3">
                                <div className="min-w-0">
                                  <div className="flex items-end gap-1 whitespace-nowrap">
                                    <span className="text-[1.55rem] font-semibold leading-none tracking-[-0.05em] text-[#1d1d1f] sm:text-[1.8rem]">
                                      ¥{group.monthlyPlan.price}
                                    </span>
                                    <span className="pb-0.5 text-[10px] text-[#86868b]">{getBillingLabel(group.monthlyPlan.type)}</span>
                                  </div>
                                  {group.monthlyPlan.originalPrice && (
                                    <div className="mt-1 text-[10px] text-[#86868b] line-through">
                                      ¥{group.monthlyPlan.originalPrice}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-3">
                                  <button
                                    onClick={() => handleSubscribe(group.monthlyPlan!.id)}
                                    disabled={isCreatingOrder}
                                    aria-busy={payingPlanId === group.monthlyPlan.id}
                                    className={`h-9 w-full rounded-full border border-orange-200 bg-white px-3 text-xs font-medium text-orange-700 transition hover:bg-orange-50 ${
                                      isCreatingOrder ? 'cursor-not-allowed opacity-80' : ''
                                    }`}
                                  >
                                    {payingPlanId === group.monthlyPlan.id ? '处理中' : '订阅'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {group.quarterlyPlan && (
                              <div className="min-w-0 rounded-[18px] bg-white px-3 py-3">
                                <div className="min-w-0">
                                  <div className="flex items-end gap-1 whitespace-nowrap">
                                    <span className="text-[1.55rem] font-semibold leading-none tracking-[-0.05em] text-[#1d1d1f] sm:text-[1.8rem]">
                                      ¥{group.quarterlyPlan.price}
                                    </span>
                                    <span className="pb-0.5 text-[10px] text-[#86868b]">{getBillingLabel(group.quarterlyPlan.type)}</span>
                                  </div>
                                  {group.quarterlyPlan.originalPrice && (
                                    <div className="mt-1 text-[10px] text-[#86868b] line-through">
                                      ¥{group.quarterlyPlan.originalPrice}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-3">
                                  <button
                                    onClick={() => handleSubscribe(group.quarterlyPlan!.id)}
                                    disabled={isCreatingOrder}
                                    aria-busy={payingPlanId === group.quarterlyPlan.id}
                                    className={`h-9 w-full rounded-full border border-orange-200 bg-white px-3 text-xs font-medium text-orange-700 transition hover:bg-orange-50 ${
                                      isCreatingOrder ? 'cursor-not-allowed opacity-80' : ''
                                    }`}
                                  >
                                    {payingPlanId === group.quarterlyPlan.id ? '处理中' : '订阅'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-7 rounded-[24px] bg-[#fafafc] p-4">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#86868b]">核心权益</p>
                          <ul className="mt-3 space-y-3">
                            {visibleFeatures.map((feature, index) => (
                              <li
                                key={`${group.key}-${index}`}
                                className="flex items-start gap-3 text-sm leading-6 text-[#424245]"
                              >
                                <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-orange-300" />
                                <span className={index === 0 ? 'font-medium text-[#1d1d1f]' : ''}>{feature}</span>
                              </li>
                            ))}
                          </ul>

                          {hiddenFeatures.length > 0 && (
                            <div className="relative mt-3 h-16 overflow-hidden">
                              <ul className="space-y-3">
                                {hiddenFeatures.map((feature, index) => (
                                  <li
                                    key={`${group.key}-hidden-${index}`}
                                    className="flex items-start gap-3 text-sm leading-6 text-[#424245]"
                                  >
                                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-orange-300" />
                                    <span>{feature}</span>
                                  </li>
                                ))}
                              </ul>
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-white/75 to-white" />
                            </div>
                          )}
                        </div>

                        {features.length > 2 && (
                          <button
                            type="button"
                            onClick={() => togglePlanFeatures(expandedKey)}
                            className="mt-4 inline-flex items-center text-sm font-medium text-orange-600 hover:text-orange-500"
                          >
                            {isExpanded ? '收起权益' : '展开全部权益'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {standaloneSubscriptionPlans.map((plan) => {
                  const isFeatured = plan.isPopular || plan.type === 'yearly'
                  const features = getPlanFeatures(plan)
                  const isExpanded = Boolean(expandedPlans[plan.id])
                  const visibleFeatures = isExpanded ? features : features.slice(0, 2)
                  const hiddenFeatures = isExpanded ? [] : features.slice(2)

                  return (
                    <div
                      key={plan.id}
                      className={`relative overflow-hidden rounded-[32px] p-6 sm:p-7 ${
                        isFeatured
                          ? 'bg-[#fff7ed] text-[#1d1d1f] shadow-[0_20px_50px_rgba(249,115,22,0.14)] ring-1 ring-orange-200'
                          : 'bg-white text-[#1d1d1f] shadow-[0_10px_30px_rgba(0,0,0,0.06)]'
                      }`}
                    >
                      <div className="flex min-h-full flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-[11px] font-medium ${
                                isFeatured
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-[#f5f5f7] text-[#6e6e73]'
                              }`}
                            >
                              {getBillingLabel(plan.type).replace('/', '') || t('subscriptionTab')}
                            </span>
                            <h3 className="mt-3 text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#1d1d1f]">
                              {plan.name}
                            </h3>
                          </div>
                          {isFeatured && (
                            <span className="rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-xs text-orange-700">
                              {t('recommended')}
                            </span>
                          )}
                        </div>

                        <div className={`mt-6 rounded-[24px] p-4 ${isFeatured ? 'bg-white/80' : 'bg-[#f5f5f7]'}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#86868b]">订阅价格</p>
                          <div className="mt-2 flex items-end gap-3">
                            <span className={`text-[3rem] font-semibold leading-none tracking-[-0.05em] ${isFeatured ? 'text-orange-600' : 'text-[#1d1d1f]'}`}>
                              ¥{plan.price}
                            </span>
                            <div className={`pb-1 text-sm ${isFeatured ? 'text-[#a16a2a]' : 'text-[#86868b]'}`}>
                              <div>{getBillingLabel(plan.type)}</div>
                              {plan.originalPrice && <div className="line-through">¥{plan.originalPrice}</div>}
                            </div>
                          </div>
                        </div>

                        <div className={`mt-7 rounded-[24px] p-4 ${isFeatured ? 'bg-white/70' : 'bg-[#fafafc]'}`}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[#86868b]">核心权益</p>
                          <ul className="mt-3 space-y-3">
                            {visibleFeatures.map((feature, index) => (
                              <li
                                key={`${plan.id}-${index}`}
                                className="flex items-start gap-3 text-sm leading-6 text-[#424245]"
                              >
                                <span
                                  className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                                    isFeatured ? 'bg-orange-400' : 'bg-orange-300'
                                  }`}
                                />
                                <span className={index === 0 ? 'font-medium text-[#1d1d1f]' : ''}>{feature}</span>
                              </li>
                            ))}
                          </ul>

                          {hiddenFeatures.length > 0 && (
                            <div className="relative mt-3 h-16 overflow-hidden">
                              <ul className="space-y-3">
                                {hiddenFeatures.map((feature, index) => (
                                  <li
                                    key={`${plan.id}-hidden-${index}`}
                                    className="flex items-start gap-3 text-sm leading-6 text-[#424245]"
                                  >
                                    <span
                                      className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                                        isFeatured ? 'bg-orange-400' : 'bg-orange-300'
                                      }`}
                                    />
                                    <span>{feature}</span>
                                  </li>
                                ))}
                              </ul>
                              <div
                                className={`pointer-events-none absolute inset-0 ${
                                  isFeatured
                                    ? 'bg-gradient-to-b from-[#fff7ed]/10 via-[#fff7ed]/75 to-[#fff7ed]'
                                    : 'bg-gradient-to-b from-white/10 via-white/75 to-white'
                                }`}
                              />
                            </div>
                          )}
                        </div>

                        {features.length > 2 && (
                          <button
                            type="button"
                            onClick={() => togglePlanFeatures(plan.id)}
                            className="mt-4 inline-flex items-center text-sm font-medium text-orange-600 hover:text-orange-500"
                          >
                            {isExpanded ? '收起权益' : '展开全部权益'}
                          </button>
                        )}

                        <div className="mt-8 flex-1" />

                        <button
                          onClick={() => handleSubscribe(plan.id)}
                          disabled={isCreatingOrder}
                          aria-busy={payingPlanId === plan.id}
                          className={`mt-8 min-h-[48px] w-full rounded-full px-5 py-3 text-sm font-medium transition ${
                            isFeatured
                              ? 'bg-orange-500 text-white hover:bg-orange-400'
                              : 'border border-orange-200 bg-white text-orange-700 hover:bg-orange-50'
                          } ${isCreatingOrder ? 'cursor-not-allowed opacity-80' : ''}`}
                        >
                          {payingPlanId === plan.id ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              请稍后…
                            </span>
                          ) : (
                            t('subscribe')
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'points' && (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
                {pointsPackages.length === 0 && (
                  <div className="col-span-2 rounded-[32px] bg-white p-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)] lg:col-span-3">
                    <p className="text-xl font-semibold text-[#1d1d1f]">{t('pointsEmptyTitle')}</p>
                    <p className="mt-2 text-sm text-[#6e6e73]">{t('pointsEmptyDesc')}</p>
                  </div>
                )}

                {pointsPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`relative overflow-hidden rounded-[20px] p-3 sm:rounded-[32px] sm:p-7 ${
                      pkg.isPopular
                        ? 'bg-[#fff7ed] text-[#1d1d1f] shadow-[0_20px_50px_rgba(249,115,22,0.14)] ring-1 ring-orange-200'
                        : 'bg-white text-[#1d1d1f] shadow-[0_10px_30px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    <div className="flex min-h-full flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold leading-[1.15] tracking-[-0.02em] text-[#1d1d1f] sm:text-[1.7rem] sm:tracking-[-0.03em]">
                            {pkg.name}
                          </h3>
                        </div>
                        {pkg.isPopular && (
                          <span className="rounded-full border border-orange-200 bg-white/80 px-2 py-0.5 text-[10px] text-orange-700 sm:px-3 sm:py-1 sm:text-xs">
                            {t('popular')}
                          </span>
                        )}
                      </div>

                      {pkg.nameTag && (
                        <p className={`mt-1.5 text-[11px] sm:mt-3 sm:text-sm ${pkg.isPopular ? 'text-orange-700' : 'text-orange-600'}`}>
                          {pkg.nameTag}
                        </p>
                      )}

                      <div className={`mt-3 rounded-[16px] p-3 sm:mt-6 sm:rounded-[24px] sm:p-4 ${pkg.isPopular ? 'bg-white/80' : 'bg-[#f5f5f7]'}`}>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#86868b]">可用额度</p>
                        <div className="mt-1.5 flex items-end gap-1.5 sm:gap-2">
                          <span className={`text-[1.55rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.4rem] sm:tracking-[-0.04em] ${pkg.isPopular ? 'text-orange-600' : 'text-[#1d1d1f]'}`}>
                            {pkg.points.toLocaleString('zh-CN')}
                          </span>
                          <span className="pb-0.5 text-[11px] text-[#6e6e73] sm:pb-1 sm:text-sm">{t('points')}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end sm:mt-6">
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-[#86868b]">到手价格</p>
                          <div className="mt-1 flex items-end gap-2 sm:gap-3">
                            <span className="text-[1.4rem] font-semibold leading-none tracking-[-0.03em] text-[#1d1d1f] sm:text-[2.5rem] sm:tracking-[-0.05em]">
                              ¥{pkg.price}
                            </span>
                            {pkg.originalPrice && (
                              <span className={`pb-0.5 text-[11px] line-through sm:pb-1 sm:text-sm ${pkg.isPopular ? 'text-[#a16a2a]' : 'text-[#86868b]'}`}>
                                ¥{pkg.originalPrice}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleBuyPoints(pkg.id)}
                        disabled={isCreatingOrder}
                        aria-busy={payingPackageId === pkg.id}
                        className={`mt-4 min-h-[36px] w-full rounded-full px-3 py-1.5 text-[11px] font-medium transition sm:mt-8 sm:min-h-[48px] sm:px-5 sm:py-3 sm:text-sm ${
                          pkg.isPopular
                            ? 'bg-orange-500 text-white hover:bg-orange-400'
                            : 'border border-orange-200 bg-white text-orange-700 hover:bg-orange-50'
                        } ${isCreatingOrder ? 'cursor-not-allowed opacity-80' : ''}`}
                      >
                        {payingPackageId === pkg.id ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            请稍后…
                          </span>
                        ) : (
                          t('buy')
                        )}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

