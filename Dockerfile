# ===== 构建阶段 =====
FROM node:20-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm@9.0.0

WORKDIR /app

# 复制依赖描述文件
COPY package.json pnpm-lock.yaml ./

# 安装所有依赖（包含 devDependencies，构建需要）
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
RUN pnpm build

# ===== 运行阶段 =====
FROM node:20-alpine AS runner

# 安装 pnpm（运行时用于安装生产依赖）
RUN npm install -g pnpm@9.0.0

WORKDIR /app

# 仅复制运行所需文件
COPY package.json pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist

# 只安装生产依赖（忽略 postinstall 的 git hooks 脚本）
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# 漫画下载目录（挂载此目录可持久化下载内容）
VOLUME ["/app/comics"]

# 环境变量（可在 docker run 时通过 -e 覆盖）
ENV PICA_ACCOUNT=""
ENV PICA_PASSWORD=""
ENV PICA_PROXY=""
ENV PICA_DL_CONCURRENCY="5"
ENV PICA_DL_CONTENT=""
ENV PICA_DL_SEARCH_KEYWORDS=""

# 默认运行 pica-cli
ENTRYPOINT ["node", "dist/index.js"]
