const API = "https://api.pluto.tv";
const BOOT = "https://boot.pluto.tv/v4/start";
const VOD4 = "https://service-vod.clusters.pluto.tv/v4/vod";
const STITCHER = "https://service-stitcher.clusters.pluto.tv";
const APP_VERSION = "5.100.1-a00ab03870075931f7b7df1e50eec1e31332ab4d";
const CATEGORY_PAGE_SIZE = 100;
const HOME_ITEMS = 20;
const MAX_HOME_ROWS = 12;
const MAX_SEARCH_CATEGORIES = 12;
const MAX_SEARCH_RESULTS = 60;

const BASE_HEADERS = {
  Accept: "application/json",
  Origin: "https://pluto.tv",
  Referer: "https://pluto.tv/",
  "User-Agent": "Mozilla/5.0"
};

async function getJson(url, options = {}) {
  const r = await kino.fetch(url, options);
  if (r.status === 429) throw kino.error("rate_limited", "Pluto TV está limitando las peticiones; intenta más tarde");
  if (!r.ok) throw kino.error("unavailable", "Pluto TV respondió " + r.status);
  return r.json();
}

function headers(extra = {}) {
  return { ...BASE_HEADERS, ...extra };
}

async function boot(seriesId = "") {
  const clientID =
    globalThis.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "kino-" + Date.now();

  const u = new URL(BOOT);
  u.searchParams.set("appName", "web");
  u.searchParams.set("appVersion", APP_VERSION);
  u.searchParams.set("deviceVersion", "89.0.0");
  u.searchParams.set("deviceModel", "web");
  u.searchParams.set("deviceMake", "firefox");
  u.searchParams.set("deviceType", "web");
  u.searchParams.set("clientID", clientID);
  u.searchParams.set("clientModelNumber", "1.0.0");
  u.searchParams.set("serverSideAds", "false");
  u.searchParams.set("clientTime", new Date().toISOString());
  if (seriesId) u.searchParams.set("seriesIDs", seriesId);

  return getJson(u.toString(), { headers: BASE_HEADERS });
}

async function getCategories() {
  const data = await getJson(
    API + "/v3/vod/categories?includeItems=false&deviceType=web",
    { headers: BASE_HEADERS }
  );
  return Array.isArray(data) ? data : Array.isArray(data.categories) ? data.categories : [];
}

async function getCategoryPage(categoryId, page = 1) {
  const currentPage = Math.max(1, Number(page) || 1);
  const offset = (currentPage - 1) * CATEGORY_PAGE_SIZE;
  const url = new URL(API + "/v3/vod/categories/" + encodeURIComponent(categoryId) + "/items");
  url.searchParams.set("deviceType", "web");
  url.searchParams.set("page", String(currentPage));
  url.searchParams.set("offset", String(offset));
  const data = await getJson(url.toString(), { headers: BASE_HEADERS });
  return {
    category: data,
    items: Array.isArray(data.items) ? data.items : [],
    total: Number(data.totalItemsCount || 0),
    page: Number(data.page || currentPage)
  };
}

function string(value) {
  return value == null ? "" : String(value).trim();
}

function image(item) {
  return (
    item.poster16_9?.path ||
    item.poster?.path ||
    item.featuredImage?.path ||
    (Array.isArray(item.covers) && item.covers.find(x => /347:500|2:3/.test(string(x.aspectRatio)))?.url) ||
    (Array.isArray(item.covers) && item.covers[0]?.url) ||
    undefined
  );
}

function releaseYear(item) {
  const date =
    item.clip?.originalReleaseDate ||
    item.originalReleaseDate ||
    item.releaseDate ||
    "";
  const match = String(date).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : undefined;
}

function mediaPath(item) {
  const raw =
    item.stitched?.path ||
    item.stitched?.urls?.find(x => x && x.type === "hls")?.url ||
    item.stitched?.urls?.[0]?.url ||
    "";
  if (!raw) return "";
  try {
    return new URL(raw).pathname;
  } catch (_) {
    return raw.startsWith("/") ? raw.split("?")[0] : "";
  }
}

function makeItem(item, categoryName = "") {
  const title = string(item.name || item.title);
  const type = string(item.type).toLowerCase();
  if (!title || (type !== "movie" && type !== "series")) return null;

  const id = string(item._id || item.id || item.episodeID || item.seriesID);
  if (!id) return null;

  const seriesId = string(item.seriesID || (type === "series" ? id : ""));
  const ref = JSON.stringify({
    kind: type,
    id,
    seriesId,
    path: mediaPath(item),
    title
  });

  return {
    id: "pluto-" + type + "-" + id,
    ref,
    title,
    kind: type,
    year: releaseYear(item),
    poster: image(item),
    overview: string(item.description || item.summary) || undefined,
    genres: item.genre ? [string(item.genre)] : undefined,
    runtimeMinutes: Number(item.duration) > 0 ? Math.round(Number(item.duration) / 60000) : undefined,
    badges: ["Pluto TV", categoryName].filter(Boolean).slice(0, 2)
  };
}

function categoryRef(id) {
  return "pluto-category:" + id;
}

function parseCategoryRef(ref) {
  const value = String(ref || "");
  const match = value.match(/^pluto-category:([a-f0-9]{24})$/i);
  return match ? match[1] : "";
}

function matchingCategories(categories, patterns, limit) {
  const chosen = [];
  const seen = new Set();
  for (const pattern of patterns) {
    const found = categories.find(c => pattern.test(string(c.name)) && !seen.has(string(c._id || c.id)));
    if (found) {
      const id = string(found._id || found.id);
      seen.add(id);
      chosen.push(found);
    }
  }
  if (chosen.length < limit) {
    for (const category of categories) {
      const id = string(category._id || category.id);
      if (id && !seen.has(id)) {
        seen.add(id);
        chosen.push(category);
        if (chosen.length >= limit) break;
      }
    }
  }
  return chosen.slice(0, limit);
}

const HOME_PATTERNS = [
  /^top titles$/i,
  /^trending now$/i,
  /^most popular movies$/i,
  /^top tv series$/i,
  /^new movies this month$/i,
  /recently added tv series/i,
  /movies in spanish|pel[ií]culas en espa[nñ]ol/i,
  /pluto tv in spanish/i,
  /^anime all day$/i,
  /^anime movies$/i,
  /featured action movies/i,
  /featured horror movies/i
];

const SEARCH_PATTERNS = [
  /^top titles$/i,
  /^trending now$/i,
  /^most popular movies$/i,
  /^top tv series$/i,
  /^new movies this month$/i,
  /recently added tv series/i,
  /movies in spanish|pel[ií]culas en espa[nñ]ol/i,
  /pluto tv in spanish/i,
  /^anime all day$/i,
  /^anime shows$/i,
  /^anime movies$/i,
  /featured action movies/i,
  /featured horror movies/i,
  /featured thriller movies/i,
  /featured tv dramas/i,
  /classic comedy movies/i,
  /featured family movies/i,
  /classic tv/i,
  /featured reality tv/i,
  /comed(y|ies)/i
];

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryMatches(item, query) {
  const title = normalize(item.title);
  const phrase = normalize(query);
  if (!phrase) return false;
  if (title.includes(phrase)) return true;
  const words = phrase.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every(word => title.includes(word));
}

export async function home() {
  const categories = await getCategories();
  const selected = matchingCategories(categories, HOME_PATTERNS, MAX_HOME_ROWS);
  const rows = [];

  const pages = await Promise.all(selected.map(async category => {
    const id = string(category._id || category.id);
    if (!id) return null;
    try {
      return { category, id, page: await getCategoryPage(id, 1) };
    } catch (_) {
      // A failed Pluto category should not prevent other Home rows from loading.
      return null;
    }
  }));

  for (const result of pages) {
    if (!result) continue;
    const { category, id, page } = result;
    const items = page.items
      .map(item => makeItem(item, string(category.name)))
      .filter(Boolean)
      .slice(0, HOME_ITEMS);
    if (items.length) {
      rows.push({
        id: "pluto-row-" + id,
        title: string(category.name) || "Pluto TV",
        ref: categoryRef(id),
        items
      });
    }
  }
  return rows;
}

export async function browse(ref, cursor) {
  const categoryId = parseCategoryRef(ref);
  if (!categoryId) throw kino.error("not_found", "No se encontró esa categoría de Pluto TV");
  const pageNumber = Math.max(1, Number(cursor) || 1);
  const result = await getCategoryPage(categoryId, pageNumber);
  const items = result.items.map(item => makeItem(item, string(result.category.name))).filter(Boolean);
  const hasMore = result.total > 0
    ? result.total > pageNumber * CATEGORY_PAGE_SIZE
    : result.items.length >= CATEGORY_PAGE_SIZE;
  const next = hasMore ? String(pageNumber + 1) : undefined;
  return { items, next };
}

export async function search(query) {
  const primary = string(query && query.q);
  if (primary.length < 2) return [];

  // Pluto exposes no confirmed global VOD search endpoint. Search a bounded set of
  // curated shelves in parallel; this is useful but is not a full-catalogue search.
  const phrases = [primary, string(query && query.originalTitle), ...(Array.isArray(query && query.altTitles) ? query.altTitles : [])]
    .map(string)
    .filter((phrase, index, all) => phrase.length >= 2 && all.indexOf(phrase) === index);
  const categories = await getCategories();
  const selected = matchingCategories(categories, SEARCH_PATTERNS, MAX_SEARCH_CATEGORIES);
  const pages = await Promise.all(selected.map(async category => {
    const id = string(category._id || category.id);
    if (!id) return null;
    try {
      return { category, page: await getCategoryPage(id, 1) };
    } catch (_) {
      return null;
    }
  }));

  const results = [];
  const seen = new Set();
  for (const result of pages) {
    if (!result) continue;
    for (const source of result.page.items) {
      const item = makeItem(source, string(result.category.name));
      if (!item || !phrases.some(phrase => queryMatches(item, phrase)) || seen.has(item.id)) continue;
      seen.add(item.id);
      results.push(item);
      if (results.length >= MAX_SEARCH_RESULTS) return results;
    }
  }
  // Kino treats type as a hint, not a hard filter. Prefer its requested kind without
  // discarding the other plausible matches.
  const wantedType = string(query && query.type).toLowerCase();
  if (wantedType === "movie" || wantedType === "series") {
    results.sort((a, b) => Number(b.kind === wantedType) - Number(a.kind === wantedType));
  }
  return results;
}

function parseRef(ref) {
  try {
    const value = JSON.parse(String(ref));
    if (value && typeof value === "object") return value;
  } catch (_) {}
  return { kind: "series", id: String(ref), seriesId: String(ref) };
}

export async function episodes(ref) {
  const seriesRef = parseRef(ref);
  const seriesId = string(seriesRef.seriesId || seriesRef.id);
  if (!seriesId) throw kino.error("not_found", "No se encontró la serie en Pluto TV");

  const session = await boot(seriesId);
  const url = VOD4 + "/series/" + encodeURIComponent(seriesId) + "/seasons?offset=0&page=0";
  const data = await getJson(url, {
    headers: headers({ Authorization: "Bearer " + session.sessionToken })
  });
  const seasons = Array.isArray(data) ? data : Array.isArray(data.seasons) ? data.seasons : [];
  const result = [];

  for (const season of seasons) {
    const seasonNumber = Number(season.number || season.seasonNumber || 1);
    const list = Array.isArray(season.episodes) ? season.episodes : [];
    for (let i = 0; i < list.length; i++) {
      const episode = list[i];
      const id = string(episode._id || episode.id || episode.episodeID);
      if (!id) continue;
      const number = Number(episode.number || episode.episodeNumber || i + 1);
      result.push({
        season: seasonNumber > 0 ? seasonNumber : 1,
        number,
        ref: JSON.stringify({
          kind: "episode",
          id,
          seriesId,
          path: mediaPath(episode),
          title: string(episode.name || episode.title)
        }),
        title: string(episode.name || episode.title) || "Episodio " + number,
        overview: string(episode.description || episode.summary) || undefined,
        still: image(episode),
        airDate: episode.originalReleaseDate ? String(episode.originalReleaseDate).slice(0, 10) : undefined,
        runtimeMinutes: Number(episode.duration) > 0 ? Math.round(Number(episode.duration) / 60000) : undefined
      });
    }
  }

  return {
    series: {
      title: string(seriesRef.title) || "Serie de Pluto TV",
      year: seriesRef.year
    },
    episodes: result
  };
}

export async function resolve(ref) {
  const media = parseRef(ref);
  const id = string(media.id);
  const path = string(media.path) || (id ? "/stitch/hls/episode/" + encodeURIComponent(id) + "/master.m3u8" : "");
  if (!path) throw kino.error("not_found", "Pluto TV no devolvió la ruta del video");

  const session = await boot(string(media.seriesId));
  if (!session.stitcherParams) throw kino.error("unavailable", "Pluto TV no devolvió los parámetros de reproducción");
  const params = String(session.stitcherParams).replace(/^\?/, "");
  const url = STITCHER + path + (path.includes("?") ? "&" : "?") + params;

  return {
    url,
    // Let Kino detect HLS from the playlist instead of returning a non-contract MIME value.
    headers: {
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/",
      "User-Agent": "Mozilla/5.0"
    },
    expiresInSeconds: 1800
  };
}
