import { Worker } from "bullmq";
import { getRedis } from "./src/infra/redis";

const worker = new Worker(
	"message-upsert",
	async (job) => {
		console.log(job.id, job.data);

		// proses job
	},
	{
		connection: getRedis(),
		concurrency: 1,
	},
);

console.log(`Worker "${worker.name}" berjalan`);
