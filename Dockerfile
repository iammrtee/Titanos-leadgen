# Use official Puppeteer image which has Chrome and deps pre-installed
FROM ghcr.io/puppeteer/puppeteer:24.38.0

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Create app directory
WORKDIR /app

# The official image uses a 'puppeteer' user by default.
# Switch to root to install/set up, then switch back if needed.
USER root

# Copy package files
COPY package*.json ./

# Install dependencies (ignoring the scripts that try to download chrome)
RUN npm ci --ignore-scripts

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Ensure the app can run on port 10000 (Render's default)
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
