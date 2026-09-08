import type { WAMessage } from "@whiskeysockets/baileys";
import type { MakeWASocket } from "../types/baileys";
import { type MessageType, parseWAMessage } from "../utils/parseMessage";
import { validatePhoneNumber } from "../utils/phoneValidator";

/* ------------------------------- inbound -------------------------------- */

export interface QuotedRef {
	id: string;
	text?: string;
}

// DTO pesan masuk yang JSON-aman: cocok untuk queue (BullMQ) dan REST API.
// Berisi string/number/boolean saja, tanpa Buffer, Long, atau proto Baileys.
export interface InboundMessage {
	id: string;
	chatId: string;
	senderId: string; // participant di grup, selain itu sama dengan chatId
	isGroup: boolean;
	fromMe: boolean;
	pushName?: string;
	timestamp: number;
	kind: MessageType;
	text?: string; // teks/caption/poll/reaction yang disatukan
	quoted?: QuotedRef;
}

function unifyText(parsed: {
	text?: string;
	caption?: string;
	pollName?: string;
	reactionEmoji?: string;
}): string | undefined {
	return (
		parsed.text ?? parsed.caption ?? parsed.pollName ?? parsed.reactionEmoji
	);
}

export function toInboundMessage(raw: WAMessage): InboundMessage | null {
	const parsed = parseWAMessage(raw);
	if (!parsed) return null;

	const timestamp = Number.isFinite(parsed.timestamp)
		? parsed.timestamp
		: Date.now();

	const quoted: QuotedRef | undefined = parsed.quoted
		? { id: parsed.quoted.id, text: parsed.quoted.text }
		: undefined;

	return {
		id: parsed.id,
		chatId: parsed.remoteJid,
		senderId: parsed.participant ?? parsed.remoteJid,
		isGroup: parsed.remoteJid.endsWith("@g.us"),
		fromMe: parsed.fromMe,
		pushName: parsed.pushName,
		timestamp,
		kind: parsed.type,
		text: unifyText(parsed),
		quoted,
	};
}

/* ------------------------------- outbound ------------------------------- */

// DTO kirim pesan yang JSON-aman: tinggal divalidasi (zod) di REST API.
export interface SendTextRequest {
	to: string;
	text: string;
}

export async function sendText(sock: MakeWASocket, req: SendTextRequest) {
	await sock.sendMessage(req.to, { text: req.text });
}

// Server JID yang diizinkan lewat apa adanya (user, grup, channel, dsb).
const KNOWN_SERVERS = [
	"s.whatsapp.net",
	"g.us",
	"lid",
	"broadcast",
	"newsletter",
];

// Normalisasi tujuan kirim ke JID penuh. Nomor mentah ("0812…",
// "62812…") jadi "62…@s.whatsapp.net"; JID valid lewat apa adanya.
// Throw jika tidak valid — Baileys crash (jidDecode undefined) jika tidak.
export function normalizeRecipient(to: string): string {
	const trimmed = to.trim();
	if (trimmed.includes("@")) {
		const [user, server] = trimmed.split("@");
		if (!user || !server || !KNOWN_SERVERS.includes(server)) {
			throw new Error(`invalid recipient JID: ${to}`);
		}
		return trimmed;
	}
	const validated = validatePhoneNumber(trimmed);
	if (!validated.valid) {
		throw new Error(`invalid recipient: ${validated.error}`);
	}
	return `${validated.formatted}@s.whatsapp.net`;
}

/* ---------------------------- queue envelopes --------------------------- */

// Event untuk queue "message.out": pesan WA yang sudah dimapping ada di
// field "message". Dipublish dengan jobId = message.id sebagai
// idempotency key ("message_id") agar redelivery tidak ganda.
export interface MessageOutEvent {
	message: InboundMessage;
	source: "whatsapp";
	receivedAt: number;
}

export function toMessageOutEvent(m: InboundMessage): MessageOutEvent {
	return { message: m, source: "whatsapp", receivedAt: Date.now() };
}

// Job untuk queue "message.in": pesan yang harus dikirim ke WA.
export interface MessageInJob {
	message: SendTextRequest;
}
