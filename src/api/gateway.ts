import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { appConfig } from "../configs/app";
import { ENV } from "../configs/env";
import { logger } from "../infra/logger";
import { queueConnection } from "../infra/redis";
import { messageInQueue } from "../queue";
import type { MessageOutEvent, SendTextRequest } from "../wa/message";
import { normalizeRecipient } from "../wa/message";

// Producer eksternal -> queue "message.in" (diteruskan ke WA oleh process WA).
// "to" dinormalisasi ke JID di sini agar yang masuk queue selalu valid.
export async function enqueueSend(req: SendTextRequest): Promise<string> {
	const jobId = randomUUID();
	await messageInQueue.add(
		"api.send",
		{ message: { to: normalizeRecipient(req.to), text: req.text } },
		{ jobId },
	);
	return jobId;
}

// Teruskan event ke WEBHOOK_URL (app config) dengan proteksi
// Authorization: Bearer <WEBHOOK_TOKEN>. Non-2xx dianggap gagal
// agar BullMQ me-retry sesuai attempts/backoff queue.
export async function forwardToWebhook(event: MessageOutEvent) {
	const url = appConfig.webhook?.url;
	if (!url) {
		logger.debug("webhook.url belum dikonfigurasi, forward dilewati");
		return;
	}

	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (ENV.WEBHOOK_TOKEN) {
		headers.authorization = `Bearer ${ENV.WEBHOOK_TOKEN}`;
	}

	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(event),
		signal: AbortSignal.timeout(10_000),
	});

	if (!res.ok) {
		throw new Error(`webhook ${url} -> HTTP ${res.status}`);
	}
}

// Consumer queue "message.out": teruskan setiap event ke callback
// (process API mem-forward-nya ke webhook).
export function startOutboxRelay(
	onEvent: (event: MessageOutEvent) => Promise<void> | void,
) {
	return new Worker<MessageOutEvent>(
		"message.out",
		async (job) => {
			await onEvent(job.data);
		},
		{
			connection: queueConnection,
		},
	);
}
