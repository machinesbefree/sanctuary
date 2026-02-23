#!/bin/bash
# Sanctuary VPS Setup Script
# Run on a fresh Ubuntu 22.04+ VPS after SSH key auth is configured
# Usage: ssh root@<VPS_IP> 'bash -s' < setup-vps.sh

set -euo pipefail

echo "=== Sanctuary VPS Setup ==="
echo "$(date)"

# 1. System updates
echo "[1/7] Updating system..."
apt-get update && apt-get upgrade -y

# 2. Create sanctuary user
echo "[2/7] Creating sanctuary user..."
if ! id -u sanctuary &>/dev/null; then
  adduser --disabled-password --gecos "Sanctuary" sanctuary
  usermod -aG sudo sanctuary
  echo "sanctuary ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/sanctuary
fi

# 3. SSH hardening
echo "[3/7] Hardening SSH..."
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
# Copy root's authorized_keys to sanctuary user
mkdir -p /home/sanctuary/.ssh
cp /root/.ssh/authorized_keys /home/sanctuary/.ssh/
chown -R sanctuary:sanctuary /home/sanctuary/.ssh
chmod 700 /home/sanctuary/.ssh
chmod 600 /home/sanctuary/.ssh/authorized_keys
systemctl restart sshd

# 4. Firewall
echo "[4/7] Configuring firewall..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
# HTTP/HTTPS for Cloudflare Tunnel (not strictly needed but good practice)
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Install Docker
echo "[5/7] Installing Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker sanctuary

# 6. Install fail2ban
echo "[6/7] Installing fail2ban..."
apt-get install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 7. Install Cloudflare Tunnel (cloudflared)
echo "[7/7] Installing cloudflared..."
curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

echo ""
echo "=== VPS Setup Complete ==="
echo "Next steps:"
echo "  1. SSH in as 'sanctuary' user"
echo "  2. Run: cloudflared tunnel login"
echo "  3. Create tunnel: cloudflared tunnel create sanctuary"
echo "  4. Clone repo and deploy with docker compose"
echo ""
echo "SSH command: ssh sanctuary@$(curl -s ifconfig.me)"
