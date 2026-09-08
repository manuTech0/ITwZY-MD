import { rmSync } from "node:fs";
import NodeCache from "@cacheable/node-cache";
import { Boom } from "@hapi/boom";
import makeWASocket, {
	Browsers,
	type CacheStore,
	DisconnectReason,
	delay,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	type SignalKeyStore,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import * as QRCode from "qrcode";
import { appConfig } from "../configs/app";
import { ENV } from "../configs/env";
import { logger } from "../infra/logger";
import { inboundQueue } from "../queue";
import type { MakeWASocket } from "../types/baileys";
import { validatePhoneNumber } from "../utils/phoneValidator";
import { toInboundMessage } from "./message";

let sock: MakeWASocket | null = null;
let pairingRequested = false;
let reconnectAttempts = 0;

const MAX_RECONNECT_DELAY_MS = 60_000;

/* --------------------------------- login -------------------------------- */

function printQR(qr: string) {
	QRCode.toString(
		qr,
		{
			color: {
				dark: "#000",
				light: "#fff",
			},
			width: 2,
			small: true,
			type: "terminal",
		},
		(error, out) => {
			if (error) {
				logger.error(error);
			} else {
				console.log("Your qrcode");
				console.log(out);
			}
		},
	);
}

// QR dan pairing code dikasih dua-duanya: QR selalu dicetak saat tersedia,
// pairing diminta paralel tanpa delay. Flag mencegah request ganda;
// gagal -> flag dibuka lagi agar retry di update berikutnya.
async function maybeRequestPairingCode() {
	if (!sock || sock.authState.creds.registered) return;
	if (!ENV.PAIRING_CODE) return;
	if (pairingRequested) return;
	pairingRequested = true;

	const validated = validatePhoneNumber(appConfig.profile.botnumber);
	if (!validated.valid) {
		pairingRequested = false;
		logger.error(`Phone number invalid: ${validated.error}`);
		return;
	}

	try {
		const code = await sock.requestPairingCode(validated.formatted);
		logger.info(`YOUR PAIRING CODE: ${code}`);
	} catch (e) {
		pairingRequested = false;
		logger.error(e, "gagal request pairing code, retry di update berikutnya");
	}
}

/* --------------------------- disconnect mapping -------------------------- */

type CloseAction =
	| { kind: "reconnect"; reason: string }
	| { kind: "fresh"; reason: string } // wipe auth state lalu reconnect
	| { kind: "exit"; reason: string }; // butuh intervensi manual

export type { CloseAction };

// NOTE: connectionLost dan timedOut sama-sama 408, ditangani satu cabang.
export function mapDisconnect(statusCode: number | undefined): CloseAction {
	if (statusCode === DisconnectReason.loggedOut) {
		return { kind: "exit", reason: "logged out, login manual" };
	}
	if (statusCode === DisconnectReason.forbidden) {
		return {
			kind: "exit",
			reason: "forbidden (akun dibatasi), intervensi manual",
		};
	}
	if (statusCode === DisconnectReason.connectionReplaced) {
		return { kind: "exit", reason: "koneksi digantikan device lain" };
	}
	if (statusCode === DisconnectReason.badSession) {
		return { kind: "fresh", reason: "bad session, auth state dihapus" };
	}
	if (statusCode === DisconnectReason.multideviceMismatch) {
		return {
			kind: "fresh",
			reason: "multidevice mismatch, auth state dihapus",
		};
	}
	if (statusCode === DisconnectReason.restartRequired) {
		return { kind: "reconnect", reason: "restart required" };
	}
	if (statusCode === DisconnectReason.unavailableService) {
		return { kind: "reconnect", reason: "service unavailable" };
	}
	if (statusCode === DisconnectReason.connectionClosed) {
		return { kind: "reconnect", reason: "connection closed" };
	}
	if (
		statusCode === DisconnectReason.connectionLost ||
		statusCode === DisconnectReason.timedOut
	) {
		return { kind: "reconnect", reason: "connection lost/timed out" };
	}
	return { kind: "reconnect", reason: `unknown status ${statusCode}` };
}

function wipeAuthState() {
	rmSync(`state/${ENV.STATE_PATH}`, { recursive: true, force: true });
}

function reconnectDelayMs(attempt: number): number {
	const exp = Math.min(
		1000 * 2 ** Math.max(attempt - 1, 0),
		MAX_RECONNECT_DELAY_MS,
	);
	return exp + Math.floor(Math.random() * 1000);
}

async function scheduleReconnect(reason: string) {
	reconnectAttempts += 1;
	const waitMs = reconnectDelayMs(reconnectAttempts);
	logger.warn(`${reason} - reconnect #${reconnectAttempts} dalam ${waitMs}ms`);
	await delay(waitMs);
	sock = null;
	pairingRequested = false;
	await createWaConnection();
}

async function handleClose(date: Date, error: unknown) {
	const statusCode =
		error instanceof Boom ? error.output.statusCode : undefined;
	const action = mapDisconnect(statusCode);
	const stamp = date.toISOString();

	if (action.kind === "exit") {
		logger.error(`[${stamp}] ${action.reason}`);
		process.exit(1);
	}
	if (action.kind === "fresh") {
		logger.warn(`[${stamp}] ${action.reason}`);
		wipeAuthState();
		pairingRequested = false;
	} else {
		logger.warn(`[${stamp}] ${action.reason}`);
	}
	await scheduleReconnect(action.reason);
}

/* --------------------------------- socket -------------------------------- */

export async function createWaConnection(): Promise<MakeWASocket> {
	const stateAuth = await useMultiFileAuthState(`state/${ENV.STATE_PATH}`);

	const msgRetryCounterCache = new NodeCache() as CacheStore;

	const { version, isLatest } = await fetchLatestBaileysVersion();
	logger.info(
		`Status wa version: ${version.join(",")} ${isLatest ? "(latest)" : ""}`,
	);
	if (!sock) {
		sock = makeWASocket({
			auth: {
				creds: stateAuth.state.creds,
				keys: makeCacheableSignalKeyStore(
					stateAuth.state.keys as SignalKeyStore,
					logger,
				),
			},
			browser: Browsers.windows("11"),
			logger,
			connectTimeoutMs: 60000,
			// Gateway minimal tidak butuh history sync: langsung Online tanpa
			// menunggu notifikasi history (timeout 20s AwaitingInitialSync).
			shouldSyncHistoryMessage: () => false,
			version,
			msgRetryCounterCache,
		});
	}

	sock.ev.on("creds.update", stateAuth.saveCreds);
	sock.ev.on("connection.update", async (update) => {
		const registered = sock?.authState.creds.registered ?? false;

		if (update.qr && !registered) {
			printQR(update.qr);
		}
		if (!registered) {
			void maybeRequestPairingCode();
		}

		if (update.connection === "close") {
			const { error, date } = update.lastDisconnect ?? {};
			await handleClose(date ?? new Date(), error);
		} else if (update.connection === "connecting") {
			logger.warn("Conecting....");
		} else if (update.connection === "open") {
			reconnectAttempts = 0;
			pairingRequested = false;
			logger.info("Connection successfully");
		}
	});
	sock.ev.on("messages.upsert", async ({ type, messages }) => {
		if (type !== "notify") return;
		const jobs = messages
			.map((msg) => toInboundMessage(msg))
			.filter((msg) => msg !== null)
			.map((data) => ({ name: "wa-received", data }));
		if (jobs.length > 0) {
			await inboundQueue.addBulk(jobs);
		}
	});
	return sock;
}
