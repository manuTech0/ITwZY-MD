import { readdirSync, statSync } from "node:fs";
import type { ParseResult, PluginConfig } from "./types";
import { extname, resolve } from "node:path";
import { ENV } from "../../configs/env";
import { appConfig } from "../../configs/app";
import { Searcher } from "fast-fuzzy";

export const pluginConfig = (config: PluginConfig): PluginConfig => ({
  ...config,
  permission: {
    admin: false
  },
})

const ext = ENV.NODE_ENV === "production" ? [".js"] : [".ts"]

export async function loadPlugins(dir: string) {
  const results: PluginConfig[] = []
  
  async function scan(current: string) {
    const files = readdirSync(current)
    for (const file of files) {
      const full = resolve(current, file)
      if(statSync(full).isDirectory()) {
        await scan(full)
      } else if(ext.includes(extname(full))) {        
        const plugin = await import(full)
        results.push(plugin.default || plugin)
      }
    }
  }
  await scan(dir)
  return results
}
function normalize(input: string) {
  const prefix = appConfig.settings.prefix
  if (input.startsWith(prefix)) {
    return input.slice(prefix.length).trim().toLowerCase()
  }
  return input.trim().toLowerCase()
}


export function createPluginParser(plugins: PluginConfig[]) {
  const map = new Map<string, PluginConfig>()

  const list: string[] = []

  for (const p of plugins) {
    // command string
    if (typeof p.command === "string") {
      map.set(p.command, p)
      list.push(p.command)
    }

    // aliases string
    for (const a of p.aliases || []) {
      if (typeof a === "string") {
        map.set(a, p)
        list.push(a)
      }
    }
  }

  const searcher = new Searcher(list, {
    returnMatchData: true
  })

  // return parser
  return function parse(text: string): ParseResult {
    const input = normalize(text)

    // 1. exact (string command)
    const exact = map.get(input)
    if (exact) {
      return { type: "exact", plugin: exact }
    }

    // 2. regex (command + aliases)
    for (const p of plugins) {
      // command regex
      if (p.command instanceof RegExp) {
        const match = input.match(p.command)
        if (match) {
          return { type: "regex", plugin: p, match }
        }
      }

      // alias regex
      for (const a of p.aliases || []) {
        if (a instanceof RegExp) {
          const match = input.match(a)
          if (match) {
            return { type: "regex", plugin: p, match }
          }
        }
      }
    }

    // 3. fuzzy
    const result = searcher.search(input)[0]

    if (result && result.score >= 0.4) {
      return {
        type: "fuzzy",
        plugin: map.get(result.item)!,
        score: result.score * 100
      }
    }

    return null
  }
}
