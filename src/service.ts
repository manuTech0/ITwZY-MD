import type { WAMessage } from "@whiskeysockets/baileys";
import i18next from "i18next";
import { appConfig } from "./configs/app";
import type { MakeWASocket } from "./types/baileys";
import { type ParsedMessage, parseWAMessage } from "./utils/parseMessage";
import {
	createPluginParser,
	loadPluginMeta,
	systemPlugins,
} from "./utils/plugins";
import { PluginManager } from "./utils/plugins/manager";
import type { ParseResult } from "./utils/plugins/types";

export class WhatsAppService {
	private sock: MakeWASocket;
	private parser?: (text: string) => ParseResult;
	private manager?: PluginManager;
	constructor(sock: MakeWASocket) {
		this.sock = sock;
	}
	async init() {
		const manager = new PluginManager(30_000, 20);
		const metas = await loadPluginMeta("plugins");
		const sysPlugins = systemPlugins(metas);
		for (const meta of [...metas, ...sysPlugins.plugin]) {
			manager.register(meta);
		}
		this.manager = manager;

		this.parser = createPluginParser(metas.concat(sysPlugins.meta));

		setInterval(() => manager.cleanup(), 30_000);
	}
	private async adminOnly(m: ParsedMessage | null) {
		if (!m) return false;
		if (!appConfig.settings.adminOnly) return true;

		const lid = await this.adminLID();
		if (lid === m.remoteJid || lid === m.participant) {
			return true;
		}
		return false;
	}
	private async adminLID() {
		return this.sock.signalRepository.lidMapping.getLIDForPN(
			`${appConfig.profile.adminnumber}@s.whatsapp.net`,
		);
	}
	async send(m: WAMessage) {
		// Parse WAMessage
		const parsed = parseWAMessage(m);
		// ambil lid dari admin
		const adminLID = await this.adminLID();
		if (
			appConfig.settings.isolation &&
			parsed?.remoteJid === appConfig.settings.groupJID
		) {
			if (parsed) {
				// Hasil dari proteksi global guardResult: Proteksi global
				const guardResult = await Promise.all([this.adminOnly(parsed)]);

				// Lolos jika proteksi global true semua
				if (guardResult.every((v) => v === true)) {
					// Split message teks semua
					const textSplit = parsed.text?.split(" ");

					// Loloskan teks yang berupa perintah
					if (
						textSplit?.[0]?.startsWith(appConfig.settings.prefix) &&
						this.parser &&
						this.manager
					) {
						// Teks perintah tanpa dengan prefix
						const nonPrefix = textSplit[0].slice(1);
						const args: string[] = textSplit.slice(1);
						// Parse perintah dan cari plugin yang cocok dengan fuzzy search
						const result = this.parser(nonPrefix);
						if (result) {
							const plugin = await this.manager.getByCommand(result.command);

							// Proteksi individual terhadap masing masing plugins
							if (plugin?.permission?.admin && adminLID !== parsed.remoteJid) {
								// Throw proteksi induvidual
								this.sock.sendMessage(
									parsed.remoteJid,
									{
										text: i18next.t("translation:forbidden"),
									},
									{ quoted: m },
								);
							} else if (result && plugin) {
								if (result.type === "fuzzy") {
									// Jika pencarian pluin tidak memiliki probalistik yang tinggi
									await this.sock.sendMessage(parsed.remoteJid, {
										text: i18next.t("translation:plugins.index.fuzzy", {
											command: plugin.name,
											score: result.score,
										}),
									});
								} else if (result.type === "exact") {
									// Jika pencarian plugins match
									await plugin.execute(
										this.sock,
										{
											args,
											info: parsed,
										},
										m,
									);
								}
							}
						}
					}
				} else {
					// Throw error untuk proteksi global = false
					// FIXME:
					this.sock.sendMessage(
						parsed.remoteJid,
						{
							text: i18next.t("translation:forbidden"),
						},
						{ quoted: m },
					);
				}
			}
		}
	}
}
