#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_DIR="${SCRIPT_DIR}/.quartz-runtime"
QUARTZ_REPOSITORY="https://github.com/jackyzha0/quartz.git"
QUARTZ_COMMIT="3dff48b5df6d84c9544a5ae19c8f2cbb01dc44e5"

if [[ ! -d "${RUNTIME_DIR}/.git" ]]; then
  git clone --filter=blob:none --no-checkout "${QUARTZ_REPOSITORY}" "${RUNTIME_DIR}"
fi

git -C "${RUNTIME_DIR}" fetch --depth=1 origin "${QUARTZ_COMMIT}"
git -C "${RUNTIME_DIR}" checkout --detach "${QUARTZ_COMMIT}"
git -C "${RUNTIME_DIR}" clean -fdx

mkdir -p "${RUNTIME_DIR}/content" "${RUNTIME_DIR}/quartz/styles" "${RUNTIME_DIR}/scripts"
cp "${SCRIPT_DIR}/quartz.config.yaml" "${RUNTIME_DIR}/quartz.config.yaml"
cp "${SCRIPT_DIR}/quartz.ts" "${RUNTIME_DIR}/quartz.ts"
cp "${SCRIPT_DIR}/styles/custom.scss" "${RUNTIME_DIR}/quartz/styles/custom.scss"
cp "${SCRIPT_DIR}/content/index.md" "${RUNTIME_DIR}/content/index.md"
cp "${SCRIPT_DIR}/scripts/enrich-topics.mjs" "${RUNTIME_DIR}/scripts/enrich-topics.mjs"
cp -R "${REPOSITORY_ROOT}/News" "${RUNTIME_DIR}/content/News"
cp -R "${REPOSITORY_ROOT}/Topics" "${RUNTIME_DIR}/content/Topics"

find "${RUNTIME_DIR}/content" -name .gitkeep -delete
node "${RUNTIME_DIR}/scripts/enrich-topics.mjs" "${RUNTIME_DIR}/content"

npm --prefix "${RUNTIME_DIR}" ci
(
  cd "${RUNTIME_DIR}"
  npx quartz plugin install
  npx quartz build
)

printf 'Quartz site built at %s\n' "${RUNTIME_DIR}/public"
