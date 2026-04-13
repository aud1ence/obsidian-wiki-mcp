import { registerWikiInit } from "./wiki_init.js";
import { registerWikiIngest } from "./wiki_ingest.js";
import { registerWikiWritePage } from "./wiki_write_page.js";
import { registerWikiQuery } from "./wiki_query.js";
import { registerWikiReadPage } from "./wiki_read_page.js";
import { registerWikiLintScan } from "./wiki_lint_scan.js";
import { registerWikiApplyFix } from "./wiki_apply_fix.js";
import { registerWikiReindex } from "./wiki_reindex.js";
import { registerWikiImport } from "./wiki_import.js";
export function registerTools(server, ctx) {
    registerWikiInit(server, ctx);
    registerWikiIngest(server, ctx);
    registerWikiWritePage(server, ctx);
    registerWikiQuery(server, ctx);
    registerWikiReadPage(server, ctx);
    registerWikiLintScan(server, ctx);
    registerWikiApplyFix(server, ctx);
    registerWikiReindex(server, ctx);
    registerWikiImport(server, ctx);
}
//# sourceMappingURL=index.js.map