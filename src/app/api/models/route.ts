import { NextResponse } from 'next/server'
import { ALL_MODELS, type ModelConfig } from '@/utils/modelConfig'
import { getHomepageAsset } from '@/utils/homepageAssets'

// 模型环境变量映射（与 modelConfig.ts 保持一致）
const MODEL_ENV_MAP = {
  "HiDream-full-fp8": "HiDream_Fp8_URL",
  "Flux-Dev": "Flux_Dev_URL", 
  "Flux-Kontext": "Kontext_fp8_URL",
  "Stable-Diffusion-3.5": "Stable_Diffusion_3_5_URL",
  "Flux-Krea": "Flux_Krea_URL",
  "Qwen-Image": "Qwen_Image_URL",
  "Qwen-Image-Edit": "Qwen_Image_Edit_URL",
  "Wai-SDXL-V150": "Wai_SDXL_V150_URL",
  "Wai-SDXL-V170": "Wai_SDXL_V170_URL",
  "Z-Image": "Z_IMAGE_URL",
  "Z-Image-Turbo": "Z_Image_Turbo_URL",
  "Flux-2": "Flux_2_URL",
  "grok-imagine-1.0": "GROK_IMAGINE_API_URL",
  "gpt-image-2": "GPT_IMAGE_2_API_URL",
  "nano-banana-2": "BANANA_ROUTER_API_KEY"
} as const;

/**
 * 检查模型是否在环境变量中配置了URL
 */
function isModelConfigured(modelId: string): boolean {
  if (modelId === 'nano-banana-2') {
    return [
      process.env.BANANA_ROUTER_API_KEY,
      process.env.BANANA_ROUTER_BASE_URL,
      process.env.BANANA_ROUTER_IMAGE_MODEL,
    ].every(value => Boolean(value && value.trim() !== ''));
  }

  const envVarName = MODEL_ENV_MAP[modelId as keyof typeof MODEL_ENV_MAP];
  if (!envVarName) {
    return false;
  }
  
  const envValue = process.env[envVarName];
  return Boolean(envValue && envValue.trim() !== '');
}

/**
 * 获取可用的模型列表（基于环境变量配置）
 */
function getAvailableModels(): ModelConfig[] {
  return ALL_MODELS.filter(model => {
    // 检查是否配置了环境变量
    return isModelConfigured(model.id);
  }).map(model => ({
    ...model,
    image: getHomepageAsset(model.image),
    imageFallback: model.image,
    homepageCover: model.homepageCover ? getHomepageAsset(model.homepageCover) : model.homepageCover,
    homepageCoverFallback: model.homepageCover,
  }));
}

export async function GET() {
  try {
    const availableModels = getAvailableModels();
    
    return NextResponse.json({
      models: availableModels,
      total: availableModels.length
    });
  } catch (error) {
    console.error('Error fetching available models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available models' },
      { status: 500 }
    );
  }
}
