import { getGptImage2SizeString } from '@/utils/modelConfig';

interface GptImage2Params {
  prompt: string;
  width: number;
  height: number;
  images?: string[];
}

interface GptImage2Response {
  created?: number;
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

const DEFAULT_MODEL_ID = 'gpt-image-2';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 600_000;
const HIGH_QUALITY_PIXEL_THRESHOLD = 1536 * 864 * 1.05;

type GptImage2Quality = 'auto' | 'high';

function buildEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function isRetryableError(error: unknown, status?: number): boolean {
  if (status && status >= 500) return true;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    const message = error.message.toLowerCase();
    if (message.includes('fetch failed') || message.includes('timeout')) return true;
    const cause = error.cause as { message?: string; code?: string } | undefined;
    if (cause?.message?.includes('Timeout') || cause?.code === 'UND_ERR_CONNECT_TIMEOUT') return true;
    if (cause?.message?.includes('ECONNRESET') || cause?.message?.includes('ECONNREFUSED')) return true;
  }
  return false;
}

function decodeInputImage(image: string): { buffer: Buffer; mimeType: string } {
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  const mimeType = match?.[1] || 'image/png';
  const base64 = (match?.[2] || image).replace(/\s/g, '');
  return {
    buffer: Buffer.from(base64, 'base64'),
    mimeType,
  };
}

function deriveQuality(width: number, height: number): GptImage2Quality {
  return width * height > HIGH_QUALITY_PIXEL_THRESHOLD ? 'high' : 'auto';
}

async function responseImageToDataUrl(data: GptImage2Response): Promise<string> {
  const image = data?.data?.[0];
  if (!image) {
    throw new Error('GPT-image-2 API response missing image data');
  }

  if (image.b64_json) {
    return `data:image/png;base64,${image.b64_json}`;
  }

  if (image.url) {
    const response = await fetch(image.url);
    if (!response.ok) {
      throw new Error(`Failed to download GPT-image-2 image (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:image/png;base64,${base64}`;
  }

  throw new Error('GPT-image-2 API response missing b64_json or url');
}

async function requestGptImage2(endpoint: string, init: RequestInit): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (attempt < MAX_RETRIES && isRetryableError(null, response.status)) {
          console.warn(`[gpt-image-2] attempt ${attempt} failed (${response.status}), retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }

        console.error('[gpt-image-2] API error:', {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          error: errorText,
        });
        throw new Error(`GPT-image-2 API error (${response.status}): ${errorText || 'Unknown error'}`);
      }

      const data = (await response.json()) as GptImage2Response;
      return await responseImageToDataUrl(data);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        console.warn(`[gpt-image-2] attempt ${attempt} failed (${error instanceof Error ? error.message : String(error)}), retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('GPT-image-2 API request failed');
}

export async function generateGptImage2(params: GptImage2Params): Promise<string> {
  const apiUrl = process.env.BANANA_ROUTER_BASE_URL;
  const apiKey = process.env.BANANA_ROUTER_API_KEY;
  const model = process.env.GPT_IMAGE_2_MODEL?.trim() || DEFAULT_MODEL_ID;

  if (!apiUrl?.trim()) {
    throw new Error('GPT-image-2 service URL is not configured. Please set BANANA_ROUTER_BASE_URL.');
  }

  if (!apiKey?.trim()) {
    throw new Error('GPT-image-2 API key is not configured. Please set BANANA_ROUTER_API_KEY.');
  }

  const size = getGptImage2SizeString(params.width, params.height);
  const quality = deriveQuality(params.width, params.height);
  const inputImages = params.images ?? [];

  if (inputImages.length > 0) {
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', params.prompt);
    formData.append('n', '1');
    formData.append('size', size);
    formData.append('quality', quality);

    inputImages.forEach((image, index) => {
      const { buffer, mimeType } = decodeInputImage(image);
      formData.append('image', new Blob([new Uint8Array(buffer)], { type: mimeType }), `input-${index + 1}.png`);
    });

    return requestGptImage2(buildEndpoint(apiUrl, '/v1/images/edits'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
  }

  return requestGptImage2(buildEndpoint(apiUrl, '/v1/images/generations'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: params.prompt,
      n: 1,
      size,
      quality,
    }),
  });
}
