import type { WWebJSClient } from "./types/wwebjs";

export interface SendResult {
	id: string | null;
}

export class WhatsAppService {
	private getClient: () => WWebJSClient;
	constructor(getClient: () => WWebJSClient) {
		this.getClient = getClient;
	}

	private assertReady(client: WWebJSClient): void {
		if (!client.info) {
			throw new Error("WhatsApp client belum ready");
		}
	}

	async sendMessage(data: {
		no_hp: string;
		message: string;
	}): Promise<SendResult> {
		const client = this.getClient();
		this.assertReady(client);

		const chatId = `${data.no_hp}@c.us`;

		try {
			await client.sendPresenceAvailable();
			await new Promise((r) => setTimeout(r, 1500));
			const msg = await client.sendMessage(chatId, data.message);
			await client.sendPresenceUnavailable();
			const id = msg?.id?._serialized ?? null;
			return { id };
		} catch (err) {
			await client.sendPresenceUnavailable().catch(() => {});
			throw err;
		}
	}

	async destroy() {
		const client = this.getClient();
		await client.destroy();
	}
}
