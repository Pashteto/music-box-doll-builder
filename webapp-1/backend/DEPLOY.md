# Backend Deployment — oracle-1

The Go backend (`dollbuilder`) runs on **oracle-1** (`129.146.183.89`, ARM, Ubuntu 22.04)
via Docker Compose. As of 2026-06-12 it is **running internally** on `127.0.0.1:8080`
(Postgres + Redis + app, all healthy, auth flow verified). **Not yet public** —
nginx vhost + TLS + DNS are the remaining steps (see "Going public" below).

## Where things are

| Item         | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Host         | oracle-1 (`ssh oracle-1`), `129.146.183.89`                                          |
| Project dir  | `/home/ubuntu/dollbuilder` (MUST be under `/home` — see snap caveat)                 |
| Compose file | `docker-compose.prod.yml`                                                            |
| Secrets      | `/home/ubuntu/dollbuilder/.env` (`DB_PASSWORD`, `chmod 600`, **never committed**)    |
| App port     | `127.0.0.1:8080` (loopback only; Postgres/Redis have no host ports)                  |
| DB           | Postgres 16, db `dollbuilder`, user `dollbuilder`, named volume `dollbuilder_pgdata` |

## ⚠️ Docker on oracle-1 is the **snap** package — two hard caveats

1. **Bind mounts only work from `/home`.** Snap Docker is confined and cannot
   mount paths under `/srv` (fails with `read-only file system`). Keep the project
   under `/home/ubuntu/`.
2. **The daemon periodically loses the ability to stop/kill containers**
   (`cannot stop container: ... permission denied`). When this happens (e.g. on
   `up --build` recreate), recover with:
   ```bash
   sudo snap restart docker
   cd /home/ubuntu/dollbuilder
   sudo docker compose -f docker-compose.prod.yml down --remove-orphans
   sudo docker compose -f docker-compose.prod.yml up -d
   ```
   **Follow-up recommendation:** replace snap Docker with `docker-ce` from Docker's
   apt repo for reliable lifecycle ops. The current snap works but needs this
   restart dance on every image update.

All `docker`/`docker compose` commands require **`sudo`** on this box.

## Deploy / update procedure

Generated go-swagger + protobuf code is **gitignored**, so we deploy by rsyncing a
**working tree** (where `make generate-all` has already run locally), NOT a git clone.

```bash
# 1. From the local repo (generated code present locally):
rsync -az --exclude='.git' --exclude='data' --exclude='.env' \
  webapp-1/backend/ oracle-1:/home/ubuntu/dollbuilder/

# 2. On the server:
ssh oracle-1
cd /home/ubuntu/dollbuilder
sudo docker compose -f docker-compose.prod.yml run --rm migrate          # apply migrations
sudo docker compose -f docker-compose.prod.yml up -d --build             # build + start
# If recreate fails with "permission denied", do the snap-restart dance above.

# 3. Verify:
curl -s http://127.0.0.1:8080/api/v1/health        # {"status":"healthy",...}
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs -f app
```

First-time secret setup (already done; recorded for rebuilds):

```bash
cd /home/ubuntu/dollbuilder
printf "DB_USER=dollbuilder\nDB_NAME=dollbuilder\nDB_PASSWORD=%s\n" "$(openssl rand -hex 24)" > .env
chmod 600 .env
```

## Build notes

- Base image `golang:1.26` (go.mod requires `go 1.26.1`).
- `make build` is just `go build` (no codegen) — relies on generated code being in the
  build context, which the rsync provides.
- `.dockerignore` excludes `.git`, `data`, `.env`.

## Going public (REMAINING STEPS)

oracle-1 already runs **nginx** on 80/443 with **certbot** (serving amphitheater/vpn
subdomains). Add the API as another vhost.

1. **DNS (do at Namecheap):** add an `A` record
   `api.lindentar.pashteto.com → 129.146.183.89`. (Host `api.lindentar`, value the
   oracle-1 IP.) Wait until `dig +short api.lindentar.pashteto.com` returns it.

2. **nginx vhost** `/etc/nginx/sites-available/api.lindentar.pashteto.com`:

   ```nginx
   server {
       server_name api.lindentar.pashteto.com;
       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       listen 80;
   }
   ```

   ```bash
   sudo ln -s /etc/nginx/sites-available/api.lindentar.pashteto.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. **TLS:** `sudo certbot --nginx -d api.lindentar.pashteto.com` (HTTP-01; needs DNS
   resolving first). Certbot rewrites the vhost to listen on 443 + redirect 80→443.

4. **Verify:** `curl https://api.lindentar.pashteto.com/api/v1/health`.

The app already sets `AUTH_COOKIE_SECURE=true` and CORS allows
`https://lindentar.pashteto.com` with credentials, so the frontend (oracle-2) can call
the API cross-subdomain once DNS+TLS are live. (Frontend wiring itself is Plan 4.)
