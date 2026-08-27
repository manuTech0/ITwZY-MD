import QRCode from "qrcode-terminal";
import WAWebJS from "whatsapp-web.js";
import { appConfig } from "./configs/app.js";
import { ENV } from "./configs/env.js";
import { logger } from "./infra/logger.js";
import { publishWAMessage } from "./publish";
import type { WWebJSClient } from "./types/wwebjs.js";
import { validatePhoneNumber } from "./utils/phoneValidator.js";

const { Client, LocalAuth } = WAWebJS;

let client: WWebJSClient | null = null;

export function getClient(): WWebJSClient {
	if (!client) {
		throw new Error("WhatsApp client belum tersedia");
	}
	return client;
}

type ConnectionCallback = () => void | Promise<void>;

const openHandlers = new Set<ConnectionCallback>();
const closeHandlers = new Set<ConnectionCallback>();
const restrictionHandlers = new Set<ConnectionCallback>();

export function onConnectionOpen(cb: ConnectionCallback) {
	openHandlers.add(cb);
}

export function onConnectionClose(cb: ConnectionCallback) {
	closeHandlers.add(cb);
}

export function onRestriction(cb: ConnectionCallback) {
	restrictionHandlers.add(cb);
}

export async function waSOCK(): Promise<WWebJSClient> {
	if (!client) {
		client = new Client({
			authStrategy: new LocalAuth({
				dataPath: "state",
			}),
			puppeteer: {
				executablePath:
					"/home/manu/.cache/puppeteer/chrome/linux-152.0.7977.54/chrome-linux64/chrome",
				headless: false,
				args: [],
			},
			qrMaxRetries: 5,
			takeoverOnConflict: true,
		});

		client.on("qr", async (qr) => {
			if (!ENV.PAIRING_CODE) {
				QRCode.generate(qr, { small: true }, (qrText) => {
					console.log("Your QR code:");
					console.log(qrText);
				});
			}
		});

		client.on("authenticated", () => {
			logger.info("WhatsApp authenticated");
		});

		client.on("auth_failure", (msg) => {
			logger.error(`Auth failure: ${msg}`);
		});

		client.on("ready", async () => {
			logger.info("Connection successfully");

			if (ENV.PAIRING_CODE && client) {
				const validated = validatePhoneNumber(appConfig.profile.wanumber);
				if (validated.valid) {
					const code = await client.requestPairingCode(validated.formatted);
					logger.info(`YOUR PAIRING CODE: ${code}`);
				} else {
					logger.error(`Phone number failed ${validated.error}`);
				}
			}

			for (const cb of openHandlers) await cb();
		});

		client.on("disconnected", async (reason) => {
			logger.warn(`Connection disconnected: ${reason}`);
			for (const cb of closeHandlers) await cb();
		});

		const RESTRICTION_TEXT = "Akun Anda di perangkat tertaut dibatasi";

		client.on("message", async (msg) => {
			if (msg.body?.includes(RESTRICTION_TEXT)) {
				logger.error("Akun terdeteksi RESTRIKSI — mempause worker");
				for (const cb of restrictionHandlers) await cb();
				return;
			}
			await publishWAMessage([msg]);
		});

		await client.initialize();
	}

	return client;
}
