import { createProfileFeedService } from "../../../src/shared/profile-feed";

const PROFILE_FEED_CACHE_TTL_MS = 15 * 60 * 1000;
const PROFILE_FEED_FETCH_TIMEOUT_MS = 8000;
const PROFILE_FEED_ITEMS_PER_SECTION = 6;
const PROFILE_FEED_USER_AGENT = "TechNadzorOnline/1.0 (+firebase-functions)";

export const { getProfileFeed } = createProfileFeedService({
  cacheTtlMs: PROFILE_FEED_CACHE_TTL_MS,
  fetchTimeoutMs: PROFILE_FEED_FETCH_TIMEOUT_MS,
  itemsPerSection: PROFILE_FEED_ITEMS_PER_SECTION,
  userAgent: PROFILE_FEED_USER_AGENT
});
