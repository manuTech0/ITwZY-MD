import WAWebJS from "whatsapp-web.js";

type Message = WAWebJS.Message;
const { MessageTypes } = WAWebJS;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMessageType =
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
	type: AppMessageType;
	text?: string;
}

export interface ParsedMessage {
	id: string;
	remoteJid: string;
	fromMe: boolean;
	participant?: string;
	pushName?: string;
	timestamp: number;
	type: AppMessageType;
	text?: string;
	caption?: string;
	mimetype?: string;
	fileName?: string;
	url?: string;
	thumbnailUrl?: string;
	latitude?: number;
	longitude?: number;
	pollName?: string;
	pollOptions?: string[];
	reactionEmoji?: string;
	reactionTargetId?: string;
	mentionedJids?: string[];
	isEdited: boolean;
	isDeleted: boolean;
	isEphemeral: boolean;
	quoted?: QuotedMessage;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectType(msg: Message): AppMessageType {
	switch (msg.type) {
		case MessageTypes.TEXT:
			return "text";
		case MessageTypes.IMAGE:
			return "image";
		case MessageTypes.VIDEO:
			return "video";
		case MessageTypes.AUDIO:
		case MessageTypes.VOICE:
			return "audio";
		case MessageTypes.DOCUMENT:
			return "document";
		case MessageTypes.STICKER:
			return "sticker";
		case MessageTypes.LOCATION:
			return "location";
		case MessageTypes.CONTACT_CARD:
		case MessageTypes.CONTACT_CARD_MULTI:
			return "contact";
		case MessageTypes.POLL_CREATION:
			return "poll";
		case MessageTypes.REACTION:
			return "reaction";
		case MessageTypes.REVOKED:
			return "unknown";
		default:
			return "unknown";
	}
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export function parseWAMessage(msg: Message): ParsedMessage | null {
	const id = msg.id;
	if (!id?.remote) return null;

	const type = detectType(msg);

	const base: ParsedMessage = {
		id: id._serialized,
		remoteJid: id.remote,
		fromMe: id.fromMe,
		participant: msg.author ?? undefined,
		pushName: undefined,
		timestamp: msg.timestamp,
		type,
		isEdited: !!msg.latestEditSenderTimestampMs,
		isDeleted: msg.type === MessageTypes.REVOKED,
		isEphemeral: msg.isEphemeral,
		mentionedJids: msg.mentionedIds.length > 0 ? msg.mentionedIds : undefined,
	};

	if (msg.body) {
		base.text = msg.body;
	}

	if (type === "image" || type === "video") {
		base.caption = msg.body || undefined;
	}

	if (type === "document") {
		base.fileName = msg.body || undefined;
	}

	if (type === "location" && msg.location) {
		base.latitude = Number.parseFloat(msg.location.latitude);
		base.longitude = Number.parseFloat(msg.location.longitude);
	}

	if (type === "contact" && msg.vCards && msg.vCards.length > 0) {
		base.text = msg.vCards.join("\n");
	}

	if (type === "poll") {
		base.pollName = msg.pollName;
		base.pollOptions = msg.pollOptions;
	}

	return base;
}
