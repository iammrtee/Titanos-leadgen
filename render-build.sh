#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
npm run build

# Verify build output
echo "Checking build output..."
ls -R dist

# Install Puppeteer browsers in the cache directory
# This ensures they are persisted between builds on Render if path matches
npx puppeteer browsers install chromium
