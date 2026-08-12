#!/usr/bin/env bash
# 幂等生成 TokenMP 跨服务共享密钥与连接串。
#
# 背景: dashboard 与 executor 两个容器必须共享同一份密钥, 否则双方生成/加密的
#       API Key、上游 Key 无法互验。本脚本把所有共享机密集中写到一个文件,
#       两个 docker compose 都用 env_file 引用它 —— 单一来源, 轮换改一处即可。
#
# 用法:
#   bash gen-secrets.sh [输出文件]      # 默认 /opt/tokenmp/secrets.env
#   # 连接参数可用环境变量覆盖 (见下方 PG_*)
#
# 行为:
#   - 密钥 (JWT_SECRET / API_KEY_PEPPER / MASTER_ENCRYPTION_KEY / INTERNAL_API_TOKEN / PG_PASS):
#     已存在则保留, 否则 openssl rand 生成 —— 幂等, 重复运行安全。
#   - DATABASE_URL: 由 PG_PASS + 连接参数派生, 每次运行重算 (保证密码单一来源, 不重复写)。
#   - 改连接参数 (PG_HOST 等) 后重跑即更新 DATABASE_URL, 不会轮换已存在的 PG_PASS。
#   - 文件权限强制 600。
#
# 依赖: bash 4+ (关联数组) + openssl。Linux 服务器自带。
set -euo pipefail

OUT="${1:-/opt/tokenmp/secrets.env}"

# PostgreSQL 连接参数 (非密钥, 可用环境变量覆盖)
PG_HOST="${PG_HOST:-1Panel-postgresql-eyuK}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DB:-tokenmp}"
PG_USER="${PG_USER:-tokenmp}"

# 密钥 → 生成命令
declare -A SPEC=(
  [JWT_SECRET]="openssl rand -hex 32"             # HS256 要求 ≥32 字节 → 64 hex 字符
  [API_KEY_PEPPER]="openssl rand -hex 24"         # ⚠️ 须 dashboard/executor 一致: API Key 哈希 pepper
  [MASTER_ENCRYPTION_KEY]="openssl rand -hex 32"  # ⚠️ 须 dashboard/executor 一致: 上游账号加密主密钥
  [INTERNAL_API_TOKEN]="openssl rand -hex 32"     # executor 内部接口令牌 (/internal/*, executor 自用)
  [PG_PASS]="openssl rand -hex 16"                # PostgreSQL tokenmp 账号密码
)
SECRETS=(JWT_SECRET API_KEY_PEPPER MASTER_ENCRYPTION_KEY INTERNAL_API_TOKEN PG_PASS)
# 文件输出顺序 (DATABASE_URL 派生项放最后)
ORDER=(JWT_SECRET API_KEY_PEPPER MASTER_ENCRYPTION_KEY INTERNAL_API_TOKEN PG_PASS DATABASE_URL)

mkdir -p "$(dirname "$OUT")"
touch "$OUT"
chmod 600 "$OUT"

# 读取已有值
declare -A V=()
while IFS='=' read -r k v; do
  [[ -z "${k:-}" || "$k" =~ ^[[:space:]]*# ]] && continue
  V["$k"]="$v"
done < "$OUT" || true

# 密钥: 缺则生成 (幂等保留已有)
echo ">> 写入 $OUT"
for key in "${SECRETS[@]}"; do
  if [[ -n "${V[$key]:-}" ]]; then
    echo "   keep   $key  (已存在, 保留)"
  else
    V[$key]=$(${SPEC[$key]})
    echo "   gen    $key"
  fi
done

# DATABASE_URL: 派生 (密码 = PG_PASS, 单一来源, 消除两处写)
V[DATABASE_URL]="postgres://${PG_USER}:${V[PG_PASS]}@${PG_HOST}:${PG_PORT}/${PG_DB}?sslmode=disable"
echo "   deriv  DATABASE_URL  (由 PG_PASS + 连接参数派生)"

# 整体重写 (保持顺序 + 头部说明)
{
  echo "# TokenMP 共享机密 —— 由 gen-secrets.sh 生成, 勿手动编辑密钥值。"
  echo "# dashboard 与 executor 的 docker compose 均通过 env_file 引用本文件。"
  echo
  for key in "${ORDER[@]}"; do
    printf '%s=%s\n' "$key" "${V[$key]}"
  done
} > "$OUT"
chmod 600 "$OUT"

echo "✓ 密钥文件已就绪: $OUT"
echo "  下一步: dashboard / executor 的 docker compose 都用 env_file 引用它。"
