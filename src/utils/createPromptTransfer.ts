export type CreatePromptMediaType = 'image' | 'video'
export type CreatePromptTab = 'generate' | 'video'

export type CreatePromptDraft = {
  prompt: string
  model?: string
  mediaType?: CreatePromptMediaType
  tab?: CreatePromptTab
  createdAt: number
}

export type ReadCreatePromptDraftResult =
  | { status: 'found'; draft: CreatePromptDraft }
  | { status: 'missing' | 'expired' | 'invalid' | 'unavailable' }

type BuildCreatePromptParamsInput = {
  prompt?: string
  model?: string
  mediaType?: CreatePromptMediaType
  tab?: CreatePromptTab
  communityMediaId?: string | number | null
}

const DRAFT_KEY_PREFIX = 'create-prompt-draft:'
const DRAFT_EXPIRES_MS = 60 * 60 * 1000

function canUseSessionStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage)
  } catch {
    return false
  }
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function getDraftKey(draftId: string) {
  return `${DRAFT_KEY_PREFIX}${draftId}`
}

export function createPromptDraft(payload: Omit<CreatePromptDraft, 'createdAt'>) {
  const prompt = payload.prompt?.trim()
  if (!prompt || !canUseSessionStorage()) return null

  const draftId = createDraftId()
  const draft: CreatePromptDraft = {
    ...payload,
    prompt,
    createdAt: Date.now(),
  }

  try {
    window.sessionStorage.setItem(getDraftKey(draftId), JSON.stringify(draft))
    return draftId
  } catch (error) {
    console.error('Failed to save create prompt draft:', error)
    return null
  }
}

export function readPromptDraft(draftId: string): ReadCreatePromptDraftResult {
  if (!draftId || !canUseSessionStorage()) return { status: 'unavailable' }

  const key = getDraftKey(draftId)

  try {
    const rawDraft = window.sessionStorage.getItem(key)
    if (!rawDraft) return { status: 'missing' }

    const draft = JSON.parse(rawDraft) as CreatePromptDraft
    if (!draft.prompt || !draft.createdAt) {
      window.sessionStorage.removeItem(key)
      return { status: 'invalid' }
    }

    if (Date.now() - draft.createdAt > DRAFT_EXPIRES_MS) {
      window.sessionStorage.removeItem(key)
      return { status: 'expired' }
    }

    return { status: 'found', draft }
  } catch (error) {
    console.error('Failed to read create prompt draft:', error)
    window.sessionStorage.removeItem(key)
    return { status: 'invalid' }
  }
}

export function buildCreatePromptParams({
  prompt,
  model,
  mediaType,
  tab,
  communityMediaId,
}: BuildCreatePromptParamsInput) {
  const params = new URLSearchParams()
  const normalizedModel = model?.trim()
  const normalizedPrompt = prompt?.trim()
  const normalizedCommunityMediaId = communityMediaId !== null && communityMediaId !== undefined
    ? String(communityMediaId).trim()
    : ''
  const isVideo = tab === 'video' || mediaType === 'video'

  if (normalizedCommunityMediaId) {
    params.set('source', 'community')
    params.set('id', normalizedCommunityMediaId)
  } else if (normalizedPrompt) {
    const draftId = createPromptDraft({
      prompt: normalizedPrompt,
      model: normalizedModel,
      mediaType,
      tab: isVideo ? 'video' : 'generate',
    })

    if (draftId) {
      params.set('draft', draftId)
    }
  }

  if (normalizedModel && normalizedModel !== '默认') {
    params.set('model', normalizedModel)
  }

  if (isVideo) {
    params.set('tab', 'video')
  }

  return params
}
