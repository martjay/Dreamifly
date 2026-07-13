import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { user, userLimitConfig, userPoints, userSubscription } from '@/db/schema'
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { createHash } from 'crypto'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
}

function validateDynamicToken(providedToken: string): boolean {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY
  if (!apiKey) return false

  const now = new Date()
  const timeSlots = [
    now,
    new Date(now.getTime() - 60 * 1000),
  ]

  for (const timeSlot of timeSlots) {
    const year = timeSlot.getFullYear()
    const month = String(timeSlot.getMonth() + 1).padStart(2, '0')
    const day = String(timeSlot.getDate()).padStart(2, '0')
    const hour = String(timeSlot.getHours()).padStart(2, '0')
    const minute = String(timeSlot.getMinutes()).padStart(2, '0')
    const salt = `${year}${month}${day}${hour}${minute}`
    const expectedToken = createHash('md5').update(apiKey + salt).digest('hex')

    if (providedToken === expectedToken) return true
  }

  return false
}

function getShanghaiDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  return {
    year: parseInt(parts.find((part) => part.type === 'year')!.value, 10),
    month: parseInt(parts.find((part) => part.type === 'month')!.value, 10) - 1,
    day: parseInt(parts.find((part) => part.type === 'day')!.value, 10),
  }
}

function getShanghaiDayTime(date: Date) {
  const shanghaiDate = getShanghaiDate(date)
  return Date.UTC(shanghaiDate.year, shanghaiDate.month, shanghaiDate.day)
}

function hasAwardedTodayFromDate(lastDailyAwardDate: Date | null): boolean {
  if (!lastDailyAwardDate) return false

  const timezoneOffsetMs = 8 * 60 * 60 * 1000
  const nowUtc = new Date()
  const gmt8NowTime = nowUtc.getTime() + timezoneOffsetMs
  const gmt8NowDate = new Date(gmt8NowTime)
  const gmt8Year = gmt8NowDate.getUTCFullYear()
  const gmt8Month = gmt8NowDate.getUTCMonth()
  const gmt8Date = gmt8NowDate.getUTCDate()

  let gmt8Today4AMUtc = new Date(Date.UTC(gmt8Year, gmt8Month, gmt8Date, 4 - 8, 0, 0, 0))
  const gmt8Today4AMTime = gmt8Today4AMUtc.getTime() + timezoneOffsetMs
  if (gmt8NowTime < gmt8Today4AMTime) {
    gmt8Today4AMUtc = new Date(Date.UTC(gmt8Year, gmt8Month, gmt8Date - 1, 4 - 8, 0, 0, 0))
  }

  return lastDailyAwardDate >= gmt8Today4AMUtc
}

function resolveMaxDailyRequests(params: {
  isAdmin: boolean
  isPremium: boolean
  isOldUser: boolean
  config?: typeof userLimitConfig.$inferSelect
}): number | null {
  if (params.isAdmin) return null

  if (params.isPremium) {
    return params.config?.premiumUserDailyLimit ?? parseInt(process.env.PREMIUM_USER_DAILY_LIMIT || '300', 10)
  }

  if (params.isOldUser) {
    return params.config?.regularUserDailyLimit ?? parseInt(process.env.REGULAR_USER_DAILY_LIMIT || '100', 10)
  }

  return params.config?.newUserDailyLimit ?? parseInt(process.env.NEW_REGULAR_USER_DAILY_LIMIT || '50', 10)
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401, headers: NO_STORE_HEADERS })
    }

    const providedToken = authHeader.substring(7)
    if (!validateDynamicToken(providedToken)) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: NO_STORE_HEADERS })
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
    }

    const userRows = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        nickname: user.nickname,
        uid: user.uid,
        avatar: user.avatar,
        avatarFrameId: user.avatarFrameId,
        availableAvatarFrameIds: user.availableAvatarFrameIds,
        isActive: user.isActive,
        isAdmin: user.isAdmin,
        isPremium: user.isPremium,
        isOldUser: user.isOldUser,
        isSubscribed: user.isSubscribed,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        dailyRequestCount: user.dailyRequestCount,
        lastDailyAwardDate: user.lastDailyAwardDate,
        lastRequestResetDate: sql<string | null>`${user.lastRequestResetDate} AT TIME ZONE 'UTC'`,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: NO_STORE_HEADERS })
    }

    const userInfo = userRows[0]
    const isAdmin = userInfo.isAdmin || false
    const isPremium = userInfo.isPremium || false
    const isOldUser = userInfo.isOldUser || false
    const isActive = userInfo.isActive !== undefined ? userInfo.isActive !== false : true
    const now = new Date()

    let todayCount = 0
    let needsReset = false
    const todayShanghaiTime = getShanghaiDayTime(now)

    if (userInfo.lastRequestResetDate) {
      const lastResetDate = new Date(userInfo.lastRequestResetDate.replace(' ', 'T') + 'Z')
      needsReset = getShanghaiDayTime(lastResetDate) !== todayShanghaiTime
      if (!needsReset) {
        todayCount = userInfo.dailyRequestCount || 0
      }
    } else {
      needsReset = true
    }

    if (needsReset) {
      await db
        .update(user)
        .set({
          dailyRequestCount: 0,
          lastRequestResetDate: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(user.id, session.user.id))
      todayCount = 0
    }

    const [pointsRows, configRows, subscriptionRows] = await Promise.all([
      db
        .select({
          total: sql<number>`COALESCE(SUM(${userPoints.points}), 0)`,
        })
        .from(userPoints)
        .where(
          and(
            eq(userPoints.userId, session.user.id),
            eq(userPoints.type, 'earned'),
            isNotNull(userPoints.expiresAt),
            gte(userPoints.expiresAt, now)
          )
        ),
      isAdmin
        ? Promise.resolve([])
        : db
            .select()
            .from(userLimitConfig)
            .where(eq(userLimitConfig.id, 1))
            .limit(1),
      db
        .select({
          planType: userSubscription.planType,
          status: userSubscription.status,
          startedAt: userSubscription.startedAt,
          expiresAt: userSubscription.expiresAt,
        })
        .from(userSubscription)
        .where(
          and(
            eq(userSubscription.userId, session.user.id),
            eq(userSubscription.status, 'active')
          )
        )
        .orderBy(desc(userSubscription.expiresAt))
        .limit(1),
    ])

    const maxDailyRequests = resolveMaxDailyRequests({
      isAdmin,
      isPremium,
      isOldUser,
      config: configRows[0],
    })
    const isSubscribed = Boolean(
      userInfo.isSubscribed &&
      userInfo.subscriptionExpiresAt &&
      new Date(userInfo.subscriptionExpiresAt) > now
    )
    const activeSubscription = subscriptionRows[0] || null

    return NextResponse.json({
      success: true,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        image: userInfo.image,
        nickname: userInfo.nickname,
        uid: userInfo.uid,
        avatar: userInfo.avatar || userInfo.image || '/images/default-avatar.svg',
        avatarFrameId: userInfo.avatarFrameId,
        availableAvatarFrameIds: userInfo.availableAvatarFrameIds,
        isActive,
        isAdmin,
        isPremium,
        isOldUser,
      },
      points: {
        balance: Math.max(0, Number(pointsRows[0]?.total || 0)),
      },
      quota: {
        todayCount,
        maxDailyRequests,
        isAdmin,
        isPremium,
        isOldUser,
        isActive,
        hasQuota: isAdmin || (maxDailyRequests !== null && todayCount < maxDailyRequests),
      },
      subscription: {
        isSubscribed,
        planType: activeSubscription?.planType ?? null,
        status: activeSubscription?.status ?? null,
        startedAt: activeSubscription?.startedAt ?? null,
        expiresAt: userInfo.subscriptionExpiresAt ?? activeSubscription?.expiresAt ?? null,
      },
      checkIn: {
        checkedIn: hasAwardedTodayFromDate(userInfo.lastDailyAwardDate),
      },
    }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('Error fetching user summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
