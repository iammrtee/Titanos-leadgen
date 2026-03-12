#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---"
npm ci
npm run build 

echo "--- Installing Chrome for Puppeteer ---" | tee build.log
rm -rf ./dist/puppeteer_cache
mkdir -p ./dist/puppeteer_cache

npx puppeteer browsers install chrome --path ./dist/puppeteer_cache | tee -a build.log

echo "--- Verifying Chrome installation ---" | tee -a build.log
ls -R ./dist/puppeteer_cache | tee -a build.log
