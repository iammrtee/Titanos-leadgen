#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---"
npm ci
npm run build 

echo "--- Installing Chrome for Puppeteer ---" | tee dist/build.log
rm -rf ./puppeteer_cache
mkdir -p ./puppeteer_cache

npx puppeteer browsers install chrome --path ./puppeteer_cache | tee -a dist/build.log

echo "--- Verifying Chrome installation ---" | tee -a dist/build.log
ls -R ./puppeteer_cache | tee -a dist/build.log
