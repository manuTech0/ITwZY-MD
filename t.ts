import { initi18n } from "./src/utils/i18n";
import { loadPlugins } from "./src/utils/plugins";
await initi18n()
console.log(await loadPlugins("plugins"))
