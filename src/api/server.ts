import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import Fastify from "fastify";
import { logger } from "../infra/logger";
import type { MessageOutEvent } from "../wa/message";
import { enqueueSend, forwardToWebhook, startOutboxRelay } from "./gateway";
import { outboundWebhooks, webhookComponents } from "./webhookDocs";

const sendBodySchema = {
	type: "object",
	required: ["to", "text"],
	additionalProperties: false,
	properties: {
		to: {
			type: "string",
			description:
				"Nomor (0812…/62812…, dinormalisasi ke @s.whatsapp.net) atau JID penuh",
		},
		text: { type: "string", description: "Isi pesan teks" },
	},
} as const;

export async function buildApiServer() {
	const app = Fastify({ loggerInstance: logger });

	await app.register(swagger, {
		openapi: {
			openapi: "3.1.0",
			info: {
				title: "ITwZY-MD API",
				description: [
					"Bridge WhatsApp dua arah. Dua arahnya:",
					"",
					"1. **Keluar** — setiap pesan WhatsApp masuk di-forward sebagai `POST` ke `webhook.url` milik Anda. Kontraknya ada di section **Webhooks** (`messageOut`): payload, header, dan semantik retry.",
					"2. **Masuk** — Anda mengirim pesan lewat `POST /messages` di bawah, dan proses `wa` yang meneruskannya ke WhatsApp.",
					"",
					"## Setup sisi penerima (webhook keluar)",
					"",
					"Tujuan webhook dibaca dari `configs/app.yml`:",
					"",
					"```yaml",
					"webhook:",
					"  url: https://tokopedia.example.com/wa/events",
					"```",
					"",
					"Token statis opsional dari `.env` (`WEBHOOK_TOKEN`):",
					"",
					"```bash",
					"WEBHOOK_TOKEN=token-rahasia-anda",
					"```",
					"",
					"Kalau `WEBHOOK_TOKEN` di-set, tiap request membawa `Authorization: Bearer <token>`. Perubahan file butuh restart process `api`.",
					"",
					"> Delivery bersifat *at-least-once* dan **tidak** ditandatangani HMAC. Receiver wajib idempoten terhadap `message.id` — detailnya di section Webhooks.",
				].join("\n"),
				version: "1.0.0",
			},
			tags: [
				{
					name: "messages",
					description: "Kirim pesan WhatsApp dari sistem Anda.",
				},
				{
					name: "webhook",
					description:
						"Request yang dikirim bridge ke webhook URL Anda (bukan endpoint yang diekspos proses ini).",
				},
				{ name: "system", description: "Health check & spec." },
			],
			components: webhookComponents,
			webhooks: outboundWebhooks,
		},
		hideUntagged: true,
	});
	await app.register(scalar, { routePrefix: "/docs" });

	app.get(
		"/health",
		{
			schema: {
				tags: ["system"],
				description: "Cek status process API.",
				response: {
					200: {
						type: "object",
						required: ["status"],
						properties: { status: { type: "string" } },
					},
				},
			},
		},
		async () => ({ status: "ok" }),
	);

	// Spec OpenAPI untuk pemakaian programatik (UI ada di /docs).
	app.get("/openapi.json", { schema: { hide: true } }, async () => {
		return app.swagger();
	});

	app.post<{ Body: { to: string; text: string } }>(
		"/messages",
		{
			schema: {
				tags: ["messages"],
				description:
					"Enqueue pesan teks ke WA via queue message.in. Tujuan boleh nomor (0812…/62812…) atau JID penuh. Idempotent per jobId yang dikembalikan.",
				body: sendBodySchema,
				response: {
					202: {
						type: "object",
						required: ["jobId"],
						properties: { jobId: { type: "string" } },
					},
					400: {
						type: "object",
						required: ["message"],
						properties: { message: { type: "string" } },
					},
				},
			},
		},
		async (req, reply) => {
			try {
				const jobId = await enqueueSend({
					to: req.body.to,
					text: req.body.text,
				});
				return reply.code(202).send({ jobId });
			} catch (e) {
				return reply
					.code(400)
					.send({ message: e instanceof Error ? e.message : "invalid body" });
			}
		},
	);

	const relay = startOutboxRelay(async (event: MessageOutEvent) => {
		await forwardToWebhook(event);
	});

	app.addHook("onClose", async () => {
		await relay.close();
	});

	return app;
}
