import type { WAMessage } from "@whiskeysockets/baileys";
import type { MakeWASocket } from "../../types/baileys";
import type { ParsedMessage } from "../parseMessage";

export type ParseResult =
	| { type: "exact"; command: string }
	| { type: "fuzzy"; command: string; score: number }
	| null;

export interface Permission {
	admin: boolean;
}

export interface ExecuteData {
	info: ParsedMessage;
	args: string[];
}

export interface PluginConfig {
	execute: (
		sock: MakeWASocket,
		data: ExecuteData,
		m: WAMessage,
	) => Promise<void>;

	command: string[];
	name: string;
	args?: string[];
	tags: string[];
	description: string;
	permission?: Permission;
}

export type PluginMeta = {
	name: string;
	path: string;
	command: string[];
	tags: string[];
	description: string;
	args?: string[];
	permission?: Permission;
};

export type PluginSource =
	| { type: "file"; path: string }
	| { type: "memory"; instance: PluginConfig };

export interface PluginInstance {
	profile: {
		name: string;
		source: PluginSource;
	};
	instance: PluginConfig | null;
	lastUsed: number;
	loading?: Promise<PluginConfig>;
}
