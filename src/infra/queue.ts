import { type DefaultJobOptions, Queue } from "bullmq";
import { getRedis } from "./redis";

const connection = getRedis();

const defaultJobOptions: DefaultJobOptions = {
	attempts: 30,
	backoff: {
		type: "fixed",
		delay: 5_000,
	},
	removeOnComplete: { count: 1_000 },
	removeOnFail: { count: 5_000 },
};

export const messageUpsertQueue = new Queue("message-upsert", {
	connection,
	defaultJobOptions,
});

export const messageSendQueue = new Queue("message-send", {
	connection,
	defaultJobOptions,
});

export const campaignSendQueue = new Queue("campaign-send", {
	connection,
	defaultJobOptions,
});
