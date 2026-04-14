import { readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { Searcher } from "fast-fuzzy";
import i18next from "i18next";
import { appConfig } from "../../configs/app";
import { ENV } from "../../configs/env";
import { logger } from "../../infra/logger";
import type { ParseResult, PluginConfig, PluginMeta } from "./types";

export const pluginConfig = {
	meta: (meta: Omit<PluginMeta, "path">): Omit<PluginMeta, "path"> => ({
		...meta,
		permission: {
			admin: false,
		},
	}),
	plugin: <P = { execute: PluginConfig["execute"] }>(plugin: P): P => plugin,
};
const ext = ENV.NODE_ENV === "production" ? [".js"] : [".ts"];

export function systemPlugins(plugins: PluginMeta[]): {
	plugin: PluginConfig[],
	meta: PluginMeta[]
}{
	const meta: PluginMeta[] = [
		{
			path: "",
			name: "Menu",
			tags: ["system"],
			command: ["menu"],
			description: i18next.t("translation:plugins.system.menu.description"),
			args: ["list", "tags1,tags2"],
		},
	];
	const plugin: PluginConfig[] = [
		{
			name: "Menu",
			tags: ["system"],
			command: ["menu"],
			description: i18next.t("translation:plugins.system.menu.description"),
			args: ["list", "tags1,tags2"],
			async execute(sock, { info }, m) {
				// 1. Gabungkan TANPA duplication
				const allPlugins = plugins.concat(meta);

				// 2. Flatten TANPA clone object besar
				const pluginsAll: {
					nameC: string;
					plugin: PluginMeta;
				}[] = [];

				for (const p of allPlugins) {
					for (const c of p.command) {
						pluginsAll.push({
							nameC: c,
							plugin: p,
						});
					}
				}

				// 3. Group by tag (O(n), TANPA filter berulang)
				const tagMap = new Map<string, typeof pluginsAll>();

				for (const item of pluginsAll) {
					for (const tag of item.plugin.tags) {
						if (!tagMap.has(tag)) {
							tagMap.set(tag, []);
						}
						tagMap.get(tag)?.push(item);
					}
				}

				// 4. Build output TANPA banyak temporary array
				const commandList: string[] = [];

				for (const [tag, items] of tagMap) {
					const head = i18next.t(
						"translation:plugins.system.menu.commandHead",
						{
							tag,
						},
					);

					let body = "";

					for (const { nameC, plugin } of items) {
						body += `${i18next.t(
							"translation:plugins.system.menu.commandBody",
							{
								prefix: appConfig.settings.prefix,
								command: plugin.permission?.admin ? `*${nameC}*` : nameC,
								args: plugin.args?.join(" ") ?? "",
							},
						)}\n`;
					}

					const foot = i18next.t("translation:plugins.system.menu.commandFoot");

					commandList.push(`${head}\n${body}${foot}`);
				}

				await sock.sendMessage(
					info.remoteJid,
					{ text: commandList.join("\n\n") },
					{ quoted: m },
				);
			},
		},
	];
	return {
		meta,
		plugin
	}
}

export async function loadPluginMeta(dir: string) {
	const results: PluginMeta[] = [];
	const queue = [dir];

	while (queue.length) {
		const current = queue.pop()!;
		const files = await readdir(current, { withFileTypes: true });

		for (const file of files) {
			const full = resolve(current, file.name);

			if (file.isDirectory()) {
				queue.push(full);
				continue;
			}

			if (!ext.includes(extname(full))) continue;

			const mod = await import(full);
			const meta = mod.meta;

			if (!meta) {
				logger.error(`Plugins missing meta: ${full}`);
			}
			results.push({
				name: file.name,
				path: full,
				command: meta?.command || [],
				tags: meta?.tags || [],
				description: meta?.description || "",
				args: meta?.args,
				permission: meta?.permission,
			});
		}
	}

	return results;
}

function normalize(input: string) {
	const prefix = appConfig.settings.prefix;
	if (input.startsWith(prefix)) {
		return input.slice(prefix.length).trim().toLowerCase();
	}
	return input.trim().toLowerCase();
}

export function createPluginParser(metas: PluginMeta[]) {
	const commandToPlugin = new Map<string, string>();
	const commands: string[] = [];

	for (const meta of metas) {
		for (const cmd of meta.command) {
			commandToPlugin.set(cmd, meta.name);
			commands.push(cmd);
		}
	}

	const searcher = new Searcher(commands, {
		returnMatchData: true,
	});

	return function parse(text: string): ParseResult {
		const input = normalize(text);

		const exact = commandToPlugin.get(input);
		if (exact) {
			return { type: "exact", command: input };
		}

		const result = searcher.search(input)[0];

		if (result && result.score >= 0.4) {
			return {
				type: "fuzzy",
				command: result.item,
				score: result.score * 100,
			};
		}

		return null;
	};
}
