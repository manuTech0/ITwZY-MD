import { delay } from "@whiskeysockets/baileys";
import { logger } from "../infra/logger";
import { messageOutQueue, randomDelay } from "../queue";
import type { MakeWASocket } from "../types/baileys";
import {
	type InboundMessage,
	type MessageInJob,
	normalizeRecipient,
	sendText,
	toMessageOutEvent,
} from "./message";

export class MessageHandler {
	private sock: MakeWASocket;

	constructor(sock: MakeWASocket) {
		this.sock = sock;
	}

	// WA -> queue "message.out": mapping ke DTO baru lalu publish dengan
	// jobId = message.id sebagai idempotency key ("message_id").
	async handle(m: InboundMessage) {
		if (m.fromMe) return;

		logger.debug({ inbound: m }, "incoming message");

		await messageOutQueue.add("wa.inbound", toMessageOutEvent(m), {
			jobId: m.id,
		});
	}

	// Queue "message.in" -> WA: kirim pesan dari producer eksternal.
	// Ada jeda acak kecil (800-2000ms) agar ritme kirim natural.
	async send(job: MessageInJob) {
		const req = job?.message;
		if (!req || typeof req.to !== "string" || typeof req.text !== "string") {
			throw new Error("invalid message.in payload");
		}

		// Pertahanan lapis kedua: producer yang enqueue langsung ke Redis
		// (bypass API) tetap ternormalisasi sebelum ke Baileys.
		const to = normalizeRecipient(req.to);

		await delay(randomDelay());
		await sendText(this.sock, { to, text: req.text });
	}
}
