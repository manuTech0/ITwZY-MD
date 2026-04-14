import i18next from "i18next";
import { pluginConfig } from "../src/utils/plugins";

export const meta = pluginConfig.meta({
	name: "ping",
	description: i18next.t("translation:plugins.ping.description"),
	command: ["ping", "check"],
	tags: ["tools", "system"],
});

export default pluginConfig.plugin({
	async execute(sock, data, m) {
		await sock.sendMessage(
			data.info.remoteJid,
			{
				text: i18next.t("translation:plugins.ping.pong"),
			},
			{
				quoted: m,
			},
		);
	},
});
