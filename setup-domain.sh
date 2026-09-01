#!/bin/bash
set -e

echo "================================================="
echo "   Bale Bot Panel - Domain & SSL Setup           "
echo "================================================="
echo ""

# Check for root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

echo "⚠️ IMPORTANT: Before proceeding, make sure your domain's DNS (A Record)"
echo "is pointing to this server's IP address!"
echo ""
read -p "Enter your Domain Name (e.g., panel.yourdomain.com): " DOMAIN
read -p "Enter your Email (for SSL renewal notifications): " EMAIL

echo ""
echo "[1/4] Installing Nginx and Certbot..."
apt-get update -yqq
apt-get install -yqq nginx certbot python3-certbot-nginx

echo ""
echo "[2/4] Configuring Nginx Reverse Proxy..."
# Create Nginx configuration
cat <<NGINX_EOF > /etc/nginx/sites-available/$DOMAIN
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # Real IP headers
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_EOF

# Enable the site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
# Remove default nginx site if exists
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx

echo ""
echo "[3/4] Securing with SSL (Let's Encrypt)..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect

echo ""
echo "[4/4] Finalizing setup..."
systemctl restart nginx

echo "================================================="
echo "   Domain & SSL Setup Completed Successfully!    "
echo "================================================="
echo "You can now securely access your panel at: https://$DOMAIN"
