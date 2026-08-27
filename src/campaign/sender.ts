import { Worker } from "bullmq";
import { getDb } from "../infra/db";
import { getRedis } from "../infra/redis";
import type { WhatsAppService } from "../service";
import type { WWebJSClient } from "../types/wwebjs";

export async function startCampaignWorker(
	waService: WhatsAppService,
	getClient: () => WWebJSClient,
): Promise<Worker> {
	const worker = new Worker<{
		campaignId: string;
		recipientId: string;
		phone: string;
		message: string;
	}>(
		"campaign-send",
		async (job) => {
			const { campaignId, recipientId, phone, message } = job.data;
			const db = getDb();
			const client = getClient();

			// Opt-in validation
			if (!client.info) {
				throw new Error("WhatsApp client belum ready");
			}

			const chatId = `${phone}@c.us`;
			try {
				const isRegistered = await client.isRegisteredUser(chatId);
				if (!isRegistered) {
					db.prepare(
						`UPDATE campaign_recipients
						 SET status = 'failed', error = 'not_registered', sent_at = datetime('now')
						 WHERE id = ?`,
					).run(recipientId);
					db.prepare(
						`UPDATE campaigns SET failed = failed + 1, updated_at = datetime('now')
						 WHERE id = ?`,
					).run(campaignId);
					console.log(`[campaign] ${phone} tidak terdaftar, skip`);
					return;
				}
			} catch {
				// isRegisteredUser might fail for some numbers, proceed anyway
			}

			// Send
			const result = await waService.sendMessage({ no_hp: phone, message });
			const messageId = result?.id ?? null;

			db.prepare(
				`UPDATE campaign_recipients
				 SET status = 'sent', message_id = ?, sent_at = datetime('now')
				 WHERE id = ?`,
			).run(messageId, recipientId);

			db.prepare(
				`UPDATE campaigns SET sent = sent + 1, updated_at = datetime('now')
				 WHERE id = ?`,
			).run(campaignId);

			console.log(`[campaign] ✓ ${phone} terkirim (${messageId})`);
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
		if (!job) return;
		const { campaignId, recipientId } = job.data;
		const db = getDb();

		db.prepare(
			`UPDATE campaign_recipients
			 SET status = 'failed', error = ?, sent_at = datetime('now')
			 WHERE id = ?`,
		).run(err.message, recipientId);

		db.prepare(
			`UPDATE campaigns SET failed = failed + 1, updated_at = datetime('now')
			 WHERE id = ?`,
		).run(campaignId);

		console.error(`[campaign] job ${job.id} gagal: ${err.message}`);
	});

	return worker;
}
