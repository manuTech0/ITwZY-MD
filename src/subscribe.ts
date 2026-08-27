import { readFileSync, writeFileSync } from "node:fs";
import { Worker } from "bullmq";
import { getRedis } from "./infra/redis";
import type { WhatsAppService } from "./service";

const HP_FILE = "hp.txt";

function removeNumberFromFile(filePath: string, number: string): void {
	const content = readFileSync(filePath, "utf8");
	const lines = content
		.split("\n")
		.filter((line) => line.trim() !== number.trim());
	writeFileSync(filePath, lines.join("\n"), "utf8");
}

export async function startMessageWorker(
	waService: WhatsAppService,
): Promise<Worker> {
	const worker = new Worker<{
		no_hp: string;
		message: string;
		index: number;
		total: number;
		rawNumber: string;
	}>(
		"message-send",
		async (job) => {
			const { no_hp, message, index, total, rawNumber } = job.data;

			const delayMs = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
			const delaySec = Math.ceil(delayMs / 1000);

			console.log(
				`[worker] Mengirim ${index}/${total}... ${rawNumber} (jeda ${delaySec}s)`,
			);

			for (let s = delaySec; s > 0; s--) {
				await new Promise((r) => setTimeout(r, 1000));
				console.log(`[worker] ${s}...`);
			}

			await waService.sendMessage({ no_hp, message });

			removeNumberFromFile(HP_FILE, rawNumber);
			console.log(`[worker] ✓ ${rawNumber} terkirim`);
		},
		{
			connection: getRedis(),
			concurrency: 1,
			lockDuration: 120_000,
			stalledInterval: 60_000,
		},
	);

	await worker.pause();

	worker.on("failed", (job, err) => {
		console.error(`[worker] job ${job?.id} gagal:`, err.message);
	});

	return worker;
}
