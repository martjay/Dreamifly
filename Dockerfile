# 使用官方 Node.js 22 Alpine 镜像
# FROM node:22-alpine AS base
FROM base-mirror.tencentcloudcr.com/tekton/base/node:21-alpine AS base

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV DATABASE_URL=''

# 构建阶段
FROM base  AS builder

# 安装 pnpm
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION=10.33.0
RUN npm install -g pnpm@${PNPM_VERSION} --registry=${NPM_REGISTRY}

# 复制配置文件（这些文件变化较少，利于缓存）
COPY next.config.js ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY postcss.config.mjs ./
COPY tsconfig.json ./
COPY drizzle.config.json ./

# 复制源代码和必要的文件
COPY package.json pnpm-lock.yaml ./
COPY public ./public
COPY src ./src
COPY drizzle ./drizzle
COPY eslint.config.mjs ./
COPY .env ./
COPY fonts ./fonts
COPY scripts ./scripts

RUN echo "registry=${NPM_REGISTRY}" > .npmrc

# 安装依赖
RUN pnpm install --frozen-lockfile

# 构建应用
RUN pnpm run build

# 生产运行阶段
FROM base AS runner

# 安装 pnpm（运行时也需要）
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PNPM_VERSION=10.33.0
RUN npm install -g pnpm@${PNPM_VERSION} --registry=${NPM_REGISTRY}

# 安装必要的系统工具和字体管理工具
RUN apk add --no-cache curl fontconfig ttf-dejavu

# 复制构建结果
COPY --from=builder  /app/.next ./.next
COPY --from=builder  /app/public ./public
COPY --from=builder  /app/node_modules ./node_modules
COPY --from=builder  /app/package.json ./package.json

# 复制必要的配置文件和脚本
COPY --from=builder  /app/next.config.js ./
COPY --from=builder  /app/scripts ./scripts

# 将字体文件复制到系统字体目录并更新字体缓存
RUN mkdir -p /usr/share/fonts/truetype
COPY --from=builder  /app/fonts/*.ttf /usr/share/fonts/truetype/
RUN fc-cache -fv && echo "字体缓存已更新"

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动应用
CMD ["pnpm", "start"]
