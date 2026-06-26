# Backend Deployment — oracle-1

The Go backend (`dollbuilder`) runs on **oracle-1** (`129.146.183.89`, ARM, Ubuntu 22.04)
via Docker Compose. As of 2026-06-12 it is **live and public** at
**`https://api.lindentar.pashteto.com`** (Let's Encrypt TLS, HTTP→HTTPS redirect),
proxied by nginx to the app on `127.0.0.1:8080` (Postgres + Redis + app, all healthy,
auth flow verified). The "Going public" steps below are **done** and kept for reference.

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

## Entitlements + Stripe (Plan 3 / E12) — deploy delta (NOT yet deployed as of 2026-06-14)

The entitlements module + real Stripe Checkout (test-mode) are **merged to `main` and
verified locally**, but **not yet on oracle-1**. To deploy:

1. **Stripe TEST dashboard (manual, before deploy):**
   - Create a product + a **one-time** Price → `price_...`
   - Register a webhook endpoint `https://api.lindentar.pashteto.com/api/v1/webhooks/stripe`
     for event `checkout.session.completed` → signing secret `whsec_...`
   - Copy the test secret key `sk_test_...`
2. **Add keys to the server `.env`** (NEVER commit; keys never go through chat/logs):
   ```bash
   ssh oracle-1
   cd /home/ubuntu/dollbuilder
   printf 'STRIPE_SECRET_KEY=sk_test_...\nSTRIPE_WEBHOOK_SECRET=whsec_...\nSTRIPE_PRICE_ID=price_...\n' >> .env
   chmod 600 .env
   ```
   `docker-compose.prod.yml` passes these through and forces `ALLOW_MOCK_CHECKOUT=false`
   in prod. Empty keys keep the app healthy (checkout → 503, webhook not wired).
3. **Deploy** with the standard rsync + migrate + build procedure above. Migration
   `000005_entitlements` creates the `entitlements` table.
4. **Verify:** `GET /api/v1/entitlements` was **404**, must now return **401** without a
   cookie (and `{"entitled":false}` with a valid session). Webhook with a bad/missing
   `Stripe-Signature` must return **400**. Then drive a real test-mode purchase
   (card `4242 4242 4242 4242`) and confirm the entitlement flips to active.

> Audit note (ISO 27001): this introduces a payment/entitlement control — record it in
> change management. Secrets live only in the server `.env` (chmod 600), never in git.

## Build notes

- Base image `golang:1.26` (go.mod requires `go 1.26.1`).
- `make build` is just `go build` (no codegen) — relies on generated code being in the
  build context, which the rsync provides.
- `.dockerignore` excludes `.git`, `data`, `.env`.

## Going public (DONE 2026-06-12 — kept for reference / rebuilds)

oracle-1 already runs **nginx** on 80/443 with **certbot** (serving amphitheater/vpn
subdomains). The API was added as another vhost via the steps below. DNS, vhost, and
TLS are all in place; verified `curl https://api.lindentar.pashteto.com/api/v1/health`
returns healthy from the public internet.

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

## Observability — Prometheus (oracle-1)

Metrics are exposed by the app on an internal-only port (`9100`, never published to
the host) and scraped by a Prometheus container in the same compose project. The
Prometheus UI is reachable at `https://prometheus.lindentar.pashteto.com` behind
nginx basic auth + TLS. The TSDB is size-capped (`--storage.tsdb.retention.size=512MB`,
`--storage.tsdb.retention.time=15d`) so the `promdata` volume cannot grow without
bound, and all containers use `json-file` log rotation (≤30 MB each).

**Apply (human-run on the server):**

1. Pull + redeploy (rebuilds the app with the metrics listener, starts Prometheus):
   ```
   git pull
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. Confirm scraping locally: `curl -s localhost:9090/api/v1/targets | grep dollbuilder`
   should show the `app:9100` target as `"health":"up"`.
3. DNS: add an A record `prometheus.lindentar.pashteto.com` → oracle-1.
4. Basic-auth credentials (never committed):
   ```
   sudo htpasswd -c /etc/nginx/.htpasswd-prometheus <user>
   ```
5. Install the vhost from `../deploy/prometheus.nginx.conf`, then:
   ```
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d prometheus.lindentar.pashteto.com
   ```
6. Verify: `curl -u <user>:<REDACTED> https://prometheus.lindentar.pashteto.com/-/healthy`.

**Notes:** `/metrics` (port 9100) must never appear in a compose `ports:` list. The
Prometheus UI binds `127.0.0.1:9090` so it is only reachable through nginx. This adds
a public endpoint — record it in change-management/audit notes.
