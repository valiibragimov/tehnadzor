export const FEED_SECTIONS = {
  REGULATORY: "regulatory",
  INDUSTRY: "industry"
} as const;

export type FeedSection = (typeof FEED_SECTIONS)[keyof typeof FEED_SECTIONS];

export interface FeedItem {
  id: string;
  section: FeedSection;
  category: string;
  categoryLabel: string;
  title: string;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
  url: string;
  publishedAt: string | null;
  publishedLabel: string | null;
}

export interface FeedSource {
  id: string;
  label: string;
  status: "ok" | "error";
  itemsCount: number;
  error?: string;
}

export type FeedSectionsMap = Record<FeedSection, FeedItem[]>;

export interface ProfileFeedValue {
  generatedAt: string;
  sections: FeedSectionsMap;
  sources: FeedSource[];
}

export interface CachedProfileFeedValue extends ProfileFeedValue {
  cache: {
    hit: boolean;
    expiresAt: string;
  };
}

interface FeedAdapterPayload {
  sourceId: string;
  sourceLabel: string;
  items: FeedItem[];
}

interface FetchTextOptions {
  timeoutMs?: number;
}

interface BuildGroupedFeedParams {
  sections: FeedSectionsMap;
  sources: FeedSource[];
}

export interface ProfileFeedServiceOptions {
  cacheTtlMs: number;
  fetchTimeoutMs: number;
  itemsPerSection: number;
  userAgent: string;
}

const CURATED_REGULATORY_ITEMS: FeedItem[] = [
  {
    id: "sp-70-13330-2012",
    section: FEED_SECTIONS.REGULATORY,
    category: "code",
    categoryLabel: "СП",
    title: "СП 70.13330.2012. Несущие и ограждающие конструкции",
    summary:
      "Базовый свод правил по выполнению и приемке бетонных, железобетонных, каменных и монтажных работ.",
    sourceLabel: "ЦНТД",
    sourceUrl: "https://docs.cntd.ru/document/1200097510",
    url: "https://docs.cntd.ru/document/1200097510",
    publishedAt: null,
    publishedLabel: "2012"
  },
  {
    id: "sp-126-13330-2017",
    section: FEED_SECTIONS.REGULATORY,
    category: "code",
    categoryLabel: "СП",
    title: "СП 126.13330.2017. Геодезические работы в строительстве",
    summary:
      "Требования к геодезической разбивке, исполнительной съемке и контролю точности при строительстве.",
    sourceLabel: "ЦНТД",
    sourceUrl: "https://docs.cntd.ru/document/550965720",
    url: "https://docs.cntd.ru/document/550965720",
    publishedAt: null,
    publishedLabel: "2017"
  },
  {
    id: "gost-r-58945-2020",
    section: FEED_SECTIONS.REGULATORY,
    category: "standard",
    categoryLabel: "ГОСТ",
    title: "ГОСТ Р 58945-2020. Параметры зданий и сооружений",
    summary:
      "Норматив по обеспечению точности геометрических параметров зданий и сооружений при строительном контроле.",
    sourceLabel: "ЦНТД",
    sourceUrl: "https://docs.cntd.ru/document/1200174486",
    url: "https://docs.cntd.ru/document/1200174486",
    publishedAt: null,
    publishedLabel: "2020"
  },
  {
    id: "gost-r-57997-2017",
    section: FEED_SECTIONS.REGULATORY,
    category: "standard",
    categoryLabel: "ГОСТ",
    title: "ГОСТ Р 57997-2017. Арматурные и закладные изделия",
    summary:
      "Требования к арматурным и закладным изделиям, сварным и вязаным соединениям для железобетонных конструкций.",
    sourceLabel: "ЦНТД",
    sourceUrl: "https://docs.cntd.ru/document/1200157630",
    url: "https://docs.cntd.ru/document/1200157630",
    publishedAt: null,
    publishedLabel: "2017"
  },
  {
    id: "gost-18105-2018",
    section: FEED_SECTIONS.REGULATORY,
    category: "standard",
    categoryLabel: "ГОСТ",
    title: "ГОСТ 18105-2018. Бетоны. Правила контроля и оценки прочности",
    summary:
      "Правила контроля прочности бетона и оценки результатов испытаний на строительной площадке и в лаборатории.",
    sourceLabel: "ЦНТД",
    sourceUrl: "https://docs.cntd.ru/document/1200164028",
    url: "https://docs.cntd.ru/document/1200164028",
    publishedAt: null,
    publishedLabel: "2018"
  }
];

const CURATED_INDUSTRY_FALLBACK_ITEMS: FeedItem[] = [
  {
    id: "industry-fallback-gge-services",
    section: FEED_SECTIONS.INDUSTRY,
    category: "service",
    categoryLabel: "Сервис",
    title: "Главгосэкспертиза России: ключевые сервисы и отраслевые материалы",
    summary:
      "Официальные материалы и сервисы Главгосэкспертизы по экспертизе, ценообразованию и сопровождению строительных проектов.",
    sourceLabel: "Главгосэкспертиза России",
    sourceUrl: "https://gge.ru/",
    url: "https://gge.ru/",
    publishedAt: null,
    publishedLabel: "Официальный источник"
  },
  {
    id: "industry-fallback-minstroy-docs",
    section: FEED_SECTIONS.INDUSTRY,
    category: "policy",
    categoryLabel: "Минстрой",
    title: "Минстрой России: документы и официальные публикации",
    summary:
      "Подборка официальных материалов Минстроя России по отраслевой политике, регулированию и строительному комплексу.",
    sourceLabel: "Минстрой России",
    sourceUrl: "https://minstroyrf.gov.ru/docs/",
    url: "https://minstroyrf.gov.ru/docs/",
    publishedAt: null,
    publishedLabel: "Официальный источник"
  }
];

function isFeedSection(value: string): value is FeedSection {
  return value === FEED_SECTIONS.REGULATORY || value === FEED_SECTIONS.INDUSTRY;
}

function decodeHtmlEntities(value: string | null | undefined): string {
  const text = String(value || "");
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (fullMatch, entity: string) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized.startsWith("#x")) {
      const code = parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : fullMatch;
    }
    if (normalized.startsWith("#")) {
      const code = parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : fullMatch;
    }
    return namedEntities[normalized] || fullMatch;
  });
}

function stripHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPlainText(value: string | null | undefined): string {
  return stripHtml(decodeHtmlEntities(value));
}

function truncateText(value: string | null | undefined, maxLength = 180): string {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function ensureAbsoluteUrl(url: string | null | undefined, baseUrl = ""): string {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

function parseDateToIso(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function makeFeedItemId(prefix: string, value: string | null | undefined): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${normalized || Date.now()}`;
}

function extractTagValue(xmlBlock: string | null | undefined, tagName: string): string {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = String(xmlBlock || "").match(pattern);
  if (!match) return "";
  return match[1].trim();
}

function parseRssItems(xml: string | null | undefined): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
}> {
  const normalizedXml = String(xml || "");
  const blocks = normalizedXml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks.map((block) => ({
    title: toPlainText(extractTagValue(block, "title")),
    link: toPlainText(extractTagValue(block, "link")),
    description: toPlainText(extractTagValue(block, "description")),
    pubDate: toPlainText(extractTagValue(block, "pubDate"))
  }));
}

function sortFeedItems(items: FeedItem[], section: FeedSection): FeedItem[] {
  const list = [...items];
  if (section === FEED_SECTIONS.REGULATORY) {
    return list;
  }

  return list.sort((left, right) => {
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
    return rightTime - leftTime;
  });
}

function dedupeFeedItems(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.url}::${item.section}`;
    if (!item.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function curatedRegulatoryAdapter(): Promise<FeedAdapterPayload> {
  return {
    sourceId: "curated-regulatory",
    sourceLabel: "Curated Regulatory Documents",
    items: CURATED_REGULATORY_ITEMS
  };
}

function buildGroupedFeed(
  { sections, sources }: BuildGroupedFeedParams,
  itemsPerSection: number
): ProfileFeedValue {
  const regulatory = dedupeFeedItems(
    sortFeedItems(sections[FEED_SECTIONS.REGULATORY], FEED_SECTIONS.REGULATORY)
  ).slice(0, itemsPerSection);
  const industryRaw = dedupeFeedItems(
    sortFeedItems(sections[FEED_SECTIONS.INDUSTRY], FEED_SECTIONS.INDUSTRY)
  );
  const industry =
    industryRaw.length > 0
      ? industryRaw.slice(0, itemsPerSection)
      : CURATED_INDUSTRY_FALLBACK_ITEMS.slice(0, itemsPerSection);

  const nowIso = new Date().toISOString();

  return {
    generatedAt: nowIso,
    sections: {
      [FEED_SECTIONS.REGULATORY]: regulatory,
      [FEED_SECTIONS.INDUSTRY]: industry
    },
    sources
  };
}

export function createProfileFeedService(options: ProfileFeedServiceOptions) {
  const liveFeedCache: {
    value: ProfileFeedValue | null;
    expiresAt: number;
    pending: Promise<CachedProfileFeedValue> | null;
  } = {
    value: null,
    expiresAt: 0,
    pending: null
  };

  async function fetchText(
    url: string,
    { timeoutMs = options.fetchTimeoutMs }: FetchTextOptions = {}
  ): Promise<string> {
    if (typeof fetch !== "function") {
      throw new Error("Global fetch is not available in this Node runtime.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": options.userAgent,
          Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8"
        }
      });

      if (!response.ok) {
        throw new Error(`Source returned HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Source timeout after ${timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function ggeIndustryRssAdapter(): Promise<FeedAdapterPayload> {
    const sourceUrl = "https://gge.ru/press-center/rss/";
    const xml = await fetchText(sourceUrl);
    const parsedItems = parseRssItems(xml)
      .filter((item) => item.title && item.link)
      .slice(0, options.itemsPerSection * 2)
      .map((item, index): FeedItem => ({
        id: makeFeedItemId("gge", item.link || `${item.title}-${index}`),
        section: FEED_SECTIONS.INDUSTRY,
        category: "industry",
        categoryLabel: "Отраслевое",
        title: item.title,
        summary: truncateText(
          item.description ||
            "Актуальная публикация Главгосэкспертизы России по строительной отрасли и смежным практикам.",
          220
        ),
        sourceLabel: "Главгосэкспертиза России",
        sourceUrl,
        url: ensureAbsoluteUrl(item.link, "https://gge.ru"),
        publishedAt: parseDateToIso(item.pubDate),
        publishedLabel: null
      }));

    return {
      sourceId: "gge-rss",
      sourceLabel: "Главгосэкспертиза России RSS",
      items: parsedItems
    };
  }

  async function loadFreshProfileFeed(): Promise<ProfileFeedValue> {
    const sections: FeedSectionsMap = {
      [FEED_SECTIONS.REGULATORY]: [],
      [FEED_SECTIONS.INDUSTRY]: []
    };
    const sources: FeedSource[] = [];

    const adapters: Array<() => Promise<FeedAdapterPayload>> = [curatedRegulatoryAdapter, ggeIndustryRssAdapter];
    const results = await Promise.allSettled(adapters.map((adapter) => adapter()));

    results.forEach((result, index) => {
      const adapterName = index === 0 ? "curated-regulatory" : "gge-rss";

      if (result.status === "fulfilled") {
        const payload = result.value;
        payload.items.forEach((item) => {
          if (!isFeedSection(item.section)) return;
          sections[item.section].push(item);
        });
        sources.push({
          id: payload.sourceId || adapterName,
          label: payload.sourceLabel || adapterName,
          status: "ok",
          itemsCount: payload.items.length
        });
        return;
      }

      const errorMessage =
        result.reason instanceof Error ? result.reason.message : "Source unavailable";

      sources.push({
        id: adapterName,
        label: adapterName,
        status: "error",
        itemsCount: 0,
        error: errorMessage
      });
    });

    return buildGroupedFeed(
      {
        sections,
        sources
      },
      options.itemsPerSection
    );
  }

  async function getProfileFeed(): Promise<CachedProfileFeedValue> {
    const now = Date.now();
    if (liveFeedCache.value && liveFeedCache.expiresAt > now) {
      return {
        ...liveFeedCache.value,
        cache: {
          hit: true,
          expiresAt: new Date(liveFeedCache.expiresAt).toISOString()
        }
      };
    }

    if (liveFeedCache.pending) {
      return liveFeedCache.pending;
    }

    liveFeedCache.pending = loadFreshProfileFeed()
      .then((value) => {
        liveFeedCache.value = value;
        liveFeedCache.expiresAt = Date.now() + options.cacheTtlMs;
        return {
          ...value,
          cache: {
            hit: false,
            expiresAt: new Date(liveFeedCache.expiresAt).toISOString()
          }
        };
      })
      .finally(() => {
        liveFeedCache.pending = null;
      });

    return liveFeedCache.pending;
  }

  return {
    getProfileFeed
  };
}
