import { hidreamFp8T2IWorkflow,  fluxDevT2IWorkflow, stableDiffusion3T2IWorkflow, fluxKreaT2IWorkflow, qwenImageT2IWorkflow, waiSDXLV150Workflow, waiSDXLV170Workflow, zImageTurboT2IWorkflow, flux2T2IWorkflow, zImageT2IWorkflow } from "./t2iworkflow";
import { fluxI2IWorkflow, fluxKontextI2IMultiImageWorkflow, fluxKontextI2IWorkflow, QwenImageEdit2ImagesWorkflow, QwenImageEdit3ImagesWorkflow, QwenImageEditWorkflow } from "./i2iworkflow";
import axios from "axios";
import http from "http";
import https from "https";
import sharp from "sharp";

const T2IModelMap = {
  "HiDream-full-fp8": hidreamFp8T2IWorkflow,
  "Flux-Dev": fluxDevT2IWorkflow,
  "Stable-Diffusion-3.5": stableDiffusion3T2IWorkflow,
  "Flux-Krea": fluxKreaT2IWorkflow,
  "Qwen-Image": qwenImageT2IWorkflow,
  "Wai-SDXL-V150": waiSDXLV150Workflow,
  "Wai-SDXL-V170": waiSDXLV170Workflow,
  "Z-Image-Turbo": zImageTurboT2IWorkflow,
  "Flux-2": flux2T2IWorkflow,
  "Z-Image": zImageT2IWorkflow
}

const I2IModelMap = {
  "Qwen-Image-Edit": QwenImageEditWorkflow,
  "Flux-Dev": fluxI2IWorkflow,
  "Flux-Kontext": fluxKontextI2IWorkflow
}

interface ComfyUIResponse {
  images: string[];
}

interface GenerateParams {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed?: number;
  batch_size: number;
  model: string;
  images?: string[];
  negative_prompt?: string;
}

type ComfyPromptResult = {
  status: number;
  statusText: string;
  text: string;
  durationMs: number;
  attempt: number;
  attempts: number;
}

type ComfyFailureInfo = {
  failureCode: string;
  failureReason: string;
  likelyCause: string;
  suggestedAction: string;
}

const IMAGE_GENERATION_TIMEOUT_MS = 4 * 60 * 1000;
const QWEN_IMAGE_EDIT_INPUT_MAX_PIXELS = 1280 * 1280;
const QWEN_IMAGE_EDIT_INPUT_MAX_BYTES = 3 * 1024 * 1024;
const QWEN_IMAGE_EDIT_JPEG_QUALITY = 90;

function getModelUrlEnvVarName(model: string): string {
  const envMap: Record<string, string> = {
    "HiDream-full-fp8": "HiDream_Fp8_URL",
    "Flux-Dev": "Flux_Dev_URL",
    "Flux-Kontext": "Kontext_fp8_URL",
    "Stable-Diffusion-3.5": "Stable_Diffusion_3_5_URL",
    "Flux-Krea": "Flux_Krea_URL",
    "Qwen-Image": "Qwen_Image_URL",
    "Qwen-Image-Edit": "Qwen_Image_Edit_URL",
    "Wai-SDXL-V150": "Wai_SDXL_V150_URL",
    "Wai-SDXL-V170": "Wai_SDXL_V170_URL",
    "Z-Image-Turbo": "Z_Image_Turbo_URL",
    "Z-Image": "Z_IMAGE_URL",
    "Flux-2": "Flux_2_URL",
  };

  return envMap[model] || "URL";
}

function getEnvNumber(name: string, fallback: number, allowZero = false): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : fallback;
}

function createRequestId(model: string): string {
  const normalizedModel = model.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "model";
  return `${normalizedModel}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripDataUrlPrefix(image: string): string {
  const commaIndex = image.indexOf(",");
  return commaIndex >= 0 ? image.slice(commaIndex + 1) : image;
}

function bytesToMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function getBase64ByteLength(image: string): number {
  const base64 = stripDataUrlPrefix(image);
  return Math.floor(base64.length * 0.75);
}

function constrainDimensions(width: number, height: number, maxPixels: number) {
  if (width <= 0 || height <= 0 || width * height <= maxPixels) {
    return { width, height, capped: false };
  }

  const scale = Math.sqrt(maxPixels / (width * height));
  const nextWidth = Math.max(64, Math.round((width * scale) / 8) * 8);
  const nextHeight = Math.max(64, Math.round((height * scale) / 8) * 8);

  return {
    width: nextWidth,
    height: nextHeight,
    capped: true,
  };
}

async function normalizeQwenImageEditInputs(params: GenerateParams, requestId: string): Promise<GenerateParams> {
  if (params.model !== "Qwen-Image-Edit" || !params.images?.length) {
    return params;
  }

  const maxPixels = getEnvNumber("QWEN_IMAGE_EDIT_INPUT_MAX_PIXELS", QWEN_IMAGE_EDIT_INPUT_MAX_PIXELS);
  const maxBytes = getEnvNumber("QWEN_IMAGE_EDIT_INPUT_MAX_BYTES", QWEN_IMAGE_EDIT_INPUT_MAX_BYTES);
  const jpegQuality = Math.min(100, Math.max(60, getEnvNumber("QWEN_IMAGE_EDIT_JPEG_QUALITY", QWEN_IMAGE_EDIT_JPEG_QUALITY)));

  const images = await Promise.all(params.images.map(async (image, index) => {
    const base64 = stripDataUrlPrefix(image);
    const inputBuffer = Buffer.from(base64, "base64");

    try {
      const metadata = await sharp(inputBuffer).metadata();
      const inputWidth = metadata.width || 0;
      const inputHeight = metadata.height || 0;
      const inputPixels = inputWidth * inputHeight;

      if (inputPixels <= maxPixels && inputBuffer.length <= maxBytes) {
        return base64;
      }

      if (!inputWidth || !inputHeight) {
        return base64;
      }

      const imageSize = constrainDimensions(inputWidth, inputHeight, maxPixels);
      const resizedBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({
          width: imageSize.width,
          height: imageSize.height,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: jpegQuality, mozjpeg: true })
        .toBuffer();

      console.log(`[${params.model}] 参考图已压缩:`, {
        requestId,
        index,
        inputSizeMB: bytesToMB(inputBuffer.length),
        outputSizeMB: bytesToMB(resizedBuffer.length),
        inputWidth,
        inputHeight,
        outputWidth: imageSize.width,
        outputHeight: imageSize.height,
      });

      return resizedBuffer.toString("base64");
    } catch (error) {
      console.warn(`[${params.model}] 参考图压缩失败，继续使用原图:`, {
        requestId,
        index,
        inputSizeMB: bytesToMB(inputBuffer.length),
        error: error instanceof Error ? error.message : String(error),
      });
      return base64;
    }
  }));

  return { ...params, images };
}

function getWorkflowDiagnostics(workflow: any, params: GenerateParams, requestBodySizeBytes: number) {
  const loadImageNodes = Object.entries(workflow)
    .filter(([, node]: [string, any]) => node?.class_type === "LoadImage")
    .map(([nodeId, node]: [string, any]) => ({
      nodeId,
      imageSizeMB: typeof node?.inputs?.image === "string" ? bytesToMB(getBase64ByteLength(node.inputs.image)) : "0.00",
    }));

  return {
    width: params.width,
    height: params.height,
    steps: params.steps,
    imageCount: params.images?.length || 0,
    promptLength: params.prompt.length,
    negativePromptLength: params.negative_prompt?.length || 0,
    requestBodySizeMB: bytesToMB(requestBodySizeBytes),
    nodeCount: Object.keys(workflow).length,
    outputWidth: workflow?.["112"]?.inputs?.width ?? workflow?.["58"]?.inputs?.width,
    outputHeight: workflow?.["112"]?.inputs?.height ?? workflow?.["58"]?.inputs?.height,
    unetName: workflow?.["37"]?.inputs?.unet_name,
    clipName: workflow?.["38"]?.inputs?.clip_name,
    vaeName: workflow?.["39"]?.inputs?.vae_name,
    loraName: workflow?.["89"]?.inputs?.lora_name,
    resolutionSteps: workflow?.["93"]?.inputs?.resolution_steps,
    loadImageNodes,
  };
}

function shouldRetryComfyResponse(status: number, text: string): boolean {
  if (![502, 503, 504].includes(status)) return false;
  return /upstream|disconnect|reset|timeout|temporarily unavailable|no healthy/i.test(text);
}

function truncateLogText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getComfyFailureInfo(status: number, text: string): ComfyFailureInfo {
  const normalizedText = text.toLowerCase();

  if (
    status === 503 &&
    normalizedText.includes("upstream connect error") &&
    normalizedText.includes("before headers")
  ) {
    return {
      failureCode: "upstream_connection_terminated",
      failureReason: "上游代理连接后端失败，或连接在返回响应头前被终止",
      likelyCause: "部署实例未就绪、服务进程被回收、网关等待上游超时，或 ComfyUI 后端主动断开连接",
      suggestedAction: "检查部署实例健康状态、网关超时限制、ComfyUI 进程日志和 GPU 队列状态",
    };
  }

  if (status === 503 && normalizedText.includes("no healthy upstream")) {
    return {
      failureCode: "no_healthy_upstream",
      failureReason: "上游没有可用健康实例",
      likelyCause: "服务实例未启动、健康检查失败，或全部实例处于不可用状态",
      suggestedAction: "检查部署平台实例健康检查、服务启动日志和实例数量",
    };
  }

  if (status === 504 || normalizedText.includes("timeout")) {
    return {
      failureCode: "upstream_timeout",
      failureReason: "上游服务响应超时",
      likelyCause: "生成任务耗时超过网关或服务超时限制，或上游队列阻塞",
      suggestedAction: "检查网关超时配置、ComfyUI 队列长度和模型推理耗时",
    };
  }

  if (status === 404) {
    return {
      failureCode: "endpoint_not_found",
      failureReason: "上游接口地址不存在",
      likelyCause: "服务地址或路径配置错误",
      suggestedAction: "检查模型 URL 环境变量是否指向 ComfyUI 服务根地址",
    };
  }

  if (status === 429) {
    return {
      failureCode: "upstream_rate_limited",
      failureReason: "上游服务限流或请求过多",
      likelyCause: "短时间请求过多，或上游服务设置了并发限制",
      suggestedAction: "检查调用频率、并发限制和上游限流配置",
    };
  }

  if (status >= 500) {
    return {
      failureCode: "upstream_server_error",
      failureReason: "上游服务内部错误",
      likelyCause: "ComfyUI 或部署平台内部异常",
      suggestedAction: "检查上游服务错误日志和部署平台事件",
    };
  }

  return {
    failureCode: "upstream_request_failed",
    failureReason: "上游请求失败",
    likelyCause: "请求参数、鉴权、服务配置或上游状态异常",
    suggestedAction: "结合状态码、上游返回内容和 requestId 排查",
  };
}

function buildComfyFailureMessage(params: {
  model: string;
  status: number;
  statusText: string;
  text: string;
  durationMs: number;
  attempt: number;
  attempts: number;
  requestId: string;
}) {
  const failureInfo = getComfyFailureInfo(params.status, params.text);
  const statusText = params.statusText ? ` ${params.statusText}` : "";
  return [
    `${params.model} 上游请求失败：${params.status}${statusText}`,
    `原因：${failureInfo.failureReason}`,
    `单次耗时：${(params.durationMs / 1000).toFixed(2)}秒`,
    `尝试：${params.attempt}/${params.attempts}`,
    `requestId=${params.requestId}`,
    `上游返回：${truncateLogText(params.text || "无响应内容", 300)}`,
  ].join("；");
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postComfyPrompt(
  apiEndpoint: string,
  requestBodyString: string,
  params: GenerateParams,
  requestId: string,
): Promise<ComfyPromptResult> {
  const maxRetries = Math.max(0, Math.floor(getEnvNumber("COMFY_IMAGE_MAX_RETRIES", 1, true)));
  const attempts = maxRetries + 1;
  const timeoutMs = getEnvNumber("COMFY_IMAGE_TIMEOUT_MS", IMAGE_GENERATION_TIMEOUT_MS);
  const httpAgent = new http.Agent({ keepAlive: false, maxSockets: 1 });
  const httpsAgent = new https.Agent({ keepAlive: false, maxSockets: 1, rejectUnauthorized: true });

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptStart = Date.now();

    try {
      const response = await axios.post(apiEndpoint, requestBodyString, {
        headers: {
          "Content-Type": "application/json",
          "Connection": "close",
        },
        timeout: timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        responseType: "text",
        transformResponse: data => data,
        validateStatus: () => true,
        httpAgent: apiEndpoint.startsWith("https") ? undefined : httpAgent,
        httpsAgent: apiEndpoint.startsWith("https") ? httpsAgent : undefined,
      });

      const durationMs = Date.now() - attemptStart;
      const text = typeof response.data === "string" ? response.data : JSON.stringify(response.data);

      if (response.status >= 200 && response.status < 300) {
        return {
          status: response.status,
          statusText: response.statusText,
          text,
          durationMs,
          attempt,
          attempts,
        };
      }

      if (attempt < attempts && shouldRetryComfyResponse(response.status, text)) {
        const failureInfo = getComfyFailureInfo(response.status, text);
        console.warn(`[${params.model}] ComfyUI请求失败，准备重试:`, {
          requestId,
          attempt,
          attempts,
          status: response.status,
          statusText: response.statusText,
          durationMs,
          failureCode: failureInfo.failureCode,
          failureReason: failureInfo.failureReason,
          likelyCause: failureInfo.likelyCause,
          suggestedAction: failureInfo.suggestedAction,
          upstreamPreview: truncateLogText(text, 500),
        });
        await delay(1200 * attempt);
        continue;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        text,
        durationMs,
        attempt,
        attempts,
      };
    } catch (error) {
      const durationMs = Date.now() - attemptStart;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt < attempts) {
        console.warn(`[${params.model}] ComfyUI请求异常，准备重试:`, {
          requestId,
          attempt,
          attempts,
          durationMs,
          error: errorMessage,
        });
        await delay(1200 * attempt);
        continue;
      }

      throw error;
    }
  }

  throw new Error("ComfyUI请求未执行");
}

export async function generateImage(params: GenerateParams): Promise<string> {
  // 注意：prompt 已经在 API 路由入口处进行了违禁词过滤，这里直接使用即可
  const requestId = createRequestId(params.model);
  params = await normalizeQwenImageEditInputs(params, requestId);

  // 1. 准备工作流数据
  let workflow = {};
  if(params.images && params.images.length > 0){
    if(params.model === 'Flux-Kontext' && params.images.length > 1){
      workflow = fluxKontextI2IMultiImageWorkflow
    }else if(params.model === 'Qwen-Image-Edit' && params.images.length == 2){
      workflow = QwenImageEdit2ImagesWorkflow
    }else if(params.model === 'Qwen-Image-Edit' && params.images.length == 3){
      workflow = QwenImageEdit3ImagesWorkflow
    }else{
      workflow = I2IModelMap[params.model as keyof typeof I2IModelMap];
    }
  }else{
    workflow = T2IModelMap[params.model as keyof typeof T2IModelMap];
  }

  // 检查工作流是否加载成功
  if (!workflow || Object.keys(workflow).length === 0) {
    throw new Error(`模型 ${params.model} 的工作流未找到或为空`);
  }

  // 深拷贝工作流，避免修改原始模板
  workflow = JSON.parse(JSON.stringify(workflow));

  let baseUrl = '';
  if(params.model === 'HiDream-full-fp8') {
    baseUrl = process.env.HiDream_Fp8_URL || ''
    setHiDreamWT2IorkflowParams(workflow, params);
  }else if(params.model === 'Flux-Dev') {
    baseUrl = process.env.Flux_Dev_URL || ''
    if(params.images && params.images.length > 0){
      setFluxDevI2IorkflowParams(workflow, params);
    }else{
      setFluxDevWT2IorkflowParams(workflow, params);
    }
  }else if(params.model === 'Flux-Kontext') {
    baseUrl = process.env.Kontext_fp8_URL || ''
    if(params.images && params.images.length > 0){
      setFluxKontxtI2IorkflowParams(workflow, params);
    }
  }else if(params.model === 'Stable-Diffusion-3.5') {
    baseUrl = process.env.Stable_Diffusion_3_5_URL || ''
    setStableDiffusion3T2IorkflowParams(workflow, params);
  }else if(params.model === 'Flux-Krea') {
    baseUrl = process.env.Flux_Krea_URL || ''
    setFluxKreaT2IorkflowParams(workflow, params);
  }else if(params.model === 'Qwen-Image') {
    baseUrl = process.env.Qwen_Image_URL || ''
    setQwenImageT2IorkflowParams(workflow, params);
  }else if(params.model === 'Qwen-Image-Edit') {
    baseUrl = process.env.Qwen_Image_Edit_URL || ''
    setQwenImageEditorkflowParams(workflow, params);
  }else if(params.model === 'Wai-SDXL-V150') {
    baseUrl = process.env.Wai_SDXL_V150_URL || ''
    setWaiSDXLV150T2IorkflowParams(workflow, params);
  }else if(params.model === 'Wai-SDXL-V170') {
    baseUrl = process.env.Wai_SDXL_V170_URL || ''
    setWaiSDXLV170T2IorkflowParams(workflow, params);
  }else if(params.model === 'Z-Image-Turbo') {
    baseUrl = process.env.Z_Image_Turbo_URL || ''
    setZImageTurboT2IorkflowParams(workflow, params);
  }else if(params.model === 'Z-Image') {
    baseUrl = process.env.Z_IMAGE_URL || ''
    setZImageT2IorkflowParams(workflow, params);
  }else if(params.model === 'Flux-2') {
    baseUrl = process.env.Flux_2_URL || ''
    setFlux2T2IorkflowParams(workflow, params);
  }

  // 检查baseUrl是否配置
  const envVarName = getModelUrlEnvVarName(params.model);
  if (!baseUrl) {
    throw new Error(`模型 ${params.model} 的服务URL未配置，请检查环境变量 ${envVarName}`);
  }

  // 规范化 baseUrl（移除末尾斜杠）
  baseUrl = baseUrl.replace(/\/+$/, '');

  try {
    // 2. 发送提示请求并等待响应
    const apiEndpoint = `${baseUrl}/prompt`;
    const requestBody = { prompt: workflow };
    const requestBodyString = JSON.stringify(requestBody);
    const requestBodySizeBytes = Buffer.byteLength(requestBodyString, "utf8");
    const diagnostics = getWorkflowDiagnostics(workflow, params, requestBodySizeBytes);

    console.log(`[${params.model}] ComfyUI请求开始:`, {
      requestId,
      envVarName,
      url: apiEndpoint,
      ...diagnostics,
    });

    const result = await postComfyPrompt(apiEndpoint, requestBodyString, params, requestId);

    console.log(`[${params.model}] ComfyUI请求完成:`, {
      requestId,
      status: result.status,
      statusText: result.statusText,
      durationMs: result.durationMs,
      attempt: result.attempt,
      attempts: result.attempts,
    });

    if (result.status < 200 || result.status >= 300) {
      const errorText = result.text;
      const failureInfo = getComfyFailureInfo(result.status, errorText);
      console.error(`[${params.model}] API 错误响应:`, {
        requestId,
        status: result.status,
        statusText: result.statusText,
        url: apiEndpoint,
        envVarName,
        durationMs: result.durationMs,
        attempt: result.attempt,
        attempts: result.attempts,
        failureCode: failureInfo.failureCode,
        failureReason: failureInfo.failureReason,
        likelyCause: failureInfo.likelyCause,
        suggestedAction: failureInfo.suggestedAction,
        diagnostics,
        upstreamResponse: truncateLogText(errorText, 1000)
      });
      
      // 如果是 404 错误，提供更详细的提示
      if (result.status === 404) {
        throw new Error(buildComfyFailureMessage({
          model: params.model,
          status: result.status,
          statusText: result.statusText,
          text: errorText,
          durationMs: result.durationMs,
          attempt: result.attempt,
          attempts: result.attempts,
          requestId,
        }));
      }
      
      // 如果是 503 错误，提供连接相关的提示
      if (result.status === 503) {
        throw new Error(buildComfyFailureMessage({
          model: params.model,
          status: result.status,
          statusText: result.statusText,
          text: errorText,
          durationMs: result.durationMs,
          attempt: result.attempt,
          attempts: result.attempts,
          requestId,
        }));
      }
      
      throw new Error(buildComfyFailureMessage({
        model: params.model,
        status: result.status,
        statusText: result.statusText,
        text: errorText,
        durationMs: result.durationMs,
        attempt: result.attempt,
        attempts: result.attempts,
        requestId,
      }));
    }

    let base64Image: string = '';
    let text = ''
    try {
      text = result.text;
      
      // 检查响应是否为"no healthy upstream"错误
      if (text.includes('no healthy upstream') || text.includes('upstream')) {
        throw new Error(`ComfyUI服务不可用: ${text}。请检查服务是否正常运行`);
      }
      
      const data = JSON.parse(text) as ComfyUIResponse;
      
      // 检查响应数据格式
      if (!data || !data.images || !Array.isArray(data.images) || data.images.length === 0) {
        throw new Error(`无效的响应格式: 缺少images数据`);
      }
      
      base64Image = "data:image/png;base64," + data.images[0];
      console.log(`[${params.model}] ComfyUI响应解析完成:`, {
        requestId,
        imageCount: data.images.length,
        firstImageSizeMB: bytesToMB(getBase64ByteLength(data.images[0])),
      });
    } catch (parseError) {
      // 如果已经是Error对象，直接抛出
      if (parseError instanceof Error) {
        throw parseError;
      }
      // 否则包装为错误
      throw new Error(`无法解析ComfyUI响应: ${text.substring(0, 200)}`);
    }

    return base64Image;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${params.model}] Error generating image:`, {
      requestId,
      envVarName,
      baseUrl,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    if (axios.isAxiosError(error)) {
      throw new Error(`${params.model} 上游连接异常：${errorMessage}；requestId=${requestId}；url=${baseUrl}`);
    }
    throw error;
  }
}

function setHiDreamWT2IorkflowParams(workflow: any, params: GenerateParams) {
  // 更新工作流参数
  workflow["53"].inputs.width = params.width;
  workflow["53"].inputs.height = params.height;
  workflow["16"].inputs.text = params.prompt;
  workflow["3"].inputs.steps = params.steps;
  if (params.seed) {
    workflow["3"].inputs.seed = params.seed;
  }
}
function setFluxDevWT2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["44"].inputs.width = params.width;
  workflow["44"].inputs.height = params.height;
  workflow["46"].inputs.width = params.width;
  workflow["46"].inputs.height = params.height;
  // workflow["5"].inputs.batch_size = params.batch_size;
  workflow["43"].inputs.text = params.prompt;
  workflow["17"].inputs.steps = params.steps;
  if (params.seed) {
    workflow["45"].inputs.noise_seed = params.seed;
  }
}

function setFluxDevI2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["50"].inputs.image = params.images?.[0];
  workflow["52"].inputs.width = params.width;
  workflow["52"].inputs.height = params.height;
  workflow["46"].inputs.width = params.width;
  workflow["46"].inputs.height = params.height;
  if (params.seed) {
    workflow["45"].inputs.noise_seed = params.seed;
  }
  workflow["43"].inputs.text = params.prompt;
}

// function setHiDreamI2IorkflowParams(workflow: any, params: GenerateParams) {
//   // 更新工作流参数
//   workflow["74"].inputs.image = params.image;
//   workflow["76"].inputs.width = params.width;
//   workflow["76"].inputs.height = params.height;
//   workflow["16"].inputs.text = params.prompt;
//   workflow["3"].inputs.steps = params.steps;
//   if (params.seed) {
//     workflow["3"].inputs.seed = params.seed;
//   }
//   if (params.denoise) {
//     workflow["3"].inputs.denoise = params.denoise;
//   }
// }

function setFluxKontxtI2IorkflowParams(workflow: any, params: GenerateParams) {
  if(params.images && params?.images.length > 1){
    workflow["192"].inputs.image = params.images?.[0];
    workflow["193"].inputs.image = params.images?.[1];
    workflow["188"].inputs.width = params.width;
    workflow["188"].inputs.height = params.height;
  }else{
    workflow["142"].inputs.image = params.images?.[0];
    workflow["189"].inputs.target_width = params.width;
    workflow["189"].inputs.target_height = params.height;
  }
  workflow["6"].inputs.text = params.prompt;
  workflow["31"].inputs.steps = params.steps;
  if (params.seed) {
    workflow["31"].inputs.seed = params.seed;
  }
  //denoise = 1
}

function setStableDiffusion3T2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["53"].inputs.width = params.width;
  workflow["53"].inputs.height = params.height;
  workflow["16"].inputs.text = params.prompt;
  workflow["3"].inputs.steps = params.steps;
  if (params.seed) {
    workflow["3"].inputs.seed = params.seed;
  }
}

function setFluxKreaT2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["31"].inputs.steps = params.steps;
  workflow["27"].inputs.width = params.width;
  workflow["27"].inputs.height = params.height;
  workflow["45"].inputs.text = params.prompt;
  if (params.seed) {
    workflow["31"].inputs.seed = params.seed;
  }
}

function setQwenImageT2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["58"].inputs.width = params.width;
  workflow["58"].inputs.height = params.height;
  workflow["3"].inputs.seed = params.seed;
  workflow["6"].inputs.text = params.prompt;
  workflow["3"].inputs.steps = params.steps;
  if (params.negative_prompt) {
    workflow["7"].inputs.text = params.negative_prompt;
  }
}

function setLoadImageInput(workflow: any, nodeId: string, image?: string) {
  if (!image || !workflow[nodeId]?.inputs) return;
  workflow[nodeId].inputs.image = image;
  workflow[nodeId].inputs.upload = 'image';
}

function setQwenImageEditorkflowParams(workflow: any, params: GenerateParams) {
  if(params.images && params.images.length >= 1){
    setLoadImageInput(workflow, "78", params.images?.[0]);
    if(params.images.length >= 2){
      setLoadImageInput(workflow, "79", params.images?.[1]);
      if(params.images.length == 3){
        setLoadImageInput(workflow, "80", params.images?.[2]);
      }
    }
  }
  workflow["111"].inputs.prompt = params.prompt;
  workflow["3"].inputs.steps = 4
  workflow["112"].inputs.width = params.width;
  workflow["112"].inputs.height = params.height;
  if (params.seed) {
    workflow["3"].inputs.seed = params.seed;
  }
  if (params.negative_prompt) {
    workflow["110"].inputs.prompt = params.negative_prompt;
  }
}

function setWaiSDXLV150T2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["30"].inputs.steps = params.steps;
  workflow["5"].inputs.width = params.width;
  workflow["5"].inputs.height = params.height;
  workflow["6"].inputs.text = params.prompt;
  if (params.seed) {
    workflow["30"].inputs.seed = params.seed;
  }
  if (params.negative_prompt) {
    workflow["7"].inputs.text = params.negative_prompt;
  }
}

function setWaiSDXLV170T2IorkflowParams(workflow: any, params: GenerateParams) {
  workflow["3"].inputs.steps = params.steps;
  workflow["5"].inputs.width = params.width;
  workflow["5"].inputs.height = params.height;
  workflow["6"].inputs.text = params.prompt;
  if (params.seed) {
    workflow["3"].inputs.seed = params.seed;
  }
  if (params.negative_prompt) {
    workflow["7"].inputs.text = params.negative_prompt;
  }
}

function setZImageT2IorkflowParams(workflow: any, params: GenerateParams) {
  try {
    // 检查关键节点是否存在
    if (!workflow["68"] || !workflow["68"].inputs) {
      throw new Error('工作流节点 "68" (EmptySD3LatentImage) 不存在');
    }
    if (!workflow["67"] || !workflow["67"].inputs) {
      throw new Error('工作流节点 "67" (CLIPTextEncode Positive) 不存在');
    }
    if (!workflow["69"] || !workflow["69"].inputs) {
      throw new Error('工作流节点 "69" (KSampler) 不存在');
    }
    if (params.negative_prompt && (!workflow["71"] || !workflow["71"].inputs)) {
      throw new Error('工作流节点 "71" (CLIPTextEncode Negative) 不存在');
    }

    // 设置宽高
    workflow["68"].inputs.width = params.width;
    workflow["68"].inputs.height = params.height;

    // 设置正向提示词
    workflow["67"].inputs.text = params.prompt;

    // 设置步数和种子
    workflow["69"].inputs.steps = params.steps;
    if (params.seed) {
      workflow["69"].inputs.seed = params.seed;
    }

    // 负向提示词（如果提供）
    if (params.negative_prompt) {
      workflow["71"].inputs.text = params.negative_prompt;
    }
  } catch (error) {
    console.error('Error setting Z-Image workflow params:', error);
    console.error('Workflow structure:', Object.keys(workflow));
    throw error;
  }
}

function setZImageTurboT2IorkflowParams(workflow: any, params: GenerateParams) {
  try {
    // 检查工作流节点是否存在
    if (!workflow["13"] || !workflow["13"].inputs) {
      throw new Error('工作流节点 "13" (EmptySD3LatentImage) 不存在');
    }
    if (!workflow["6"] || !workflow["6"].inputs) {
      throw new Error('工作流节点 "6" (CLIPTextEncode Positive) 不存在');
    }
    if (!workflow["3"] || !workflow["3"].inputs) {
      throw new Error('工作流节点 "3" (KSampler) 不存在');
    }
    if (params.negative_prompt && (!workflow["7"] || !workflow["7"].inputs)) {
      throw new Error('工作流节点 "7" (CLIPTextEncode Negative) 不存在');
    }

    workflow["13"].inputs.width = params.width;
    workflow["13"].inputs.height = params.height;
    workflow["6"].inputs.text = params.prompt;
    workflow["3"].inputs.steps = params.steps;
    if (params.seed) {
      workflow["3"].inputs.seed = params.seed;
    }
    if (params.negative_prompt) {
      workflow["7"].inputs.text = params.negative_prompt;
    }
  } catch (error) {
    console.error('Error setting Z-Image-Turbo workflow params:', error);
    console.error('Workflow structure:', Object.keys(workflow));
    throw error;
  }
}

function setFlux2T2IorkflowParams(workflow: any, params: GenerateParams) {
  try {
    // 检查工作流节点是否存在
    const requiredNodes = ["6", "8", "9", "10", "12", "13", "16", "22", "25", "26", "38", "47", "48"];
    for (const nodeId of requiredNodes) {
      if (!workflow[nodeId] || !workflow[nodeId].inputs) {
        throw new Error(`工作流节点 "${nodeId}" 不存在或格式不正确`);
      }
    }

    // 验证节点类型
    if (workflow["47"].class_type !== "EmptyFlux2LatentImage") {
      throw new Error(`节点 "47" 类型不正确，期望 "EmptyFlux2LatentImage"，实际为 "${workflow["47"].class_type}"`);
    }
    if (workflow["48"].class_type !== "Flux2Scheduler") {
      throw new Error(`节点 "48" 类型不正确，期望 "Flux2Scheduler"，实际为 "${workflow["48"].class_type}"`);
    }
    if (workflow["6"].class_type !== "CLIPTextEncode") {
      throw new Error(`节点 "6" 类型不正确，期望 "CLIPTextEncode"，实际为 "${workflow["6"].class_type}"`);
    }
    if (workflow["13"].class_type !== "SamplerCustomAdvanced") {
      throw new Error(`节点 "13" 类型不正确，期望 "SamplerCustomAdvanced"，实际为 "${workflow["13"].class_type}"`);
    }

    // 设置参数
    workflow["47"].inputs.width = params.width;
    workflow["47"].inputs.height = params.height;
    workflow["48"].inputs.width = params.width;
    workflow["48"].inputs.height = params.height;
    workflow["48"].inputs.steps = params.steps;
    workflow["6"].inputs.text = params.prompt;
    if (params.seed) {
      workflow["25"].inputs.noise_seed = params.seed;
    }
    // 注意：Flux-2 工作流示例中没有负面提示词节点，如果需要可以添加
  } catch (error) {
    console.error('Error setting Flux-2 workflow params:', error);
    console.error('Workflow structure:', Object.keys(workflow));
    console.error('Workflow nodes:', Object.keys(workflow).map(id => ({
      id,
      class_type: workflow[id]?.class_type,
      hasInputs: !!workflow[id]?.inputs
    })));
    throw error;
  }
}
