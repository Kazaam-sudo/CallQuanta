# Hetzner demo deployment

This profile is for one controlled CallQuanta demo workspace on a domain-backed
Hetzner VPS. It exposes only Caddy on ports 80 and 443. PostgreSQL, Redis, the
API, web app, and workers stay on the private Docker network.

It intentionally does **not** start Ollama or `recording-worker`:

- STT uses the existing local CTranslate2 `faster-whisper-small` model through
  a read-only bind mount.
- QA uses an explicitly configured external OpenAI-compatible provider.
- Operators upload approved audio manually. Remote PBX recording downloads are
  outside this demo profile.

Do not use this single-workspace profile for self-service customers or upload
call recordings without the required permission, retention, and storage
controls.

## Preconditions

1. Resize the VPS to at least **8 GB RAM** before starting this profile. The
   local `faster-whisper-small` CPU model can use about 1.5 GB while decoding;
   swap is an emergency cushion, not a replacement for RAM.
2. Take a Hetzner snapshot. Ensure 80 and 443 are free, Docker Engine with the
   Compose plugin is installed, and the firewall allows only SSH, HTTP, and
   HTTPS.
3. Point the chosen demo subdomain's DNS A/AAAA record to the VPS. Caddy uses
   it to obtain and renew HTTPS automatically.
4. Identify the exact local model **directory** containing `model.bin`,
   `config.json`, `tokenizer.json`, and `vocabulary.txt`. Do not use the parent
   Hugging Face cache directory.

## First deployment

All versioned changes go through GitHub. On the VPS, deploy from merged `main`;
do not edit application code there.

```sh
git clone https://github.com/Kazaam-sudo/CallQuanta.git /opt/callquanta
cd /opt/callquanta
git switch main
git pull --ff-only origin main

cp deploy/hetzner-demo/.env.example deploy/hetzner-demo/.env
chmod 600 deploy/hetzner-demo/.env
```

Edit only `deploy/hetzner-demo/.env` on the server. Set unique credentials,
the public domain, the external QA provider settings, and the exact
`HOST_FASTER_WHISPER_MODEL_DIR`. Do not commit this file.

Validate configuration before starting. This does not expose secrets:

```sh
docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml config >/dev/null

docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml up -d --build

docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml ps
```

Wait for `postgres`, `redis`, and `api` to become healthy, then check the
public endpoint:

```sh
curl --fail --silent --show-error https://demo.example.com/health
```

Sign in through the browser, upload one short approved test recording, wait for
the transcript and QA review, then confirm no raw recording or credential value
appears in container logs before sharing the link.

## Updating from GitHub

Before every update, create a database and uploads backup. From the repository
root:

```sh
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml exec -T postgres \
  pg_dump -U callquanta callquanta > "backups/postgres-${stamp}.sql"
docker run --rm --volumes-from "$(docker compose --env-file deploy/hetzner-demo/.env -f deploy/hetzner-demo/docker-compose.yml ps -q api)" \
  -v "$PWD/backups:/backups" alpine \
  tar czf "/backups/uploads-${stamp}.tgz" /app/uploads

git fetch origin main
git switch main
git pull --ff-only origin main
docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml up -d --build
```

Keep the database backup and matching uploads archive together. Verify the
health endpoint and one authenticated browser workflow after every update. If
an update fails, return to the previous known Git commit and restore the
matching database and uploads backup; do not delete Docker volumes as a
troubleshooting shortcut.

## Operations

```sh
docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml logs --tail=200 api stt-worker qa-worker gateway

docker compose --env-file deploy/hetzner-demo/.env \
  -f deploy/hetzner-demo/docker-compose.yml ps
```

Monitor available RAM, CPU, disk, and queue growth during the first real demo.
With two vCPUs, keep transcription to one short recording at a time. Do not
add Ollama to this VPS profile; move local LLM inference to a separate, larger
machine if it becomes necessary.
