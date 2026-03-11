#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---" | tee build.log
npm ci | tee -a build.log
npm run build | tee -a build.log

echo "--- Installing Chrome for Puppeteer ---" | tee -a build.log
rm -rf ./puppeteer_cache
mkdir -p ./puppeteer_cache

npx puppeteer browsers install chrome --path ./puppeteer_cache | tee -a build.log

echo "--- Verifying Chrome installation ---" | tee -a build.log
ls -R ./puppeteer_cache | tee -a build.log
