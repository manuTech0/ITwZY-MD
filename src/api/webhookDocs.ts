import type { MessageType } from "../utils/parseMessage";
import type { MessageOutEvent } from "../wa/message";

/* ─── Kontrak webhook keluar (OpenAPI 3.1 `webhooks`) ─────────────────────────
 *
 * Webhook keluar bukan "route" — bridge-lah yang MENGIRIM request ke URL
 * milik sistem eksternal. Kontraknya tidak bisa dideskripsikan lewat
 * `paths`, jadi dipakai field `webhooks` (OpenAPI 3.1) supaya sisi
 * eksternal punya satu sumber kebenaran untuk payload, header, dan
 * semantik retry-nya.
 *
 * Isi file ini murni dokumentasi: tidak ada route, tidak ada I/O.
 * · `outboundWebhooks`  -> root `webhooks` di spec OpenAPI.
 * · `webhookComponents` -> root `components` (schemas + securityScheme).
 *
 * Catatan: fragment di bawah ditulis dengan tipe lokal (bukan `as const`)
 * karena `openapi-types` bukan dependency project — tidak bisa di-import
 * langsung. Tanpa anotasi, `type: "object"` akan melebar jadi `string` dan
 * tidak cocok dengan `NonArraySchemaObject`. Sebaliknya `as const` juga
 * tidak bisa dipakai karena membekukan `required`/`enum` jadi readonly,
 * sedangkan OpenAPI menuntut `string[]`/`any[]` yang mutable.
 * ────────────────────────────────────────────────────────────────────────── */

/* ------------------------------ tipe lokal -------------------------------- */

// Potongan JSON Schema OpenAPI 3.1 yang dipakai di file ini. `type` dibatasi
// ke non-array supaya tiap objek cocok dengan `NonArraySchemaObject`.
type SchemaType = "object" | "string" | "integer" | "number" | "boolean";

interface JsonSchema {
	type?: SchemaType;
	description?: string;
	required?: string[];
	enum?: string[];
	examples?: unknown[];
	properties?: Record<string, JsonSchema>;
}

interface BearerSecurityScheme {
	type: "http";
	scheme: "bearer";
	description: string;
}

/* ------------------------------- kind pesan -------------------------------- */

// `enum` di schema docs harus sinkron dengan union MessageType.
// `satisfies Record<MessageType, true>` mengunci kedua arah: kind yang
// lupa ditulis ATAU kind yang tidak dikenal di DTO sama-sama gagal compile.
const messageKindFlags = {
	text: true,
	image: true,
	video: true,
	audio: true,
	document: true,
	sticker: true,
	location: true,
	contact: true,
	poll: true,
	reaction: true,
	unknown: true,
} satisfies Record<MessageType, true>;

// Nilai flag tidak dipakai — yang penting kelengkapan kuncinya.
const messageKinds: MessageType[] = Object.keys(
	messageKindFlags,
) as MessageType[];

/* --------------------------------- contoh ---------------------------------- */

// Contoh resmi. Ditipe `MessageOutEvent` supaya compile gagal kalau DTO
// di src/wa/message.ts berubah tapi docs lupa di-update.
export const privateChatExample: MessageOutEvent = {
	message: {
		id: "3EB0C767D097E9ECFE8A",
		chatId: "6281234567890@s.whatsapp.net",
		senderId: "6281234567890@s.whatsapp.net",
		isGroup: false,
		fromMe: false,
		pushName: "Budi",
		timestamp: 1758000000000,
		kind: "text",
		text: "halo, pesanan saya sudah dikirim belum?",
	},
	source: "whatsapp",
	receivedAt: 1758000000123,
};

export const groupChatExample: MessageOutEvent = {
	message: {
		id: "3EB0C767D097E9ECFE8B",
		chatId: "6289900112233-1600000000@g.us",
		senderId: "6285556667778@s.whatsapp.net",
		isGroup: true,
		fromMe: false,
		pushName: "Sari",
		timestamp: 1758000005000,
		kind: "image",
		text: "ini bukti transfernya",
		quoted: { id: "3EB0C767D097E9ECFE89", text: "cek mutasi dulu ya" },
	},
	source: "whatsapp",
	receivedAt: 1758000005123,
};

/* -------------------------------- schemas ---------------------------------- */

const quotedRefSchema: JsonSchema = {
	type: "object",
	description: "Pesan yang di-quote/dibalas, kalau ada.",
	required: ["id"],
	properties: {
		id: {
			type: "string",
			description: "ID pesan yang di-quote (bukan ID pesan ini).",
		},
		text: {
			type: "string",
			description:
				"Cuplikan teks pesan yang di-quote. Tidak ada kalau pesan asli tanpa teks.",
		},
	},
};

const inboundMessageSchema: JsonSchema = {
	type: "object",
	description:
		"Pesan WhatsApp yang sudah dinormalisasi ke DTO JSON-aman (tanpa Buffer/proto Baileys).",
	required: [
		"id",
		"chatId",
		"senderId",
		"isGroup",
		"fromMe",
		"timestamp",
		"kind",
	],
	properties: {
		id: {
			type: "string",
			description:
				"ID pesan dari WhatsApp. Ini idempotency key: dedupe pengirim ulang dengan nilai ini.",
			examples: ["3EB0C767D097E9ECFE8A"],
		},
		chatId: {
			type: "string",
			description:
				"JID percakapan: `…@s.whatsapp.net` (chat pribadi) atau `…@g.us` (grup).",
			examples: ["6281234567890@s.whatsapp.net"],
		},
		senderId: {
			type: "string",
			description:
				"JID pengirim. Di grup = participant, di chat pribadi = sama dengan `chatId`.",
			examples: ["6281234567890@s.whatsapp.net"],
		},
		isGroup: {
			type: "boolean",
			description: "True bila `chatId` berakhiran `@g.us`.",
		},
		fromMe: {
			type: "boolean",
			description:
				"Selalu `false` pada event yang di-forward: pesan dari akun bot sendiri dilewati sebelum masuk antrean.",
		},
		pushName: {
			type: "string",
			description: "Nama tampilan (push name) pengirim di WhatsApp.",
		},
		timestamp: {
			type: "integer",
			description:
				"Timestamp pesan dari server WhatsApp, epoch milidetik. Beda dari `receivedAt`.",
			examples: [1758000000000],
		},
		kind: {
			type: "string",
			enum: [...messageKinds],
			description:
				"Jenis pesan. `unknown` bila tidak bisa dipetakan. Konten media (gambar/video/audio/dokumen/sticker) TIDAK ikut diteruskan, hanya `kind` + `text` bila ada caption.",
		},
		text: {
			type: "string",
			description:
				"Teks, caption, nama poll, atau emoji reaction — disatukan ke satu field. Tidak ada untuk pesan tanpa teks.",
		},
		quoted: quotedRefSchema,
	},
};

const messageOutEventSchema: JsonSchema = {
	type: "object",
	description:
		"Body yang dikirim ke webhook URL. Satu event = satu pesan WhatsApp masuk.",
	required: ["message", "source", "receivedAt"],
	properties: {
		message: inboundMessageSchema,
		source: {
			type: "string",
			enum: ["whatsapp"],
			description: "Asal event. Selalu `whatsapp` saat ini.",
		},
		receivedAt: {
			type: "integer",
			description:
				"Epoch milidetik saat event dipublish ke antrean `message.out` (bukan waktu pesan dibuat).",
			examples: [1758000000123],
		},
	},
};

/* ------------------------------ components --------------------------------- */

export const webhookComponents = {
	schemas: {
		MessageOutEvent: messageOutEventSchema,
		InboundMessage: inboundMessageSchema,
		QuotedRef: quotedRefSchema,
	},
	securitySchemes: {
		bearerAuth: {
			type: "http",
			scheme: "bearer",
			description:
				"Token statis dari env `WEBHOOK_TOKEN`. Bridge mengirim `Authorization: Bearer <WEBHOOK_TOKEN>` pada setiap request. Header ini **tidak** ada kalau `WEBHOOK_TOKEN` belum di-set.",
		} satisfies BearerSecurityScheme,
	},
};

/* ------------------------------- webhooks --------------------------------- */

export const outboundWebhooks = {
	messageOut: {
		post: {
			tags: ["webhook"],
			summary: "Event pesan WhatsApp masuk",
			description: [
				"Request yang **dikirim bridge ke sistem Anda** setiap ada pesan WhatsApp masuk pada akun bot. Endpoint-nya adalah `webhook.url` dari `configs/app.yml` (dibaca ulang tiap event), jadi alamat persisnya tidak bisa ditulis di spec — yang dikunci di sini adalah bentuk request-nya.",
				"",
				"**Kapan dikirim**",
				"- Pesan masuk dari nomor/grup mana pun, dipetakan ke DTO `InboundMessage` lalu di-forward.",
				"- Pesan keluar dari akun bot sendiri (`fromMe`) tidak pernah diteruskan.",
				"- Bila `webhook.url` kosong atau tidak ada, tidak ada request sama sekali (bridge hanya log debug).",
				"- Event tidak pernah dikirim ulang otomatis di luar batas retry: job yang sudah `failed` hanya tersimpan di Redis untuk diperiksa, bukan di-olah kembali.",
				"",
				"**Header**",
				"- `content-type: application/json`.",
				"- `authorization: Bearer <WEBHOOK_TOKEN>` — hanya bila env `WEBHOOK_TOKEN` di-set. Verifikasi token ini di sisi penerima; jangan andalkan IP saja.",
				"- Tidak ada tanda tangan HMAC pada request ini. Kalau butuh anti-palsu, andalkan `WEBHOOK_TOKEN` + HTTPS, atau minta Ditambahkan `X-Signature` (header HMAC-SHA256 atas raw body).",
				"",
				"**Retry & idempotensi (WAJIB dibaca)**",
				"- Timeout 10 detik per request.",
				"- Balasan **non-2xx atau timeout dianggap gagal** dan di-retry: maksimal 3 percobaan, backoff exponential (≈2 detik lalu ≈4 detik). Setelah itu job berstatus `failed` dan tetap tersimpan di Redis untuk diperiksa — tidak hilang diam-diam.",
				"- Pengiriman bersifat *at-least-once*, jadi **receiver wajib idempoten**. `message.id` adalah idempotency key yang dipakai antrean, sehingga pesan yang sama tidak masuk antrean dua kali — namun retry HTTP tetap bisa mengirim event yang sama berulang. Simpan `message.id` sebelum memproses.",
				"- Urutan tidak dijamin pada retry: event yang gagal lalu dicoba ulang bisa tiba setelah event yang lebih baru.",
				"",
				"**Sisi penerima harus**",
				"- Balas 2xx secepatnya (mis. `204`) agar event tidak di-retry.",
				"- Menolak dengan 4xx kalau token tidak cocok — tapi ingat ini tetap memicu retry, jadi log alasan penolakan lalu balas cepat.",
				"- Idempoten terhadap `message.id`.",
			].join("\n"),
			security: [{ bearerAuth: [] }],
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: { $ref: "#/components/schemas/MessageOutEvent" },
						examples: {
							chatPribadi: {
								summary: "Chat pribadi, pesan teks",
								value: privateChatExample,
							},
							grup: {
								summary: "Grup, pesan media + quote",
								value: groupChatExample,
							},
						},
					},
				},
			},
			responses: {
				204: {
					description:
						"Event diterima. Ini sinyal ack yang direkomendasikan — job selesai, tidak ada retry.",
				},
				401: {
					description:
						"Token tidak cocok / tidak diterima. Tetap memicu retry, jadi log alasan penolakan lalu balas cepat.",
				},
				500: {
					description:
						"Gagal memproses. Memicu retry (maks 3 percobaan); setelah itu job `failed` di antrean `message.out`.",
				},
			},
		},
	},
};
