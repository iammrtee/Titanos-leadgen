#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---"
npm ci
npm run build # this runs tsc

echo "--- Installing Chrome for Puppeteer ---"
# Clear any old attempts to be safe
rm -rf ./puppeteer_cache
mkdir -p ./puppeteer_cache

# Install exactly where we want it
npx puppeteer browsers install chrome --path ./puppeteer_cache

echo "--- Verifying Chrome installation ---"
if [ -d "./puppeteer_cache" ]; then
    echo "Directory exists"
    find ./puppeteer_cache -maxdepth 3
else
    echo "ERROR: Directory not found"
    exit 1
fi
