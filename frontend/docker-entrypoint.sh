#!/bin/sh
set -e
cat > /usr/share/nginx/html/config.js <<EOF
window.__MUAMBA_API__ = "${MUAMBA_API_URL:-}";
EOF

exec nginx -g 'daemon off;'
