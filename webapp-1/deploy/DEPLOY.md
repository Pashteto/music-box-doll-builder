# Deploying the frontend — `lindentar.pashteto.com` on oracle-2

The app is a **static export** (`out/`), so it needs only a static web server — no
Node process. Target: **oracle-2** (`passthru.pashteto.com`, `129.146.130.46`).

> **STATUS: LIVE** as of 2026-06-11. The one-time setup below is already done:
> DNS A record added, Caddy v2 installed and serving `/srv/lindentar/out`, valid
> Let's Encrypt cert. **Routine redeploys now only need step 2** (`./deploy/deploy.sh`).

> Manual deploy (flagged per IaC policy). A `GitHub Actions` auto-deploy is the
> intended follow-up; see "CI" below.

## 1. DNS (do this in Namecheap)

Add an **A record** on `pashteto.com`:

| Type | Host        | Value            | TTL  |
| ---- | ----------- | ---------------- | ---- |
| A    | `lindentar` | `129.146.130.46` | Auto |

Verify: `dig +short lindentar.pashteto.com` → `129.146.130.46`.

## 2. Build + upload

From `webapp-1/`:

```bash
./deploy/deploy.sh            # builds and rsyncs out/ → oracle-2:/srv/lindentar/out
```

## 3. Web server (one-time, on oracle-2)

First check what owns ports 80/443 (oracle-2 runs aaPanel/BT-Panel):

```bash
sudo ss -tlnp | grep -E ':80 |:443 '
```

**If 80/443 are free → Caddy (simplest, auto-HTTPS):**

```bash
sudo apt install -y caddy            # if not present
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # or import it
sudo systemctl reload caddy
```

**If nginx/aaPanel already owns 80/443 → add an nginx vhost instead:**

```bash
sudo cp deploy/lindentar.nginx.conf /etc/nginx/conf.d/lindentar.conf
sudo nginx -t && sudo nginx -s reload
sudo certbot --nginx -d lindentar.pashteto.com   # TLS
```

(Or add the site through the aaPanel UI pointing its root at `/srv/lindentar/out`.)

## 4. Verify

```bash
curl -I https://lindentar.pashteto.com/                       # 200
curl -s -o /dev/null -w '%{http_code}\n' \
  https://lindentar.pashteto.com/catalog/manifest.json        # 200
```

Then open it on a phone and run the full flow.

## CI (follow-up)

Add a workflow that builds and rsyncs on push to `main`, using a deploy SSH key
stored as a repo secret. Keeps deploys repeatable and off local machines.
