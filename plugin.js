const API = "https://api.pluto.tv";
const BOOT = "https://boot.pluto.tv/v4/start";
const VOD4 = "https://service-vod.clusters.pluto.tv/v4/vod";
const STITCHER = "https://service-stitcher.clusters.pluto.tv";
const APP_VERSION = "5.100.1-a00ab03870075931f7b7df1e50eec1e31332ab4d";

async function getJson(url, options = {}) {
  const r = await kino.fetch(url, options);
  if (!r.ok) throw new Error("Pluto TV respondió " + r.status);
  return r.json();
}

async function boot(seriesId = "") {
  const clientID =
    (globalThis.crypto && crypto.randomUUID)
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

  if (seriesId) {
    u.searchParams.set("seriesIDs", seriesId);
  }

  return getJson(u.toString(), {
    headers: {
      Accept: "application/json",
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/",
      "User-Agent": "Mozilla/5.0"
    }
  });
}

async function findBreadwinners() {
  const data = await getJson(
    API + "/v3/vod/categories?includeItems=true&deviceType=web",
    {
      headers: {
        Accept: "application/json",
        Origin: "https://pluto.tv",
        Referer: "https://pluto.tv/"
      }
    }
  );

  const categories = Array.isArray(data)
    ? data
    : Array.isArray(data.categories)
      ? data.categories
      : [];

  const found = [];

  for (const category of categories) {
    const items = Array.isArray(category.items)
      ? category.items
      : [];

    for (const item of items) {
      const name = String(item.name || item.title || "");

      if (!/breadwinners/i.test(name)) continue;

      if (
        item.type &&
        String(item.type).toLowerCase() !== "series"
      ) {
        continue;
      }

      const id =
        item._id ||
        item.id ||
        item.seriesID;

      if (!id) continue;

      if (!found.some(x => x.id === id)) {
        found.push({
          id,
          item
        });
      }
    }
  }

  return found;
}

function poster(item) {
  return (
    item.poster16_9?.path ||
    item.featuredImage?.path ||
    (
      Array.isArray(item.covers) &&
      item.covers[0]?.url
    ) ||
    undefined
  );
}

export async function search(query) {
  const text = String(query.q || "").trim();

  if (!text || !/bread/i.test(text)) {
    return [];
  }

  const matches = await findBreadwinners();

  return matches.map(x => ({
    id: "pluto-breadwinners-" + x.id,
    ref: x.id,
    title: "Breadwinners",
    kind: "series",
    year: "2014",
    poster: poster(x.item),
    overview:
      x.item.description ||
      x.item.summary ||
      "Breadwinners — Pluto TV",
    lang: "en",
    badges: ["Pluto TV"]
  }));
}

export async function episodes(ref) {
  const seriesId = String(ref);

  const session = await boot(seriesId);

  const url =
    VOD4 +
    "/series/" +
    encodeURIComponent(seriesId) +
    "/seasons?offset=0&page=0";

  const data = await getJson(url, {
    headers: {
      Accept: "application/json",
      Authorization:
        "Bearer " + session.sessionToken,
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/",
      "User-Agent": "Mozilla/5.0"
    }
  });

  const seasons =
    Array.isArray(data)
      ? data
      : Array.isArray(data.seasons)
        ? data.seasons
        : [];

  const result = [];

  for (const season of seasons) {
    const seasonNumber = Number(
      season.number ||
      season.seasonNumber ||
      1
    );

    const list = Array.isArray(season.episodes)
      ? season.episodes
      : [];

    for (let i = 0; i < list.length; i++) {
      const e = list[i];

      const id =
        e._id ||
        e.id ||
        e.episodeID;

      if (!id) continue;

      const number = Number(
        e.number ||
        e.episodeNumber ||
        i + 1
      );

      const stitchedPath =
        e.stitched?.path || "";

      result.push({
        season:
          seasonNumber > 0
            ? seasonNumber
            : 1,

        number,

        ref: JSON.stringify({
          id,
          path: stitchedPath
        }),

        title:
          e.name ||
          e.title ||
          "Episodio " + number,

        overview:
          e.description ||
          e.summary ||
          undefined,

        still:
          e.featuredImage?.path ||
          undefined,

        airDate:
          e.originalReleaseDate
            ? String(
                e.originalReleaseDate
              ).slice(0, 10)
            : undefined
      });
    }
  }

  return {
    series: {
      title: "Breadwinners",
      year: "2014"
    },

    episodes: result
  };
}

export async function resolve(ref) {
  const episode = JSON.parse(ref);

  if (!episode.path) {
    throw new Error(
      "Pluto TV no devolvió la ruta del episodio"
    );
  }

  const session = await boot();

  if (!session.stitcherParams) {
    throw new Error(
      "Pluto TV no devolvió los parámetros del reproductor"
    );
  }

  const url =
    STITCHER +
    episode.path +
    (
      episode.path.includes("?")
        ? "&"
        : "?"
    ) +
    session.stitcherParams;

  return {
    url,

    mime: "application/x-mpegURL",

    headers: {
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/",
      "User-Agent": "Mozilla/5.0"
    },

    expiresInSeconds: 1800
  };
}
