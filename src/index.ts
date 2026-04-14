import { loadAppConfig } from "./configs/app";
import { loadEnv } from "./configs/env";
import { logger } from "./infra/logger";
import { waSOCK } from "./main";
import { createWorker } from "./queue";
import { WhatsAppService } from "./service";
import { initi18n } from "./utils/i18n";

try {
	loadEnv();
} catch (e) {
	logger.error("Load environment variable failed", undefined, e);
	process.exit(1);
}

try {
	loadAppConfig();
} catch (e) {
	logger.error("Load environment variable failed", undefined, e);
	process.exit(1);
}

setInterval(() => {
	const mem = process.memoryUsage();

	console.log({
		rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
		heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
		heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
		external: `${(mem.external / 1024 / 1024).toFixed(2)} MB`,
		arrayBuffers: `${(mem.arrayBuffers / 1024 / 1024).toFixed(2)} MB`,
	});
}, 5000);

await initi18n();
const sock = await waSOCK();
const waService = new WhatsAppService(sock);
await waService.init();
createWorker(waService);
