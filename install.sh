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

echo "[1/7] Installing required system packages (PostgreSQL, Node.js, Nginx)..."
# Update and install postgresql, curl
apt-get update -yqq
apt-get install -yqq postgresql postgresql-contrib curl sudo

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
echo "[2/7] Let's configure your Bot..."
read -p "Enter your Bale Bot Token: " BALE_BOT_TOKEN
read -p "Enter your Admin Chat ID (numeric ID in Bale): " ADMIN_CHAT_ID

echo ""
echo "[3/7] Setting up PostgreSQL Database..."
DB_NAME="bale_panel_db"
DB_USER="bale_panel_user"
# Generate a random password for the DB
DB_PASS=$(openssl rand -hex 12)

# Run postgres commands
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" || echo "Database may already exist"
sudo -u postgres psql -c "CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';" || echo "User may already exist"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;"

# Add to .env
echo ""
echo "[4/7] Generating .env file..."
cat <<ENV_EOF > .env
BALE_BOT_TOKEN=$BALE_BOT_TOKEN
SQL_HOST=127.0.0.1
SQL_DB_NAME=$DB_NAME
SQL_USER=$DB_USER
SQL_PASSWORD=$DB_PASS
APP_URL=http://localhost:3000
PORT=3000
ENV_EOF
echo ".env file created successfully."

echo ""
echo "[5/7] Installing Node.js dependencies..."
npm install

echo ""
echo "[6/7] Applying Database Schema (Migrations) & Setting Admin ID..."
npx drizzle-kit push --config=src/db/drizzle.config.ts

# Insert/Update the admin ID in the database using a quick node script
cat <<DB_EOF > set_admin.ts
import { db } from './src/db/index.ts';
import { settings } from './src/db/schema.ts';
async function run() {
    await db.insert(settings).values({ key: 'adminChatId', value: '$ADMIN_CHAT_ID' }).onConflictDoUpdate({ target: settings.key, set: { value: '$ADMIN_CHAT_ID' } });
    console.log("Admin Chat ID saved to DB.");
    process.exit(0);
}
run();
DB_EOF
npx tsx set_admin.ts
rm set_admin.ts

echo ""
echo "[7/7] Building and Starting the application with PM2..."
npm run build
pm2 start npm --name "bale-panel" -- run start
pm2 save
pm2 startup

echo "================================================="
echo "   Installation Completed Successfully!          "
echo "================================================="
echo "Your app is now running on http://YOUR_SERVER_IP:3000"
echo "You can monitor the logs anytime using: pm2 logs bale-panel"
