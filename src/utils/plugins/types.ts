import type { WAMessage } from "@whiskeysockets/baileys";
import type { MakeWASocket } from "../../types/baileys";
import type { ParsedMessage } from "../parseMessage";

export type ParseResult =
  | { type: "exact"; plugin: PluginConfig }
  | { type: "regex"; plugin: PluginConfig; match: RegExpMatchArray }
  | { type: "fuzzy"; plugin: PluginConfig; score: number }
  | null

export interface PluginConfig {
	execute: (sock: MakeWASocket, data: ParsedMessage, m: WAMessage) => Promise<void>;
	command: string | RegExp;
	name: string;
	aliases?: string[] | RegExp[]
	tags: string[];
	description: string;
  permission?: {
    admin: boolean;
  }
}

