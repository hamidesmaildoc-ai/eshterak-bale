#!/bin/bash
set -e

echo "================================================="
echo "   Bale Bot Panel - Automated Installation       "
echo "================================================="
echo ""

# Check for root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

echo "[1/4] Installing required system packages (Node.js)..."
# Update and install curl
apt-get update -yqq
apt-get install -yqq curl sudo

# Install Node.js (v20)
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -yqq nodejs
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo ""
echo "[2/4] Let's configure your Bot..."
read -p "Enter your Bale Bot Token: " BALE_BOT_TOKEN
read -p "Enter your Admin Chat ID (numeric ID in Bale): " ADMIN_CHAT_ID

echo ""
echo "[3/4] Generating .env file..."
cat <<ENV_EOF > .env
BALE_BOT_TOKEN=$BALE_BOT_TOKEN
PORT=8080
ADMIN_CHAT_ID=$ADMIN_CHAT_ID
ENV_EOF
echo ".env file created successfully."

echo ""
echo "[4/4] Installing Node.js dependencies, Building and Starting with PM2..."
npm install dotenv
npm install

npm run build

# Stop existing if any
pm2 stop bale-panel 2>/dev/null || true
pm2 delete bale-panel 2>/dev/null || true

pm2 start dist/server.cjs --name "bale-panel"
pm2 save
pm2 startup

echo "================================================="
echo "   Installation Completed Successfully!          "
echo "================================================="
echo "Your app is now running and PM2 will keep it alive."
echo "You can monitor the logs anytime using: pm2 logs bale-panel"
