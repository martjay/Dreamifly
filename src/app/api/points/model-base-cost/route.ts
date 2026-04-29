import { NextResponse } from 'next/server';
import { getModelBaseCost } from '@/utils/points';
import { getVideoModelById } from '@/utils/videoModelConfig';
import type { HappyHorseResolution } from '@/utils/happyHorseVideoApi';

function isHappyHorseResolution(value: string | null): value is HappyHorseResolution {
  return value === '720P' || value === '1080P';
}

// 获取模型基础积分消耗（公开API，无需登录）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const resolutionParam = searchParams.get('resolution');

    if (!modelId) {
      return NextResponse.json(
        { error: 'modelId is required' },
        { status: 400 }
      );
    }

    // 获取模型基础积分消耗
    const videoModel = getVideoModelById(modelId);
    const isHappyHorse = videoModel?.provider === 'happyhorse' || modelId.startsWith('happyhorse-1.0-');
    const resolution = resolutionParam || '720P';
    let happyHorseResolution: HappyHorseResolution | undefined;

    if (isHappyHorse) {
      if (!isHappyHorseResolution(resolution)) {
        return NextResponse.json(
          { error: 'Invalid HappyHorse resolution. Use 720P or 1080P.' },
          { status: 400 }
        );
      }
      happyHorseResolution = resolution;
    }

    const baseCost = await getModelBaseCost(modelId, happyHorseResolution);

    return NextResponse.json({
      baseCost: baseCost,
    });
  } catch (error) {
    console.error('Error fetching model base cost:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

