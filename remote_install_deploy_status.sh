cat > /usr/local/bin/deploy-wed-status <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "Repo commit: $(git -C /opt/wed-src rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
echo "Target exists: $(test -d /var/www/wed && echo yes || echo no)"
echo "Nginx: $(systemctl is-active nginx)"
if command -v curl >/dev/null 2>&1; then
  echo -n "HTTPS: "
  curl -k -I -s https://nastiaitimur.ru/ | head -n 1 || echo "unreachable"
  echo -n "HTTP: "
  curl -I -s http://nastiaitimur.ru:8080/ | head -n 1 || echo "unreachable"
else
  echo "curl not installed"
fi
EOF

chmod +x /usr/local/bin/deploy-wed-status
/usr/local/bin/deploy-wed-status
