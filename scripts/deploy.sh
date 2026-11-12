#!/usr/bin/env bash
# 手动发布到 GitHub Pages：本地构建，把 dist/ 作为唯一一次提交强推到 gh-pages 分支。
# gh-pages 只放构建产物，每次发布整体覆盖、不保留历史；源码历史在 main，不受影响。
# 不经过 CI：什么时候发布由人决定。用法：npm run deploy
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交的改动，先提交或收起再发布（发布的应当是某个确定的提交）。" >&2
  exit 1
fi

remote=$(git remote get-url origin)
rev=$(git rev-parse --short HEAD)
name=$(git config user.name)
email=$(git config user.email)

npm run build

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r dist/. "$tmp"
# 告诉 GitHub Pages 不要用 Jekyll 处理，原样提供文件
touch "$tmp/.nojekyll"

git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" -c user.name="$name" -c user.email="$email" commit -q -m "发布 $rev"
git -C "$tmp" push -q -f "$remote" gh-pages

echo "已发布 $rev 到 gh-pages 分支。"
