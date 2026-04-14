import type { PluginConfig, PluginInstance, PluginMeta } from "./types";

export class PluginManager {
	private plugins = new Map<string, PluginInstance>();
	private commandIndex = new Map<string, string>();

	constructor(
		private ttl = 60_000,
		private maxCache = 30,
	) {}

	register(meta: PluginMeta | PluginConfig) {
		if ("execute" in meta) {
			this.plugins.set(meta.name, {
				profile: {
					name: meta.name,
					source: {
						type: "memory",
						instance: meta,
					},
				},
				instance: null,
				lastUsed: 0,
			});

			for (const cmd of meta.command) {
				this.commandIndex.set(cmd, meta.name);
			}
		} else {
			this.plugins.set(meta.name, {
				profile: {
					name: meta.name,
					source: {
						type: "file",
						path: meta.path,
					},
				},
				instance: null,
				lastUsed: 0,
			});

			for (const cmd of meta.command) {
				this.commandIndex.set(cmd, meta.name);
			}
		}
	}

	async getByCommand(command: string): Promise<PluginConfig | null> {
		const name = this.commandIndex.get(command);
		if (!name) return null;

		return this.load(name);
	}

	private async load(name: string): Promise<PluginConfig> {
		const entry = this.plugins.get(name)!;
		entry.lastUsed = Date.now();

		if (entry.instance) return entry.instance;

		if (!entry.loading) {
			entry.loading = (async () => {
				const source = entry.profile.source
				if (source.type === "file") {
					const mod = await import(source.path);
					entry.instance = mod.default || mod;
					return entry.instance!;
				} else if (source.type === "memory") {
					entry.instance = source.instance;
					return entry.instance!;
				} else {
					throw new Error("Unknown plugin source");
				}
			})();
		}

		const result = await entry.loading;

		this.evict();

		return result;
	}

	cleanup() {
		const now = Date.now();

		for (const entry of this.plugins.values()) {
			if (entry.instance && now - entry.lastUsed > this.ttl) {
				entry.instance = null;
			}
		}
	}

	private evict() {
		const active = [...this.plugins.values()].filter((p) => p.instance);

		if (active.length <= this.maxCache) return;

		active.sort((a, b) => a.lastUsed - b.lastUsed);

		for (let i = 0; i < active.length - this.maxCache; i++) {
			active[i]!.instance = null;
		}
	}
}
