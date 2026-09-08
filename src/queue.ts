import { Queue, Worker } from "bullmq";
import { queueConnection } from "./infra/redis";
import type { MessageHandler } from "./wa/handler";
import type {
	InboundMessage,
	MessageInJob,
	MessageOutEvent,
} from "./wa/message";

export function randomDelay() {
	return Math.floor(Math.random() * 1200) + 800;
}

const defaultJobOptions = {
	attempts: 3,
	backoff: {
		type: "exponential" as const,
		delay: 2000,
	},
	removeOnComplete: true,
	removeOnFail: false,
};

// Internal: WA socket -> handler.
export const inboundQueue = new Queue<InboundMessage>("wa-message", {
	connection: queueConnection,
	defaultJobOptions,
});

// Keluar: handler -> consumer eksternal (REST API / service lain).
// jobId = message.id dipakai sebagai idempotency key ("message_id").
export const messageOutQueue = new Queue<MessageOutEvent>("message.out", {
	connection: queueConnection,
	defaultJobOptions,
});

// Masuk: producer eksternal -> handler untuk dikirim ke WA.
export const messageInQueue = new Queue<MessageInJob>("message.in", {
	connection: queueConnection,
	defaultJobOptions,
});

export async function createWorkers(handler: MessageHandler) {
	const inboundWorker = new Worker<InboundMessage>(
		"wa-message",
		async (job) => {
			await handler.handle(job.data);
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

	const sendWorker = new Worker<MessageInJob>(
		"message.in",
		async (job) => {
			await handler.send(job.data);
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

	return [inboundWorker, sendWorker];
}
