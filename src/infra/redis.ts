// src/lib/server/redis/index.ts

import Redis from "ioredis";
import { ENV } from "../configs/env";

let redis: Redis | null = null;

export function getRedis(): Redis {
	if (redis) return redis;

	redis = new Redis(ENV.REDIS_URL, {
		maxRetriesPerRequest: null,

		retryStrategy(times) {
			const delay = Math.min(times * 50, 2000);
			return delay;
		},

		reconnectOnError(err) {
			const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
			if (targetErrors.some((e) => err.message.includes(e))) {
				return true;
			}
			return false;
		},

		enableReadyCheck: true,
		lazyConnect: false,
		keepAlive: 10_000,
	});

	// logging penting production
	redis.on("connect", () => {
		console.log("[redis] connected");
	});

	redis.on("error", (err) => {
		console.error("[redis] error", err);
	});

	redis.on("reconnecting", () => {
		console.warn("[redis] reconnecting...");
	});

	return redis;
}
