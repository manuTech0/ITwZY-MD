import { initi18n } from "./src/utils/i18n";
import { loadPlugins } from "./src/utils/plugins";

await initi18n();
const _plugins = await loadPlugins("plugins");
