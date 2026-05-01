import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "dist", "profile-feed.json");

const PROFILE_FEED_CACHE_TTL_MS = 15 * 60 * 1000;
const PROFILE_FEED_FETCH_TIMEOUT_MS = 8000;
const PROFILE_FEED_ITEMS_PER_SECTION = 6;

const FEED_SECTIONS = {
  REGULATORY: "regulatory",
  INDUSTRY: "industry"
};

const CURATED_REGULATORY_ITEMS = [
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

const CURATED_INDUSTRY_FALLBACK_ITEMS = [
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

function decodeHtmlEntities(value) {
  const text = String(value || "");
  const namedEntities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized.startsWith("#x")) {
      const code = parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    if (normalized.startsWith("#")) {
      const code = parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    return namedEntities[normalized] || _;
  });
}

function stripHtml(value) {
  const source = String(value || "");
  let output = "";
  let inTag = false;
  let tagName = "";
  let readingTagName = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inTag) {
      if (readingTagName && isAsciiAlphaNumeric(char)) {
        tagName += char.toLowerCase();
        continue;
      }
      readingTagName = false;
      if (char === ">") {
        if (tagName === "br" || tagName === "p" || tagName === "div" || tagName === "li") {
          output += " ";
        }
        inTag = false;
        tagName = "";
      }
      continue;
    }

    if (char === "<") {
      inTag = true;
      tagName = "";
      const next = source[index + 1] || "";
      readingTagName = next !== "/" && next !== "!" && next !== "?";
      continue;
    }

    output += char;
  }

  return output.replace(/\s+/g, " ").trim();
}

function isAsciiAlphaNumeric(char) {
  const code = String(char || "").charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function toPlainText(value) {
  return decodeHtmlEntities(stripHtml(value || ""));
}

function truncateText(value, maxLength = 180) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function ensureAbsoluteUrl(url, baseUrl = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

function parseDateToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function makeFeedItemId(prefix, value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${normalized || Date.now()}`;
}

async function fetchText(url, timeoutMs = PROFILE_FEED_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "TechNadzorOnline/1.0 (+static-feed-builder)",
        Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`Source returned HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Source timeout after ${timeoutMs} ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractTagValue(xmlBlock, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = String(xmlBlock || "").match(pattern);
  return match ? match[1].trim() : "";
}

function parseRssItems(xml) {
  const normalizedXml = String(xml || "");
  const blocks = normalizedXml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => ({
    title: toPlainText(extractTagValue(block, "title")),
    link: toPlainText(extractTagValue(block, "link")),
    description: toPlainText(extractTagValue(block, "description")),
    pubDate: toPlainText(extractTagValue(block, "pubDate"))
  }));
}

function sortFeedItems(items, section) {
  const list = Array.isArray(items) ? [...items] : [];
  if (section === FEED_SECTIONS.REGULATORY) return list;
  return list.sort((left, right) => {
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
    return rightTime - leftTime;
  });
}

function dedupeFeedItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = `${item.url}::${item.section}`;
    if (!item.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function curatedRegulatoryAdapter() {
  return {
    sourceId: "curated-regulatory",
    sourceLabel: "Curated Regulatory Documents",
    items: CURATED_REGULATORY_ITEMS
  };
}

async function ggeIndustryRssAdapter() {
  const sourceUrl = "https://gge.ru/press-center/rss/";
  const xml = await fetchText(sourceUrl);
  const items = parseRssItems(xml)
    .filter((item) => item.title && item.link)
    .slice(0, PROFILE_FEED_ITEMS_PER_SECTION * 2)
    .map((item, index) => ({
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
    items
  };
}

function buildGroupedFeed({ sections, sources }) {
  const regulatory = dedupeFeedItems(sortFeedItems(sections[FEED_SECTIONS.REGULATORY], FEED_SECTIONS.REGULATORY))
    .slice(0, PROFILE_FEED_ITEMS_PER_SECTION);
  const industryRaw = dedupeFeedItems(sortFeedItems(sections[FEED_SECTIONS.INDUSTRY], FEED_SECTIONS.INDUSTRY));
  const industry =
    industryRaw.length > 0
      ? industryRaw.slice(0, PROFILE_FEED_ITEMS_PER_SECTION)
      : CURATED_INDUSTRY_FALLBACK_ITEMS.slice(0, PROFILE_FEED_ITEMS_PER_SECTION);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    ttlMs: PROFILE_FEED_CACHE_TTL_MS,
    sections: {
      [FEED_SECTIONS.REGULATORY]: regulatory,
      [FEED_SECTIONS.INDUSTRY]: industry
    },
    sources
  };
}

async function buildProfileFeed() {
  const sections = {
    [FEED_SECTIONS.REGULATORY]: [],
    [FEED_SECTIONS.INDUSTRY]: []
  };
  const sources = [];
  const adapters = [curatedRegulatoryAdapter, ggeIndustryRssAdapter];
  const results = await Promise.allSettled(adapters.map((adapter) => adapter()));

  results.forEach((result, index) => {
    const adapterName = index === 0 ? "curated-regulatory" : "gge-rss";

    if (result.status === "fulfilled") {
      const payload = result.value || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      items.forEach((item) => {
        if (!item || !item.section || !sections[item.section]) return;
        sections[item.section].push(item);
      });
      sources.push({
        id: payload.sourceId || adapterName,
        label: payload.sourceLabel || adapterName,
        status: "ok",
        itemsCount: items.length
      });
      return;
    }

    sources.push({
      id: adapterName,
      label: adapterName,
      status: "error",
      itemsCount: 0,
      error: result.reason?.message || "Source unavailable"
    });
  });

  return buildGroupedFeed({ sections, sources });
}

const feed = await buildProfileFeed();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");

console.log(`profile-feed.json updated: ${outputPath}`);
console.log(
  JSON.stringify(
    {
      regulatory: feed.sections.regulatory.length,
      industry: feed.sections.industry.length,
      sources: feed.sources
    },
    null,
    2
  )
);
