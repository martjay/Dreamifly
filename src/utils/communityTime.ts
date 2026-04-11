function getShanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value || 0),
    month: Number(parts.find((part) => part.type === 'month')?.value || 0),
    day: Number(parts.find((part) => part.type === 'day')?.value || 0),
  }
}

function getShanghaiDayStart(date: Date) {
  const { year, month, day } = getShanghaiDateParts(date)
  return Date.UTC(year, month - 1, day)
}

export function formatCommunityTime(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const hourMs = 3600000
  const dayMs = 86400000

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs))
    return `${hours}小时前`
  }

  const dayDiff = Math.max(1, Math.floor((getShanghaiDayStart(now) - getShanghaiDayStart(date)) / dayMs))
  if (dayDiff === 1) return '昨天'
  if (dayDiff <= 3) return `${dayDiff}天前`

  const { month, day } = getShanghaiDateParts(date)
  return `${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日`
}
