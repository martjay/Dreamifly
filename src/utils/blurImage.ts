import sharp from 'sharp'

function stripDataUrlPrefix(base64OrDataUrl: string): string {
  const idx = base64OrDataUrl.indexOf(',')
  if (base64OrDataUrl.startsWith('data:') && idx >= 0) return base64OrDataUrl.slice(idx + 1)
  return base64OrDataUrl
}

/**
 * 将图片 base64（可带 data:image 前缀）生成模糊后的 dataUrl（png）。
 * 注意：只做模糊，不叠加文字水印（前端负责标识叠加）。
 */
export async function blurImageToDataUrl(imageBase64OrDataUrl: string, sigma?: number): Promise<string> {
  const base64 = stripDataUrlPrefix(imageBase64OrDataUrl)
  const input = Buffer.from(base64, 'base64')

  // sharp.blur(): sigma in range [0.3, 1000] (approx). Default提高以加强模糊强度。
  const blurSigma = typeof sigma === 'number' ? sigma : Number(process.env.MODERATION_BLUR_SIGMA || 40)

  const out = await sharp(input).blur(blurSigma).png().toBuffer()
  return `data:image/png;base64,${out.toString('base64')}`
}

