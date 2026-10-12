#!/usr/bin/env bash
# Runs ON the EC2 instance as root — sent there over SSM by
# .github/workflows/deploy.yml on every push to main. Idempotent: the first
# run also installs Docker and starts Caddy (HTTPS + reverse proxy).
#
#   internet ──443──▶ caddy (Let's Encrypt cert for $DOMAIN, auto-renewed)
#                       └──▶ app:8080 (Django API + React build, one image)
#
# Zero-downtime swap: the new container joins the network under the same
# "app" alias, and the old one is only removed once the new one is healthy.
# If the new one never becomes healthy, it is removed and the old keeps serving.
set -euo pipefail
: "${IMAGE:?IMAGE is required}" "${DOMAIN:?DOMAIN is required}" "${AWS_REGION:?AWS_REGION is required}"

APP_DIR=/opt/acupressure
NET=acupressure
TAG="${IMAGE##*:}"
NEW="acupressure-app-${TAG}"

echo "== Docker =="
command -v docker >/dev/null || dnf install -y docker
systemctl enable --now docker

# The previous setup (nginx + certbot, backend on 127.0.0.1:8000) held ports
# 80/443 — Caddy replaces all of it.
if systemctl is-active --quiet nginx 2>/dev/null; then systemctl disable --now nginx; fi
docker rm -f acupressure-backend >/dev/null 2>&1 || true

mkdir -p "$APP_DIR"
if [ ! -s "$APP_DIR/secret_key" ]; then
  (umask 077; head -c 48 /dev/urandom | base64 | tr -d '\n' > "$APP_DIR/secret_key")
fi
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null

echo "== App: $IMAGE =="
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${IMAGE%%/*}"
docker pull -q "$IMAGE"
docker rm -f "$NEW" >/dev/null 2>&1 || true
docker run -d --name "$NEW" --label acupressure.role=app \
  --network "$NET" --network-alias app --restart always --memory 600m \
  -e DJANGO_ALLOWED_HOSTS="${DOMAIN},127.0.0.1,localhost" \
  -e DJANGO_SECRET_KEY="$(cat "$APP_DIR/secret_key")" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  STATE="$(docker inspect -f '{{.State.Health.Status}}' "$NEW")"
  [ "$STATE" = healthy ] && break
  sleep 3
done
if [ "$STATE" != healthy ]; then
  echo "New container did not become healthy (state: $STATE) — keeping the old one." >&2
  docker logs --tail 50 "$NEW" >&2 || true
  docker rm -f "$NEW" >/dev/null
  exit 1
fi
for old in $(docker ps -aq --filter label=acupressure.role=app); do
  [ "$(docker inspect -f '{{.Name}}' "$old")" = "/$NEW" ] || docker rm -f "$old" >/dev/null
done

echo "== Caddy: https://$DOMAIN =="
cat > "$APP_DIR/Caddyfile" <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy app:8080 {
		lb_try_duration 10s
	}
}
EOF
docker pull -q caddy:2-alpine >/dev/null
LATEST_CADDY="$(docker image inspect -f '{{.Id}}' caddy:2-alpine)"
RUNNING_CADDY="$(docker inspect -f '{{.Image}}' caddy 2>/dev/null || true)"
if [ "$RUNNING_CADDY" != "$LATEST_CADDY" ]; then
  docker rm -f caddy >/dev/null 2>&1 || true
  docker run -d --name caddy --restart always --network "$NET" \
    -p 80:80 -p 443:443 -p 443:443/udp \
    -v "$APP_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
    -v caddy_data:/data -v caddy_config:/config \
    caddy:2-alpine >/dev/null
else
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile
fi

docker image prune -af >/dev/null
echo "DEPLOYED $TAG"
