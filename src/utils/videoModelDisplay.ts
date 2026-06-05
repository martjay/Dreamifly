import { t } from '@/lib/strings'
import type { VideoModelConfig } from './videoModelConfig'

export function getVideoModelDescription(model: VideoModelConfig): string {
  return t(`home.generate.form.model.descriptions.${model.id.replace(/\./g, '')}`)
}

export function getVideoModelDisplayTags(model: VideoModelConfig): Array<{ label: string; styleKey: string }> {
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
