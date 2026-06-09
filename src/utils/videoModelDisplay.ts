import { t } from '@/lib/strings'
import { HAPPYHORSE_AGGREGATE_MODEL_ID, type VideoModelConfig } from './videoModelConfig'

export function getVideoModelDescription(model: VideoModelConfig): string {
  if (model.id === HAPPYHORSE_AGGREGATE_MODEL_ID) return model.description || ''
  return t(`home.generate.form.model.descriptions.${model.id.replace(/\./g, '')}`)
}

export function getVideoModelDisplayTags(model: VideoModelConfig): Array<{ label: string; styleKey: string }> {
  if (model.id === HAPPYHORSE_AGGREGATE_MODEL_ID) {
    return [
      { label: t('home.generate.form.model.tags.textToVideo'), styleKey: 't2v' },
      { label: t('home.generate.form.model.tags.imageToVideo'), styleKey: 'i2v' },
      { label: t('home.generate.form.model.tags.multiReference'), styleKey: 'r2v' },
      { label: t('home.generate.form.model.tags.videoEdit'), styleKey: 'videoEdit' },
    ]
  }

  const modeTag = (() => {
    switch (model.mode) {
      case 'text-to-video':
        return { label: t('home.generate.form.model.tags.textToVideo'), styleKey: 't2v' }
      case 'reference-to-video':
        return { label: t('home.generate.form.model.tags.multiReference'), styleKey: 'r2v' }
      case 'video-edit':
        return { label: t('home.generate.form.model.tags.videoEdit'), styleKey: 'videoEdit' }
      case 'image-to-video':
      default:
        return { label: t('home.generate.form.model.tags.imageToVideo'), styleKey: 'i2v' }
    }
  })()

  const tags = [modeTag]
  if (model.provider !== 'grok') {
    tags.push({ label: t('home.generate.form.model.tags.audioSupport'), styleKey: 'audioSupport' })
  }
  tags.push({ label: t('home.generate.form.model.tags.chineseSupport'), styleKey: 'chineseSupport' })

  return tags
}
