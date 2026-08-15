/**
 * Abstraction over lexical and hybrid search.
 * Public APIs call this layer so semantic search can be enabled via env without route changes.
 */
import { env } from '../../../config/env';
import {
  hybridSearchService,
  type HybridSearchHit,
  type SearchInspectorHit,
  type SearchInspectorResult,
} from './hybrid-search.service';

export type { HybridSearchHit, SearchInspectorHit, SearchInspectorResult };
export type SearchEngineMode = 'lexical' | 'hybrid';

export const placesSearchEngine = {
  mode(): SearchEngineMode {
    return env.hybridSearchEnabled ? 'hybrid' : 'lexical';
  },

  async search(q: string, limit = 20): Promise<HybridSearchHit[]> {
    return hybridSearchService.search(q, limit);
  },

  async inspect(q: string, limit = 20): Promise<SearchInspectorResult> {
    return hybridSearchService.inspect(q, limit);
  },
};
