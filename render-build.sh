#!/usr/bin/env bash
# exit on error
set -o errexit

echo "--- Starting Build ---"
npm ci
npm run build

echo "--- Installing Chrome for Puppeteer ---"
# Clear any old attempts
rm -rf ./puppeteer_cache
mkdir -p ./puppeteer_cache

# Use the exact path we want to persist
npx puppeteer browsers install chrome --path ./puppeteer_cache

echo "--- Verifying Chrome installation ---"
if [ -d "./puppeteer_cache" ]; then
    echo "Directory exists"
    find ./puppeteer_cache -maxdepth 3
else
    echo "ERROR: Directory not found"
    exit 1
fi
