#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Build Step: Installing dependencies ---"
npm ci

echo "--- Build Step: Building application ---"
npm run build

echo "--- Build Step: Checking current directory ---"
pwd
ls -la

echo "--- Build Step: Installing Puppeteer Chrome ---"
# Use a local path that is definitely within the build context
export PUPPETEER_CACHE_DIR=$(pwd)/chrome_bin
echo "Using PUPPETEER_CACHE_DIR: $PUPPETEER_CACHE_DIR"

npx puppeteer browsers install chrome --path $PUPPETEER_CACHE_DIR

echo "--- Build Step: Verifying installation ---"
if [ -d "$PUPPETEER_CACHE_DIR" ]; then
    echo "✅ Cache directory created at $PUPPETEER_CACHE_DIR"
    find $PUPPETEER_CACHE_DIR -name chrome -type f -ls
else
    echo "❌ Cache directory NOT found!"
fi

echo "--- Build Step: Saving build log to dist ---"
# This allows us to see the log via the API after a successful start
mkdir -p dist
ls -la $PUPPETEER_CACHE_DIR > dist/build.log 2>&1
find $PUPPETEER_CACHE_DIR -name chrome >> dist/build.log 2>&1
