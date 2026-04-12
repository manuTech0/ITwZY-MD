import type { WAMessage } from "@whiskeysockets/baileys";
import { appConfig } from "./configs/app";
import type { MakeWASocket } from "./types/baileys";
import { type ParsedMessage, parseWAMessage } from "./utils/parseMessage";
import i18next from "i18next";
import type { PluginConfig } from "./utils/plugins/types";
import { createPluginParser, loadPlugins } from "./utils/plugins";
import { resolve } from "node:path";

export class WhatsAppService {
	private sock: MakeWASocket;
	private plugins: PluginConfig[] = []
	private parser: ReturnType<typeof createPluginParser> | null = null
	constructor(sock: MakeWASocket) {
		this.sock = sock;
	}
	async init() {
		const path = resolve(process.cwd(), "plugins")
		this.plugins = await loadPlugins(path)
		this.parser = createPluginParser(this.plugins)
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
		const parsed = parseWAMessage(m);
		if (parsed) {
			const guardResult = await Promise.all([this.adminOnly(parsed)]);
			if (guardResult.every((v) => v === true)) {
				const textSplit = parsed.text?.split(" ")				
				if(textSplit && textSplit[0]?.startsWith(appConfig.settings.prefix) && this.parser) {
					const nonPrefix = textSplit[0].slice(1)
					const result = this.parser(nonPrefix)
					if(result) {
						if(result.type === "fuzzy") {
							await this.sock.sendMessage(parsed.remoteJid, {
								text: i18next.t("translation:plugins.index.fuzzy", {
									command: result.plugin.name,
									score: result.score
								})
							})
						} else if(result.type === "exact" || result.type === "regex") {
							await result.plugin.execute(this.sock, parsed, m)
						} 
					}
				}
			} else {
				this.sock.sendMessage(parsed.remoteJid, {
					text: i18next.t("translation:forbidden"),
				}, { quoted: m });
			}
		}
	}
}
