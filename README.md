# ITwZY-MD 

WhatsApp bot with @whiskeysockets/baileys v7

## How to setup project:
### Setup configs

rename .env.example to .env and rename configs/app.yml.bak to configs/app.yml

### Install dependencies 

```bash
pnpm install
```
### Build app

```bash
pnpm run build
```

### Run (2 process terpisah,altime berkomunikasi via Redis)

```bash
# dev
pnpm run dev:wa    # process WA (Baileys + worker queue)
pnpm run dev:api   # process API (Fastify + OpenAPI, webhooks-based)

# production
pnpm run start:wa
pnpm run start:api
```

## Login & reconnect (process `wa`)

- QR selalu dicetak ke terminal saat tersedia, dan pairing code
  diminta paralel tanpa delay (keduanya bisa dipakai) selama
  `PAIRING_CODE=true` dan device belum terdaftar.
- Semua kode disconnect Baileys dipetakan (`mapDisconnect`):
  - `exit` (tanpa retry): `loggedOut` 401, `forbidden` 403,
    `connectionReplaced` 440.
  - `fresh` (hapus `state/` lalu reconnect): `badSession` 500,
    `multideviceMismatch` 411.
  - `reconnect` (backoff exponential 1s→60s + jitter, counter
    reset tiap `open`): 408, 428, 503, 515, dan kode tak dikenal.

## API (process `api`)
- `GET /health` → `{ status: "ok" }`
- `POST /messages` body `{ to, text }` → `202 { jobId }`
  (enqueue ke `message.in`, dikirim ke WA oleh process WA).
  `to` boleh nomor (`0812…`/`62812…`, dinormalisasi ke
  `@s.whatsapp.net`) atau JID penuh; tujuan invalid → `400`.
- `GET /openapi.json` → spec OpenAPI 3.1 (UI interaktif di `/docs`)
- `POST /messages` juga ada jeda acak kecil (800–2000ms) sebelum
  dikirim ke Baileys agar ritme kirim natural.

## Message DTO (REST-ready)

Pesan Baileys mentah (`WAMessage`) hanya hidup di boundary
`messages.upsert` → `toInboundMessage()` (`src/wa/message.ts`).
Selebihnya (queue BullMQ, handler, calon REST API) memakai DTO
JSON-aman berisi string/number/boolean saja:

```ts
// Masuk (queue wa-message/message.out & handler)
interface InboundMessage {
  id: string;
  chatId: string;
  senderId: string; // participant di grup, selain itu = chatId
  isGroup: boolean;
  fromMe: boolean;
  pushName?: string;
  timestamp: number;
  kind: "text" | "image" | "video" | "audio" | "document"
      | "sticker" | "location" | "contact" | "poll"
      | "reaction" | "unknown";
  text?: string;    // teks/caption/poll/reaction disatukan
  quoted?: { id: string; text?: string };
}

// Keluar (tinggal divalidasi zod di REST API)
interface SendTextRequest {
  to: string;
  text: string;
}
```

## Queue bridge (BullMQ + Redis)

```
WA socket --(InboundMessage)--> [wa-message] --handler--> [message.out] --> consumer eksternal
producer eksternal --> [message.in] --handler.send()--> WA socket (sendText)
```

- `message.out`: handler publish `MessageOutEvent`
  (`{ message, source: "whatsapp", receivedAt }`) dengan
  **jobId = `message.id`** sebagai idempotency key (`message_id`) —
  redelivery pesan yang sama tidak masuk antrean ganda.
- `message.in`: producer eksternal enqueue `MessageInJob`
  (`{ message: { to, text } }`), worker memanggil `handler.send()`
  yang memvalidasi payload lalu kirim via `sendText`.

## Webhook keluar (process `api`)

Setiap event `message.out` di-forward ke `webhook.url` dari
`configs/app.yml`, dengan proteksi header dari `WEBHOOK_TOKEN` (.env):

```yaml
# configs/app.yml
webhook:
  url: http://localhost:4000/wa/events
```

```bash
# .env
WEBHOOK_TOKEN=ubah-token-ini
```

- `POST {webhook.url}` body = `MessageOutEvent` (JSON),
  header `Authorization: Bearer <WEBHOOK_TOKEN>`
  (header dikirim hanya jika token di-set).
- Tanpa `webhook.url` → forward dilewati.
- Webhook non-2xx / timeout 10 dtk dianggap gagal → BullMQ retry
  (attempts 3, backoff exponential), lalu status `failed` —
  tidak hilang diam-diam.

