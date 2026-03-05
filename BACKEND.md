# RSVP Backend

## 1) Quick start

```bash
npm install
cp .env.example .env
npm start
```

Server starts on `PORT` (default `3000`).

## 2) Environment variables

- `PORT` - backend port.
- `ALLOWED_ORIGINS` - comma-separated allowed origins for CORS.
- `TG_BOT_TOKEN` - Telegram bot token.
- `TG_CHAT_ID` - Telegram chat id.
- `HASH_SALT` - salt for IP hashing.
- `ADMIN_TOKEN` - Bearer token for `/admin/export.*`.
- `ADMIN_IP_ALLOWLIST` - optional comma-separated IP allowlist for admin export.
- `TURNSTILE_SECRET_KEY` - optional, enables Cloudflare Turnstile validation.

## 3) API

### `POST /api/rsvp`

Request JSON:

```json
{
  "name": "Тимур",
  "attendance": "yes",
  "hot": "meat",
  "turnstileToken": ""
}
```

Responses:

- `200 { "ok": true, "id": "<uuid>" }`
- `400 { "ok": false, "error": "validation_error" }`
- `429 { "ok": false, "error": "rate_limited" }`
- `500 { "ok": false, "error": "server_error" }`

### Admin export

- `GET /admin/export.csv`
- `GET /admin/export.jsonl`

Header:

`Authorization: Bearer <ADMIN_TOKEN>`

## 4) Storage

- `data/rsvp-YYYY-MM-DD.jsonl` (append-only)
- `data/rsvp-YYYY-MM-DD.csv`
- `backup/rsvp-YYYY-MM-DD.jsonl`

Each record has:

- `id`
- `createdAt`
- `ipHash`
- `ua`
- `name`
- `attendance`
- `hot`

## 5) Nginx notes

- Do not expose `data/` and `backup/` as static directories.
- Redirect HTTP to HTTPS.
- Add security headers:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options nosniff`
  - `X-Frame-Options DENY`
  - `Referrer-Policy strict-origin-when-cross-origin`

Minimal example:

```nginx
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;

  add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /admin/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location ~ ^/(data|backup)/ {
    deny all;
  }
}
```
