const nextConfig = {
  serverExternalPackages: ['ali-oss'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // 替换为具体域名更安全
      },
    ],
  },

  // 根据资源类型设置合适的缓存策略，避免页面/JS 长时间不更新
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Vary', value: 'Accept-Encoding, User-Agent' },
          { key: 'X-Powered-By', value: '' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Vary', value: 'Accept-Encoding' },
        ],
      },
    ];
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  outputFileTracingExcludes: {
    '*': [
      '**/.git/**',
      '**/node_modules/**',
      '**/.cache/**',
      '**/trace',
      '**/trace/**',
    ],
  },

  async redirects() {
    return [
      { source: '/zh', destination: '/', permanent: true },
      { source: '/zh/:path*', destination: '/:path*', permanent: true },
      { source: '/en', destination: '/', permanent: true },
      { source: '/en/:path*', destination: '/:path*', permanent: true },
      { source: '/zh-TW', destination: '/', permanent: true },
      { source: '/zh-TW/:path*', destination: '/:path*', permanent: true },
    ];
  },
};

module.exports = nextConfig;
