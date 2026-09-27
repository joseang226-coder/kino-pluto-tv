const APP_VERSION = "5.100.1-a00ab03870075931f7b7df1e50eec1e31332ab4d";
const BOOT = "https://boot.pluto.tv/v4/start";
const VOD = "https://service-vod.clusters.pluto.tv";
const STITCHER = "https://service-stitcher.clusters.pluto.tv";

function idFor(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function boot(params = {}) {
  const clientID =
    (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "kino-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  const u = new URL(BOOT);
  const p = u.searchParams;

  p.set("appName", "web");
  p.set("appVersion", APP_VERSION);
  p.set("deviceVersion", "1.0.0");
  p.set("deviceModel", "web");
  p.set("deviceMake", "kino");
  p.set("deviceType", "web");
  p.set("clientID", clientID);
  p.set("clientModelNumber", "1.0.0");
  p.set("serverSideAds", "false");
  p.set("clientTime", new Date().toISOString());

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      p.set(k, String(v));
    }
  }

  const r = await kino.fetch(u.toString(), {
    headers: {
      "Accept": "application/json",
      "Origin": "https://pluto.tv",
      "Referer": "https://pluto.tv/"
    }
  });

  if (!r.ok) {
    throw new Error("Pluto TV respondió " + r.status);
  }

  return r.json();
}

function vodItems(data) {
  if (Array.isArray(data.VOD)) return data.VOD;
  if (Array.isArray(data.vod)) return data.vod;
  if (data.VOD && Array.isArray(data.VOD.items)) return data.VOD.items;
  return [];
}

function stitchedUrl(item, auth) {
  const s = item && item.stitched;

  if (!s) return null;

  if (Array.isArray(s.urls) && s.urls.length) {
    const hls = s.urls.find(x =>
      String(x.type || "").toLowerCase().includes("hls")
    );

    if (hls && hls.url) return hls.url;
    if (s.urls[0] && s.urls[0].url) return s.urls[0].url;
  }

  if (s.path && auth && auth.stitcherParams) {
    return STITCHER + s.path + "?" + auth.stitcherParams;
  }

  if (typeof s === "string") return s;

  return null;
}

function itemToSeries(item) {
  const sid = item.id || item._id || item.seriesID || item.slug;
  const slug = item.slug || sid;

  return {
    id: "pluto:" + idFor(slug),
    ref: JSON.stringify({
      kind: "series",
      id: sid,
      slug: slug
    }),
    title: String(item.name || item.title || "Breadwinners"),
    kind: "series",
    year:
      item.clip && item.clip.originalReleaseDate
        ? String(item.clip.originalReleaseDate).slice(0, 4)
        : "2014",
    poster:
      item.poster16_9 && item.poster16_9.path
        ? item.poster16_9.path
        : undefined,
    overview: item.description || item.summary || undefined,
    lang: "es",
    badges: ["Pluto TV"]
  };
}

export async function search(query) {
  const q = String(query.q || "").trim();

  if (!q) return [];

  const wanted = [
    q,
    query.originalTitle,
    ...(query.altTitles || [])
  ]
    .filter(Boolean)
    .join(" ");

  const candidates = [];

  if (/breadwinners/i.test(wanted)) {
    candidates.push("breadwinners", "bread-winners");
  }

  if (!candidates.length) return [];

  const out = [];
  const seen = new Set();

  for (const slug of candidates) {
    try {
      const data = await boot({
        seriesIDs: slug
      });

      for (const item of vodItems(data)) {
        const name = String(item.name || item.title || "");

        if (!/breadwinners/i.test(name)) continue;

        const x = itemToSeries(item);

        if (!seen.has(x.id)) {
          seen.add(x.id);
          out.push(x);
        }
      }
    } catch (_) {}
  }

  return out;
}

export async function episodes(ref) {
  const x = JSON.parse(ref);

  if (x.kind !== "series") {
    throw new Error("referencia no válida");
  }

  const seriesId = x.id || x.slug;
  const auth = await boot({
    seriesIDs: seriesId
  });

  const url =
    VOD +
    "/v4/vod/series/" +
    encodeURIComponent(seriesId) +
    "/seasons?offset=1000&page=1";

  const r = await kino.fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + auth.sessionToken
    }
  });

  if (!r.ok) {
    throw new Error(
      "No se pudieron cargar las temporadas (" + r.status + ")"
    );
  }

  const data = r.json();

  const seasons =
    Array.isArray(data.seasons)
      ? data.seasons
      : Array.isArray(data)
        ? data
        : [];

  const eps = [];

  for (const season of seasons) {
    const sn = Number(
      season.number ||
      season.seasonNumber ||
      1
    );

    for (const e of season.episodes || []) {
      const epId =
        e.id ||
        e._id ||
        e.episodeID ||
        e.slug;

      if (!epId) continue;

      eps.push({
        season: sn > 0 ? sn : 1,

        number: Number(
          e.number ||
          e.episodeNumber ||
          (eps.length + 1)
        ),

        ref: JSON.stringify({
          kind: "episode",
          id: epId,
          slug: e.slug || epId,
          seriesId: seriesId
        }),

        title: String(
          e.name ||
          e.title ||
          ("Capítulo " + (eps.length + 1))
        ),

        still:
          e.image ||
          e.featuredImage ||
          (e.covers &&
            e.covers[0] &&
            e.covers[0].url) ||
          undefined,

        overview:
          e.description ||
          e.summary ||
          undefined,

        airDate:
          e.clip &&
          e.clip.originalReleaseDate
            ? String(
                e.clip.originalReleaseDate
              ).slice(0, 10)
            : undefined,

        runtimeMinutes:
          e.duration
            ? Math.round(
                Number(e.duration) / 60000
              )
            : undefined
      });
    }
  }

  return {
    series: {
      title: "Breadwinners",
      year: "2014"
    },
    episodes: eps
  };
}

export async function resolve(ref) {
  const x = JSON.parse(ref);

  if (x.kind !== "episode") {
    throw new Error("referencia no válida");
  }

  const data = await boot({
    episodeSlugs: x.slug || x.id
  });

  const items = vodItems(data);
  const item = items[0];

  if (!item) {
    throw new Error(
      "Pluto TV no devolvió el episodio"
    );
  }

  const url = stitchedUrl(item, data);

  if (!url) {
    throw new Error(
      "Pluto TV no devolvió una fuente reproducible"
    );
  }

  const durationMs =
    item.duration
      ? Number(item.duration)
      : undefined;

  return {
    url,

    headers: {
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/"
    },

    durationMs,

    expiresInSeconds: 1800
  };
}
