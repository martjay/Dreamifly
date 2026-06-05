export const OFFICIAL_MODEL_MODERATION_FAILED_CODE = 'OFFICIAL_MODEL_MODERATION_FAILED'
export const OFFICIAL_MODEL_MODERATION_FAILED_MESSAGE = '模型官方审核未通过'

const OFFICIAL_MODERATION_PATTERNS = [
  'safety',
  'policy',
  'content filter',
  'content_filter',
  'content policy',
  'content_policy',
  'moderation',
  'blocked',
  'block_reason',
  'prompt_feedback',
  'promptfeedback',
  'finishreason":"safety',
  'finish_reason":"safety',
  'prohibited',
  'responsible ai',
  'rejected as a result of our safety system',
]

export class OfficialModelModerationError extends Error {
  code = OFFICIAL_MODEL_MODERATION_FAILED_CODE

  constructor(message = OFFICIAL_MODEL_MODERATION_FAILED_MESSAGE) {
    super(message)
    this.name = 'OfficialModelModerationError'
  }
}

export function isOfficialModelModerationError(error: unknown): boolean {
  return error instanceof OfficialModelModerationError ||
    (typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code?: unknown }).code === OFFICIAL_MODEL_MODERATION_FAILED_CODE)
}

export function detectOfficialModelModerationFailure(value: unknown): boolean {
  const text = typeof value === 'string'
    ? value
    : value instanceof Error
      ? value.message
      : JSON.stringify(value)

  const normalized = text.toLowerCase()
  return OFFICIAL_MODERATION_PATTERNS.some(pattern => normalized.includes(pattern))
}
