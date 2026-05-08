const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');

const projectRoot = path.join(__dirname, '..');
const publicRoot = path.join(projectRoot, 'public');
const outputFile = path.join(projectRoot, 'src', 'utils', 'homepageAssets.ts');
const ossRoot = 'homepage-assets';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, '.env.local'));

const requiredEnv = ['OSS_AK', 'OSS_SK', 'OSS_BUCKET', 'OSS_ENDPOINT'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing OSS env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const client = new OSS({
  accessKeyId: process.env.OSS_AK,
  accessKeySecret: process.env.OSS_SK,
  bucket: process.env.OSS_BUCKET,
  endpoint: process.env.OSS_ENDPOINT,
  secure: true,
});

const modelCoverPaths = fs
  .readdirSync(path.join(publicRoot, 'models'), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `/models/${entry.name}`);

const assetPaths = [
  ...modelCoverPaths,
  '/images/gpt-image-2.png',
  '/models/homepageModelCover/demo.jpg',
  '/models/homepageModelCover/grok-imagine-1.0.png',
  '/models/homepageModelCover/grok-video.png',
  '/models/homepageModelCover/nano-banana-2.png',
  '/models/homepageModelCover/qwen-image-edit.png',
  '/models/homepageModelCover/wai.png',
  '/models/homepageModelCover/wai17.png',
  '/models/homepageModelCover/wan-video.png',
  '/models/homepageModelCover/Z-Image-turbo.png',
  '/models/homepageModelCover/Z-Image.png',
  '/workflows/homepageWorkflowCover/demo.jpg',
  '/workflows/homepageWorkflowCover/fix.png',
  '/workflows/homepageWorkflowCover/scale.png',
  ...Array.from({ length: 12 }, (_, index) => `/images/video-community/video-demo-${index + 1}.png`),
  ...Array.from({ length: 12 }, (_, index) => `/images/video-community/video-demo-${index + 1}.mp4`),
];

const contentTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
};

function normalizeUrl(url) {
  return String(url).replace(/^http:/, 'https:');
}

function objectNameFor(localPath) {
  return `${ossRoot}${localPath}`;
}

function renderAssetMap(map) {
  const entries = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([localPath, ossUrl]) => `  ${JSON.stringify(localPath)}: ${JSON.stringify(ossUrl)},`)
    .join('\n');

  return `export const HOMEPAGE_OSS_ASSET_MAP: Record<string, string> = {\n${entries}\n};\n\nexport function getHomepageAsset(localPath: string): string {\n  return HOMEPAGE_OSS_ASSET_MAP[localPath] || localPath;\n}\n\nexport function getHomepageAssetFallback(assetPath: string, fallbackPath?: string): string {\n  return fallbackPath || (assetPath.startsWith('/') ? assetPath : '');\n}\n`;
}

async function main() {
  const uploaded = {};

  for (const localPath of assetPaths) {
    const filePath = path.join(publicRoot, localPath.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      console.warn(`Skip missing asset: ${localPath}`);
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const objectName = objectNameFor(localPath);
    const headers = contentTypes[ext] ? { 'Content-Type': contentTypes[ext] } : undefined;
    const result = await client.put(objectName, filePath, headers ? { headers } : undefined);
    uploaded[localPath] = normalizeUrl(result.url);
    console.log(`${localPath} -> ${uploaded[localPath]}`);
  }

  fs.writeFileSync(outputFile, renderAssetMap(uploaded), 'utf8');
  console.log(`\nWrote ${Object.keys(uploaded).length} assets to ${path.relative(projectRoot, outputFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
