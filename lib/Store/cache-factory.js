import NodeCache from "@cacheable/node-cache";
import { DEFAULT_CACHE_TTLS } from "../Defaults/index.js";

/** 
 * Default cache for group metadata.
 * Exported so users can manually manage it:
 * import { groupMetadataCache } from '@sgintokic/baileys'
 */
export const groupMetadataCache = new NodeCache({ 
    stdTTL: DEFAULT_CACHE_TTLS.GROUP_METADATA, 
    useClones: false 
});

/**
 * Default cache for profile picture URLs.
 */
export const profilePictureCache = new NodeCache({ 
    stdTTL: 300, 
    useClones: false 
});
