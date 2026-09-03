#!/usr/bin/env bash
#
# wcopy 发布脚本
#
# 用法：
#   ./scripts/release.sh            # 默认 patch 版本号 +1（如 1.0.0 -> 1.0.1）
#   ./scripts/release.sh minor      # 次版本号 +1（如 1.0.0 -> 1.1.0）
#   ./scripts/release.sh major      # 主版本号 +1（如 1.0.0 -> 2.0.0）
#   ./scripts/release.sh 1.2.3      # 直接使用指定版本号
#
# 做了什么：
#   1. 用 npm version 把 package.json 的 version 改成新版本（同时 commit）
#   2. 自动打 tag：v<版本号>（如 v1.0.1）—— tag 就是版本号
#   3. git push 并推送 tag —— 推送 tag 后 GitHub Actions 才会打包构建
#
# 注意：构建只在 tag（v*）触发，普通 push 不会构建。
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

# 校验：显式版本号需符合 semver
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" && "$BUMP" != "pre"* ]]; then
  if ! [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "错误：版本号必须是 semver，例如 1.2.3，或填 patch/minor/major" >&2
    exit 1
  fi
fi

# 先拉取，避免本地落后导致 push 被拒
git pull --ff-only || echo "（git pull 跳过或失败，继续）"

# npm version：更新 package.json、生成 commit、打 tag v<版本>
npm version "$BUMP" -m "release: v%s"

NEW_VERSION="$(node -p "require('./package.json').version")"
echo "已打 tag: v${NEW_VERSION}"

# 推送 commit 与新 tag；推送 tag 即触发 CI 构建
git push --follow-tags

echo "✅ 已推送 v${NEW_VERSION}，GitHub Actions 正在打包（仅 tag 触发）"
