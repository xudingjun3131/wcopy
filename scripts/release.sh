#!/usr/bin/env bash
#
# wcopy 发布脚本（Tauri / Rust 版）
#
# 用法：
#   ./scripts/release.sh            # 默认 patch 版本号 +1（如 1.1.0 -> 1.1.1）
#   ./scripts/release.sh minor      # 次版本号 +1（如 1.1.0 -> 1.2.0）
#   ./scripts/release.sh major      # 主版本号 +1（如 1.1.0 -> 2.0.0）
#   ./scripts/release.sh 1.2.3      # 直接使用指定版本号
#
# 做了什么：
#   1. 用 npm version 把 package.json 的 version 改成新版本（不自动 commit/tag）
#   2. 同步把 src-tauri/Cargo.toml 的 version 改成同样的新版本
#   3. 提交并打【annotated】tag：v<版本号>（tag 就是版本号）
#   4. git push 并推送 tag —— 推送 tag 后 GitHub Actions 才会打包构建
#
# 注意：构建只在 tag（v*）触发，普通 push 不会构建。
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

# 校验：显式版本号需符合 semver
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  if ! [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "错误：版本号必须是 semver，例如 1.2.3，或填 patch/minor/major" >&2
    exit 1
  fi
fi

# 先拉取，避免本地落后导致 push 被拒
git pull --ff-only || echo "（git pull 跳过或失败，继续）"

# 更新 package.json 版本（不自动提交 / 不打 tag）
npm version "$BUMP" --no-git-tag-version

NEW_VERSION="$(node -p "require('./package.json').version")"

# 同步 Cargo.toml 的 version（Tauri 安装包的版本来源）
sed -i.bak -E "s/^version = \"[0-9]+\.[0-9]+\.[0-9]+\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak

echo "新版本: $NEW_VERSION（package.json + Cargo.toml 已同步）"

# 提交并打 annotated tag（annotated 才能被 git push --follow-tags 推送）
git add package.json src-tauri/Cargo.toml
git commit -m "release: v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"

# 推送 commit 与新 tag；推送 tag 即触发 CI 构建
git push --follow-tags

echo "✅ 已推送 v${NEW_VERSION}，GitHub Actions 正在打包（仅 tag 触发）"
