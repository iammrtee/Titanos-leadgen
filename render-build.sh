#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---"
npm ci
npm run build # this creates dist

echo "--- Installing Chrome for Puppeteer ---" | tee dist/build.log
rm -rf ./dist/browser_bin
mkdir -p ./dist/browser_bin

npx puppeteer browsers install chrome --path ./dist/browser_bin | tee -a dist/build.log

echo "--- Verifying Chrome installation ---" | tee -a dist/build.log
ls -R ./dist/browser_bin | tee -a dist/build.log
