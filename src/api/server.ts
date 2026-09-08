import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import Fastify from "fastify";
import type { MessageOutEvent } from "../wa/message";
import { enqueueSend, forwardToWebhook, startOutboxRelay } from "./gateway";

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
	const app = Fastify();

	await app.register(swagger, {
		openapi: {
			openapi: "3.1.0",
			info: {
				title: "ITwZY-MD API",
				description:
					"Bridge webhooks ke WhatsApp. Pesan masuk diteruskan ke webhook.url, kirim pesan lewat POST /messages.",
				version: "1.0.0",
			},
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
