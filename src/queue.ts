import type { WAMessage } from "@whiskeysockets/baileys";
import { Queue, Worker } from "bullmq";
import { queueConnection } from "./infra/redis";
import type { WhatsAppService } from "./service";

export function randomDelay() {
	return Math.floor(Math.random() * 1200) + 800;
}

export const waQueue = new Queue("wa-message", {
	connection: queueConnection,
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 2000,
		},
		removeOnComplete: true,
		removeOnFail: false,
	},
});

export async function createWorker(waService: WhatsAppService) {
	return new Worker(
		"wa-message",
		async (job) => {
			const m = job.data as WAMessage;
			waService.send(m);
		},
		{
			concurrency: 1,
			connection: queueConnection,
			limiter: {
				max: 20,
				duration: 60_000,
			},
		},
	);
}
