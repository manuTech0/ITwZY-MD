import i18next from "i18next";
import { pluginConfig } from "../src/utils/plugins";

export default pluginConfig({
  name: "ping",
  description: i18next.t("translation:plugins.ping.description"),
  command: "ping",
  tags: ["tools"],
  async execute(sock, data, m) {
    await sock.sendMessage(data.remoteJid, {
      text: i18next.t("translation:plugins.ping.pong")
    }, { 
      quoted: m
    })
  },
})
