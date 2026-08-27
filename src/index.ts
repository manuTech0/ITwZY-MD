import { createCampaign } from "./campaign/creator";
import { startCampaignWorker } from "./campaign/sender";
import { trackDelivery } from "./campaign/tracker";
import { loadAppConfig } from "./configs/app";
import { loadEnv } from "./configs/env";
import { getDb } from "./infra/db";
import { logger } from "./infra/logger";
import { campaignSendQueue } from "./infra/queue";
import {
	getClient,
	onConnectionClose,
	onConnectionOpen,
	onRestriction,
	waSOCK,
} from "./main";
import { WhatsAppService } from "./service";
import { startMessageWorker } from "./subscribe";

try {
	loadEnv();
} catch (e) {
	logger.error("Load environment variable failed", undefined, e);
	process.exit(1);
}

try {
	loadAppConfig();
} catch (e) {
	logger.error("Load app config failed", undefined, e);
	process.exit(1);
}

const client = await waSOCK();
const waService = new WhatsAppService(() => client);
const worker = await startMessageWorker(waService);
const campaignWorker = await startCampaignWorker(waService, getClient);
const wantsCampaign = process.argv.includes("--campaign");
const wantsBroadcast = process.argv.includes("--broadcast");

trackDelivery(client);

onConnectionClose(() => {
	logger.warn("Koneksi WhatsApp terputus, worker dipause");
	void worker.pause();
	void campaignWorker.pause();
});

onRestriction(() => {
	logger.error("Akun direstriksi, worker dipause");
	void worker.pause();
	void campaignWorker.pause();
	const db = getDb();
	db.prepare(
		`UPDATE campaigns SET status = 'paused', paused_reason = 'restricted', updated_at = datetime('now')
		 WHERE status IN ('queued', 'running')`,
	).run();
});

onConnectionOpen(async () => {
	await worker.resume();
	await campaignWorker.resume();

	if (wantsCampaign) {
		try {
			const result = await createCampaign();
			const db = getDb();

			const campaign = db
				.prepare(`SELECT message FROM campaigns WHERE id = ?`)
				.get(result.campaignId) as { message: string } | undefined;

			const recipients = db
				.prepare(
					`SELECT id, phone FROM campaign_recipients
					 WHERE campaign_id = ? AND status = 'pending'`,
				)
				.all(result.campaignId) as { id: string; phone: string }[];

			for (const r of recipients) {
				await campaignSendQueue.add("campaign.send", {
					campaignId: result.campaignId,
					recipientId: r.id,
					phone: r.phone,
					message: campaign?.message ?? "",
				});
			}

			db.prepare(
				`UPDATE campaigns SET status = 'running', updated_at = datetime('now')
				 WHERE id = ?`,
			).run(result.campaignId);

			console.log(
				`[campaign] "${result.name}" mulai mengirim ${recipients.length} pesan`,
			);
		} catch (e) {
			logger.warn({ err: e }, "Campaign gagal dimulai");
		}
	}

	if (wantsBroadcast) {
		const { enqueueBroadcastFromFiles } = await import("./broadcast");
		try {
			await enqueueBroadcastFromFiles();
		} catch (e) {
			logger.warn(
				{ err: e },
				"Broadcast dilewati (hp.txt/msg.txt tidak tersedia atau gagal dibaca)",
			);
		}
	}
});
