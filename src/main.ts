import { rmSync } from "node:fs";
import NodeCache from "@cacheable/node-cache";
import { Boom } from "@hapi/boom";
import makeWASocket, {
	type AuthenticationState,
	Browsers,
	type CacheStore,
	DisconnectReason,
	delay,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	type SignalKeyStore,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import useBaileysAuthState from "baileysauth";
import type { BaileysAuthState } from "baileysauth/dist/Types";
import * as QRCode from "qrcode";
import { appConfig } from "./configs/app.js";
import { ENV } from "./configs/env.js";
import { logger } from "./infra/logger.js";
import { waQueue } from "./queue.js";
import type { MakeWASocket } from "./types/baileys.js";
import { validatePhoneNumber } from "./utils/phoneValidator.js";

let sock: MakeWASocket | null = null;
export async function waSOCK(): Promise<MakeWASocket> {
	let stateAuth:
		| {
				saveCreds: () => Promise<void>;
				state: AuthenticationState;
		  }
		| BaileysAuthState;

	if (ENV.STATE_TYPE === "db") {
		stateAuth = await useBaileysAuthState(ENV.DATABASE_URL);
	} else {
		stateAuth = await useMultiFileAuthState(`state/${ENV.STATE_PATH}`);
	}

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
			version,
			msgRetryCounterCache,
		});
	}

	sock.ev.on("creds.update", stateAuth.saveCreds);
	sock.ev.on("connection.update", async (update) => {
		const { qr } = update;
		if (sock && !sock.authState.creds.registered) {
			await delay(6000);
			const validated = validatePhoneNumber(appConfig.profile.botnumber);
			if (ENV.PAIRING_CODE) {
				if (validated.valid) {
					const code = await sock.requestPairingCode(validated.formatted);
					logger.info(`YOUR PAIRING CODE: ${code}`);
				} else {
					logger.error(`Phone number failed ${validated.error}`);
				}
			}
		}
		if (qr && sock && !sock.authState.creds.registered) {
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
				(error, qr) => {
					if (error) {
						logger.error(error);
					} else {
						console.log("Your qrcode");
						console.log(qr);
					}
				},
			);
		}
		if (update.connection === "close") {
			if (update.lastDisconnect) {
				const { error, date } = update.lastDisconnect;
				if (error instanceof Boom) {
					const status = error.output.statusCode;
					if (status === DisconnectReason.loggedOut) {
						if (ENV.STATE_TYPE === "file") {
							rmSync(ENV.STATE_PATH, { recursive: true, force: true });
						} else if ("close" in stateAuth) {
							await stateAuth.wipeCreds();
						}
						logger.warn(
							`[${date.toISOString()}] your logged and trying login manually`,
						);
						process.exit(1);
					} else if (
						status === DisconnectReason.connectionLost ||
						status === DisconnectReason.restartRequired ||
						status === DisconnectReason.timedOut
					) {
						logger.warn(
							`[${date.toISOString()}] Connection Lost and reconnect`,
						);
						await delay(5000);
						sock = null;
						waSOCK();
					} else if (status === DisconnectReason.badSession) {
						logger.warn(`[${date.toISOString()}] bad session`);
					} else if (status === DisconnectReason.connectionClosed) {
						logger.error(`[${date.toISOString()}] Connection closed`);
						process.exit(1);
					} else {
						logger.error(error);
					}
				} else if (error instanceof Error) {
					logger.error(error.message);
				} else {
					logger.error(
						`[${update.lastDisconnect?.date.toISOString()}] unexpected error`,
					);
				}
			} else {
				logger.error(`Unexpected error`);
			}
		} else if (update.connection === "connecting") {
			logger.warn("Conecting....");
		} else if (update.connection === "open") {
			logger.info("Connection successfully");
		}
	});
	sock.ev.on("messages.upsert", async (m) => {
		if (m.type === "notify") {
			await waQueue.addBulk(
				m.messages.map((msg) => ({
					name: "wa-send",
					data: msg,
				})),
			);
		}
	});
	return sock;
}
