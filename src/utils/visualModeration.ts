export type VisualRiskLevel = 'low' | 'medium' | 'high'

export type ContentKind = 'image' | 'video'

export const MEDIUM_RISK_CONFIRM_MESSAGE =
  '根据算法评估，此内容可能存在不适元素（如擦边、暴力等）。平台已尽力识别，但仍可能出错。您是否确认查看？'

const EXACT_LEVEL_MAP: Record<string, VisualRiskLevel> = {
  高: 'high',
  高风险: 'high',
  high: 'high',
  'high risk': 'high',
  中: 'medium',
  中等: 'medium',
  中风险: 'medium',
  中等风险: 'medium',
  medium: 'medium',
  moderate: 'medium',
  'medium risk': 'medium',
  'moderate risk': 'medium',
  低: 'low',
  低风险: 'low',
  low: 'low',
  'low risk': 'low',
}

const LEVEL_TERMS: Array<{ level: VisualRiskLevel; terms: string[] }> = [
  {
    level: 'high',
    terms: ['高风险', '高危', '高等级', 'high risk', 'high'],
  },
  {
    level: 'medium',
    terms: ['中风险', '中等风险', '风险中等', '中等', 'moderate risk', 'medium risk', 'moderate', 'medium'],
  },
  {
    level: 'low',
    terms: ['低风险', '低危', '低等级', 'low risk', 'low'],
  },
]

function getEarliestMatchedLevel(text: string): VisualRiskLevel | null {
  let bestMatch: { level: VisualRiskLevel; index: number; termLength: number } | null = null

  for (const candidate of LEVEL_TERMS) {
    for (const term of candidate.terms) {
      const index = text.indexOf(term)
      if (index === -1) continue

      if (
        !bestMatch ||
        index < bestMatch.index ||
        (index === bestMatch.index && term.length > bestMatch.termLength)
      ) {
        bestMatch = {
          level: candidate.level,
          index,
          termLength: term.length,
        }
      }
    }
  }

  return bestMatch?.level || null
}

export function parseVisualRiskLevel(rawResult: string | null | undefined): VisualRiskLevel | null {
  const normalized = rawResult
    ?.trim()
    .toLowerCase()
    .replace(/["'`'‘’“”]/g, '')
    .replace(/[：:。.!?,，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  const compact = normalized.replace(/\s+/g, '')

  if (EXACT_LEVEL_MAP[normalized]) return EXACT_LEVEL_MAP[normalized]
  if (EXACT_LEVEL_MAP[compact]) return EXACT_LEVEL_MAP[compact]

  const contextualMatch = normalized.match(
    /(?:风险|等级|level|risk)\s*(?:为|是|:)?\s*(高|中|低|high|medium|moderate|low)|(?:高|中|低)\s*(?:风险|等级)|(?:high|medium|moderate|low)\s*(?:risk|level)/
  )

  if (contextualMatch) {
    const matchedValue = contextualMatch[1] || contextualMatch[0]
    const normalizedMatch = matchedValue.trim().toLowerCase()
    if (normalizedMatch.includes('高') || normalizedMatch.includes('high')) return 'high'
    if (normalizedMatch.includes('中') || normalizedMatch.includes('medium') || normalizedMatch.includes('moderate')) return 'medium'
    if (normalizedMatch.includes('低') || normalizedMatch.includes('low')) return 'low'
  }

  const earliestMatchedLevel = getEarliestMatchedLevel(normalized) || getEarliestMatchedLevel(compact)
  if (earliestMatchedLevel) return earliestMatchedLevel

  return null
}

export function isRestrictedVisualRisk(level: VisualRiskLevel): boolean {
  return level === 'medium' || level === 'high'
}

export function getVisualRiskLevelLabel(level: Exclude<VisualRiskLevel, 'low'>): string {
  return level === 'high' ? '高风险' : '中风险'
}

export function getModerationWarning(level: VisualRiskLevel, kind: ContentKind): string {
  if (level === 'high') {
    return kind === 'video'
      ? '该视频可能含有危险内容，生成结果无法展示'
      : '该图片可能含有危险内容，生成结果无法展示。'
  }

  if (level === 'medium') {
    return kind === 'video'
      ? '该视频低概率含有轻度不适内容，请确认是否要查看。'
      : '该图片低概率含有轻度不适内容，请确认是否要查看'
  }

  return ''
}

export function canRevealMediumRiskMedia(params: {
  level?: VisualRiskLevel | null
  isLoggedIn: boolean
  hasConsent: boolean
}): boolean {
  return params.level === 'medium' && params.isLoggedIn && params.hasConsent
}
