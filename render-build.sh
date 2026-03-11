#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---" | tee dist/build.log
npm ci | tee -a dist/build.log
npm run build | tee -a dist/build.log

echo "--- Installing Chrome for Puppeteer ---" | tee -a dist/build.log
rm -rf ./browser_bin
mkdir -p ./browser_bin

npx puppeteer browsers install chrome --path ./browser_bin | tee -a dist/build.log

echo "--- Verifying Chrome installation ---" | tee -a dist/build.log
ls -R ./browser_bin | tee -a dist/build.log
