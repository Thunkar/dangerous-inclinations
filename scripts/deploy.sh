#!/usr/bin/env bash
# Build both images, push them to Docker Hub and (re)start the stack on the NAS.
#
#   DOCKERHUB_USER=<you> scripts/deploy.sh              build, push, deploy HEAD
#   DOCKERHUB_USER=<you> scripts/deploy.sh --no-build   redeploy an existing TAG (rollback)
#
# Settings (environment):
#   DOCKERHUB_USER  Docker Hub namespace the images are pushed to (required)
#   NAS             ssh target            (default lookatflowersofthemountain@192.168.1.181)
#   REMOTE_DIR      stack dir, under ~    (default dangerous-inclinations)
#   PORT            port the site is on   (default 8088)
#   TAG             image tag             (default the short commit, +"-dirty" with local changes)
#
# Needs `docker login` on this machine and key-based ssh to the NAS. The stack
# is plain `docker compose` in ~/$REMOTE_DIR, like the NAS's other stacks;
# Portainer lists it as an external ("limited") stack.
set -euo pipefail

: "${DOCKERHUB_USER:?set DOCKERHUB_USER to your Docker Hub namespace}"
NAS="${NAS:-lookatflowersofthemountain@192.168.1.181}"
REMOTE_DIR="${REMOTE_DIR:-dangerous-inclinations}"
PORT="${PORT:-8088}"
# Synology keeps docker out of a non-interactive ssh PATH.
REMOTE_DOCKER="${REMOTE_DOCKER:-/usr/local/bin/docker}"

cd "$(dirname "$0")/.."

if [[ -z "${TAG:-}" ]]; then
  TAG="$(git rev-parse --short HEAD)"
  [[ -n "$(git status --porcelain)" ]] && TAG="$TAG-dirty"
fi

build=1
[[ "${1:-}" == "--no-build" ]] && build=0

if (( build )); then
  for target in server web; do
    image="$DOCKERHUB_USER/dangerous-inclinations-$target"
    echo "==> building $image:$TAG"
    docker build --platform linux/amd64 --target "$target" -t "$image:$TAG" -t "$image:latest" .
    docker push "$image:$TAG"
    docker push "$image:latest"
  done
fi

echo "==> uploading the stack to $NAS:~/$REMOTE_DIR"
# Plain ssh rather than scp: Synology often has SFTP (which scp now uses) off.
ssh "$NAS" "mkdir -p ~/$REMOTE_DIR"
ssh "$NAS" "cat > ~/$REMOTE_DIR/docker-compose.yml" < deploy/docker-compose.yml
ssh "$NAS" "cat > ~/$REMOTE_DIR/.env" <<ENV
IMAGE_PREFIX=$DOCKERHUB_USER
TAG=$TAG
PORT=$PORT
ENV

echo "==> starting $TAG"
ssh "$NAS" "cd ~/$REMOTE_DIR && $REMOTE_DOCKER compose pull && $REMOTE_DOCKER compose up -d --remove-orphans && $REMOTE_DOCKER image prune -f >/dev/null"

host="${NAS#*@}"
echo "==> waiting for http://$host:$PORT/api/health"
for _ in $(seq 1 30); do
  if curl -fsS "http://$host:$PORT/api/health" >/dev/null 2>&1; then
    echo "up: http://$host:$PORT/"
    exit 0
  fi
  sleep 2
done
echo "the stack did not answer; look at: ssh $NAS '$REMOTE_DOCKER compose -f ~/$REMOTE_DIR/docker-compose.yml logs --tail=50'" >&2
exit 1
