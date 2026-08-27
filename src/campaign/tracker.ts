import type { Message } from "whatsapp-web.js";
import WAWebJS from "whatsapp-web.js";
import { getDb } from "../infra/db";
import { logger } from "../infra/logger";
import type { WWebJSClient } from "../types/wwebjs";

const { MessageAck } = WAWebJS;

type AckValue = (typeof MessageAck)[keyof typeof MessageAck];

export function trackDelivery(client: WWebJSClient) {
	client.on("message_ack", (msg: Message, ack: AckValue) => {
		const serializedId = msg.id?._serialized;
		if (!serializedId) return;

		const db = getDb();
		const now = new Date().toISOString();

		const recipient = db
			.prepare(
				`SELECT id, campaign_id FROM campaign_recipients
				 WHERE message_id = ? AND status != 'failed'`,
			)
			.get(serializedId) as { id: string; campaign_id: string } | undefined;

		if (!recipient) return;

		if (ack === MessageAck.ACK_ERROR) {
			db.prepare(
				`UPDATE campaign_recipients
				 SET status = 'failed', error = 'ack_error', sent_at = COALESCE(sent_at, ?)
				 WHERE id = ?`,
			).run(now, recipient.id);
			db.prepare(
				`UPDATE campaigns SET failed = failed + 1, updated_at = ? WHERE id = ?`,
			).run(now, recipient.campaign_id);
			logger.debug(`[tracker] ${serializedId} → FAILED`);
			return;
		}

		if (ack === MessageAck.ACK_SERVER || ack === MessageAck.ACK_DEVICE) {
			db.prepare(
				`UPDATE campaign_recipients
				 SET status = 'delivered', delivered_at = ?
				 WHERE id = ? AND status = 'sent'`,
			).run(now, recipient.id);
			db.prepare(
				`UPDATE campaigns SET delivered = delivered + 1, updated_at = ? WHERE id = ?`,
			).run(now, recipient.campaign_id);
			logger.debug(`[tracker] ${serializedId} → DELIVERED`);
			return;
		}

		if (ack === MessageAck.ACK_READ) {
			db.prepare(
				`UPDATE campaign_recipients
				 SET status = 'read', read_at = ?
				 WHERE id = ? AND status != 'read'`,
			).run(now, recipient.id);
			db.prepare(
				`UPDATE campaigns SET read = read + 1, updated_at = ? WHERE id = ?`,
			).run(now, recipient.campaign_id);
			logger.debug(`[tracker] ${serializedId} → READ`);
			return;
		}

		if (ack === MessageAck.ACK_PLAYED) {
			db.prepare(
				`UPDATE campaign_recipients
				 SET status = 'read', read_at = ?
				 WHERE id = ? AND status != 'read'`,
			).run(now, recipient.id);
			db.prepare(
				`UPDATE campaigns SET read = read + 1, updated_at = ? WHERE id = ?`,
			).run(now, recipient.campaign_id);
			logger.debug(`[tracker] ${serializedId} → PLAYED`);
		}
	});
}
