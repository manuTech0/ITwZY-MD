import { proto, type WAMessage } from "@whiskeysockets/baileys";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageType =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "document"
	| "sticker"
	| "location"
	| "contact"
	| "poll"
	| "reaction"
	| "unknown";

export interface QuotedMessage {
	id: string;
	fromMe: boolean;
	participant?: string;
	type: MessageType;
	text?: string;
}

export interface ParsedMessage {
	id: string;
	remoteJid: string;
	fromMe: boolean;
	participant?: string; // hanya ada di grup
	pushName?: string;
	timestamp: number;
	type: MessageType;
	text?: string;
	caption?: string;
	mimetype?: string;
	fileName?: string;
	url?: string; // media URL (jika ada)
	thumbnailUrl?: string;
	latitude?: number; // location
	longitude?: number;
	pollName?: string; // poll
	pollOptions?: string[];
	reactionEmoji?: string; // reaction
	reactionTargetId?: string;
	mentionedJids?: string[];
	isEdited: boolean;
	isDeleted: boolean;
	isEphemeral: boolean;
	quoted?: QuotedMessage;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectType(msg: proto.IMessage | null | undefined): MessageType {
	if (!msg) return "unknown";
	if (msg.conversation || msg.extendedTextMessage) return "text";
	if (msg.imageMessage) return "image";
	if (msg.videoMessage) return "video";
	if (msg.audioMessage) return "audio";
	if (msg.documentMessage) return "document";
	if (msg.stickerMessage) return "sticker";
	if (msg.locationMessage || msg.liveLocationMessage) return "location";
	if (msg.contactMessage || msg.contactsArrayMessage) return "contact";
	if (
		msg.pollCreationMessage ||
		msg.pollCreationMessageV2 ||
		msg.pollCreationMessageV3
	)
		return "poll";
	if (msg.reactionMessage) return "reaction";
	return "unknown";
}

function extractText(
	msg: proto.IMessage | null | undefined,
): string | undefined {
	if (!msg) return undefined;
	return msg.conversation || msg.extendedTextMessage?.text || undefined;
}

function extractMentions(
	msg: proto.IMessage | null | undefined,
): string[] | undefined {
	const jids =
		msg?.extendedTextMessage?.contextInfo?.mentionedJid ||
		msg?.imageMessage?.contextInfo?.mentionedJid ||
		msg?.videoMessage?.contextInfo?.mentionedJid ||
		msg?.documentMessage?.contextInfo?.mentionedJid;
	return jids && jids.length > 0 ? jids : undefined;
}

function extractQuoted(
	msg: proto.IMessage | null | undefined,
): QuotedMessage | undefined {
	const ctx =
		msg?.extendedTextMessage?.contextInfo ||
		msg?.imageMessage?.contextInfo ||
		msg?.videoMessage?.contextInfo ||
		msg?.audioMessage?.contextInfo ||
		msg?.documentMessage?.contextInfo ||
		msg?.stickerMessage?.contextInfo;

	if (!ctx?.quotedMessage || !ctx.stanzaId) return undefined;

	return {
		id: ctx.stanzaId,
		fromMe: ctx.participant === undefined, // heuristik sederhana
		participant: ctx.participant ?? undefined,
		type: detectType(ctx.quotedMessage),
		text:
			ctx.quotedMessage.conversation ||
			ctx.quotedMessage.extendedTextMessage?.text ||
			ctx.quotedMessage.imageMessage?.caption ||
			ctx.quotedMessage.videoMessage?.caption ||
			undefined,
	};
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export function parseWAMessage(raw: WAMessage): ParsedMessage | null {
	const key = raw.key;
	if (!key?.remoteJid || !key.id) return null;

	// Unwrap ephemeral / view-once / edit wrapper
	const msg: proto.IMessage | null | undefined =
		raw.message?.ephemeralMessage?.message ||
		raw.message?.viewOnceMessage?.message ||
		raw.message?.viewOnceMessageV2?.message ||
		raw.message?.editedMessage?.message?.protocolMessage?.editedMessage ||
		raw.message;

	const type = detectType(msg);
	const isEdited = !!raw.message?.editedMessage;
	const isDeleted =
		raw.message?.protocolMessage?.type ===
		proto.Message.ProtocolMessage.Type.REVOKE;
	const isEphemeral = !!raw.message?.ephemeralMessage;

	const base: ParsedMessage = {
		id: key.id,
		remoteJid: key.remoteJid,
		fromMe: key.fromMe ?? false,
		participant: key.participant ?? undefined,
		pushName: raw.pushName ?? undefined,
		timestamp:
			typeof raw.messageTimestamp === "number"
				? raw.messageTimestamp
				: Number(raw.messageTimestamp ?? 0),
		type,
		isEdited,
		isDeleted,
		isEphemeral,
		mentionedJids: extractMentions(msg),
		quoted: extractQuoted(msg),
	};

	// ── Text ──────────────────────────────────────────────────────────────────
	if (type === "text") {
		base.text = extractText(msg);
	}

	// ── Image / Video / Document / Audio / Sticker ───────────────────────────
	if (type === "image") {
		const m = msg?.imageMessage!;
		base.caption = m.caption ?? undefined;
		base.mimetype = m.mimetype ?? undefined;
		base.url = m.url ?? undefined;
	}

	if (type === "video") {
		const m = msg?.videoMessage!;
		base.caption = m.caption ?? undefined;
		base.mimetype = m.mimetype ?? undefined;
		base.url = m.url ?? undefined;
	}

	if (type === "audio") {
		const m = msg?.audioMessage!;
		base.mimetype = m.mimetype ?? undefined;
		base.url = m.url ?? undefined;
	}

	if (type === "document") {
		const m = msg?.documentMessage!;
		base.caption = m.caption ?? undefined;
		base.mimetype = m.mimetype ?? undefined;
		base.fileName = m.fileName ?? undefined;
		base.url = m.url ?? undefined;
	}

	if (type === "sticker") {
		const m = msg?.stickerMessage!;
		base.mimetype = m.mimetype ?? undefined;
		base.url = m.url ?? undefined;
	}

	// ── Location ──────────────────────────────────────────────────────────────
	if (type === "location") {
		const m = msg?.locationMessage ?? msg?.liveLocationMessage;
		base.latitude = m?.degreesLatitude ?? undefined;
		base.longitude = m?.degreesLongitude ?? undefined;
	}

	// ── Poll ──────────────────────────────────────────────────────────────────
	if (type === "poll") {
		const m =
			msg?.pollCreationMessageV3 ??
			msg?.pollCreationMessageV2 ??
			msg?.pollCreationMessage;
		base.pollName = m?.name ?? undefined;
		base.pollOptions = m?.options?.map((o) => o.optionName ?? "") ?? undefined;
	}

	// ── Reaction ──────────────────────────────────────────────────────────────
	if (type === "reaction") {
		const m = msg?.reactionMessage!;
		base.reactionEmoji = m.text ?? undefined;
		base.reactionTargetId = m.key?.id ?? undefined;
	}

	return base;
}
