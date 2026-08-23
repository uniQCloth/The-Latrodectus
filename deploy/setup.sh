#!/bin/bash
# VPS Setup Script — Ubuntu 22.04
# Run as root: bash setup.sh
# Sets up: Node.js 20, PostgreSQL 15, Nginx, PM2, Let's Encrypt

set -e

DOMAIN="YOUR_DOMAIN_HERE"
DB_NAME="widow_spider"
DB_USER="wsm_user"
DB_PASS="$(openssl rand -base64 24)"
APP_DIR="/var/www/widow-spider"

echo "🕷  Widow Spider Multiplier — VPS Setup"
echo "======================================="

# ── System update ─────────────────────────────────────────────────────────────
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# ── Node.js 20 ────────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "Node: $(node -v) | npm: $(npm -v)"

# ── PM2 ───────────────────────────────────────────────────────────────────────
npm install -g pm2

# ── PostgreSQL 15 ─────────────────────────────────────────────────────────────
apt install -y postgresql postgresql-contrib
systemctl enable postgresql && systemctl start postgresql

# Create database + user
sudo -u postgres psql <<EOF
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

echo ""
echo "✅ Database created: ${DB_NAME}"
echo "   User: ${DB_USER}"
echo "   Pass: ${DB_PASS}  ← SAVE THIS"
echo ""

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p ${APP_DIR}
mkdir -p /var/log/widow-spider

# ── Clone / copy repo ─────────────────────────────────────────────────────────
# If deploying from git:
# git clone YOUR_REPO_URL ${APP_DIR}
# If copying from local:
# rsync -avz /home/bryce/Widow\ Spider\ Multiplier/ root@YOUR_VPS_IP:${APP_DIR}/

cd ${APP_DIR}

# ── Install server deps ───────────────────────────────────────────────────────
cd server && npm install --production && cd ..

# ── Build client ──────────────────────────────────────────────────────────────
cd client && npm install && npm run build && cd ..

# ── Environment file ──────────────────────────────────────────────────────────
cat > ${APP_DIR}/server/.env <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
ALLOWED_ORIGINS=https://${DOMAIN}
EOF
echo "✅ .env written"

# ── Run DB schema ─────────────────────────────────────────────────────────────
sudo -u postgres psql -d ${DB_NAME} -f ${APP_DIR}/server/db/schema.sql
echo "✅ DB schema applied"

# ── Nginx ─────────────────────────────────────────────────────────────────────
sed "s/YOUR_DOMAIN_HERE/${DOMAIN}/g" ${APP_DIR}/deploy/nginx.conf \
  > /etc/nginx/sites-available/widow-spider

ln -sf /etc/nginx/sites-available/widow-spider /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ Nginx configured"

# ── SSL (Let's Encrypt) ───────────────────────────────────────────────────────
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN}
echo "✅ SSL certificate issued"

# ── Firewall ──────────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "✅ Firewall configured"

# ── PM2 ───────────────────────────────────────────────────────────────────────
cd ${APP_DIR}
pm2 start deploy/ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash
echo "✅ PM2 started and configured for auto-restart"

echo ""
echo "🕷  SETUP COMPLETE"
echo "   Your game: https://${DOMAIN}"
echo "   Health:    https://${DOMAIN}/api/health"
echo "   Logs:      pm2 logs widow-spider"
echo ""
