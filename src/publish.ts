import type { Message } from "whatsapp-web.js";
import { messageUpsertQueue } from "./infra/queue";
import { type ParsedMessage, parseWAMessage } from "./utils/parseMessage";

export async function publishWAMessage(messages: Message[]) {
	for (const msg of messages) {
		const message: ParsedMessage | null = parseWAMessage(msg);
		if (message) {
			await messageUpsertQueue.add("message.upsert", message);
		}
	}
}
