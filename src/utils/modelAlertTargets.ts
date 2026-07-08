export const MODERATION_ALERT_MODEL_NAME = '审核模型(qwenvl)'

export const MODEL_ALERT_TARGETS = [
  { modelName: 'Wai-SDXL-V150', modelType: 'image_generation' },
  { modelName: 'Wai-SDXL-V170', modelType: 'image_generation' },
  { modelName: 'Qwen-Image-Edit', modelType: 'image_generation' },
  { modelName: 'Z-Image-Turbo', modelType: 'image_generation' },
  { modelName: 'gpt-image-2', modelType: 'image_generation' },
  { modelName: 'nano-banana-2', modelType: 'image_generation' },
  { modelName: MODERATION_ALERT_MODEL_NAME, modelType: 'moderation' },
] as const

export function getModelAlertTargetKey(modelName: string, modelType: string): string {
  return `${modelName}:${modelType}`
}

const MODEL_ALERT_TARGET_KEY_SET = new Set(
  MODEL_ALERT_TARGETS.map((target) => getModelAlertTargetKey(target.modelName, target.modelType))
)

const MODEL_ALERT_TARGET_ORDER = new Map(
  MODEL_ALERT_TARGETS.map((target, index) => [
    getModelAlertTargetKey(target.modelName, target.modelType),
    index,
  ])
)

export function isConfigurableModelAlertTarget(modelName: string, modelType: string): boolean {
  return MODEL_ALERT_TARGET_KEY_SET.has(getModelAlertTargetKey(modelName, modelType))
}

export function shouldEvaluateModelAlertTarget(modelName: string, modelType: string): boolean {
  if (modelType === 'moderation') return true
  return isConfigurableModelAlertTarget(modelName, modelType)
}

export function getModelAlertTargetOrder(modelName: string, modelType: string): number {
  return MODEL_ALERT_TARGET_ORDER.get(getModelAlertTargetKey(modelName, modelType)) ?? Number.MAX_SAFE_INTEGER
}
