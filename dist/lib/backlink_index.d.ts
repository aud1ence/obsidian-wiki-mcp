export interface BacklinkIndex {
    /** page A → set of pages that link TO A */
    backlinks: Map<string, Set<string>>;
    /** page A → set of pages that A links TO */
    forwardLinks: Map<string, Set<string>>;
    getAllTargets(): Set<string>;
    getBacklinks(pagePath: string): string[];
    addPage(pageRelPath: string, content: string): void;
    removePage(pageRelPath: string): void;
}
/** Extract [[wikilinks]] từ content */
export declare function extractWikiLinks(content: string): string[];
export declare function buildBacklinkIndex(vaultPath: string): Promise<BacklinkIndex>;
