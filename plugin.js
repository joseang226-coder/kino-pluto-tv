const API = "https://api.pluto.tv";
const BOOT = "https://boot.pluto.tv/v4/start";

const APP_VERSION = "5.100.1-a00ab03870075931f7b7df1e50eec1e31332ab4d";

function clean(v) {
  return Array.isArray(v) ? v[0] : v;
}

async function getJson(url, options = {}) {
  const r = await kino.fetch(url, options);

  if (!r.ok) {
    throw new Error("Pluto TV respondió " + r.status);
  }

  return r.json();
}

/*
 * Obtiene una sesión válida de Pluto TV.
 * Pluto devuelve aquí el sessionToken, stitcher y parámetros
 * necesarios para reproducir VOD.
 */
async function boot() {
  const clientID =
    (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "kino-" + Date.now();

  const u = new URL(BOOT);

  u.searchParams.set("appName", "web");
  u.searchParams.set("appVersion", APP_VERSION);
  u.searchParams.set("deviceVersion", "1.0.0");
  u.searchParams.set("deviceModel", "web");
  u.searchParams.set("deviceMake", "kino");
  u.searchParams.set("deviceType", "web");
  u.searchParams.set("clientID", clientID);
  u.searchParams.set("clientModelNumber", "1.0.0");
  u.searchParams.set("serverSideAds", "false");
  u.searchParams.set("clientTime", new Date().toISOString());

  return getJson(u.toString(), {
    headers: {
      Accept: "application/json",
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/"
    }
  });
}

/*
 * Busca Breadwinners en el catálogo VOD de Pluto.
 */
async function findBreadwinners() {
  const data = await getJson(
    API +
      "/v3/vod/categories?includeItems=true&deviceType=web",
    {
      headers: {
        Accept: "application/json",
        Origin: "https://pluto.tv",
        Referer: "https://pluto.tv/"
      }
    }
  );

  const found = [];

  const categories =
    Array.isArray(data)
      ? data
      : Array.isArray(data.categories)
        ? data.categories
        : [];

  for (const category of categories) {
    const items = Array.isArray(category.items)
      ? category.items
      : [];

    for (const item of items) {
      const name = String(
        clean(item.name || item.title || "")
      );

      if (!/breadwinners/i.test(name)) {
        continue;
      }

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

      if (
        !found.some(
          x => x.id === id
        )
      ) {
        found.push({
          id,
          name,
          item
        });
      }
    }
  }

  return found;
}

function seriesPoster(item) {
  if (
    item.poster16_9 &&
    item.poster16_9.path
  ) {
    return item.poster16_9.path;
  }

  if (
    item.featuredImage &&
    item.featuredImage.path
  ) {
    return item.featuredImage.path;
  }

  if (
    Array.isArray(item.covers) &&
    item.covers.length
  ) {
    return item.covers[0].url;
  }

  return undefined;
}

export async function search(query) {
  const text = String(query.q || "").trim();

  if (!text) {
    return [];
  }

  /*
   * El plugin está destinado a Breadwinners.
   * Aceptamos búsquedas como:
   * Breadwinners
   * bread
   * breadwinners nickelodeon
   */
  if (!/bread/i.test(text)) {
    return [];
  }

  const matches = await findBreadwinners();

  return matches.map(x => ({
    id: "pluto-breadwinners-" + x.id,
    ref: x.id,
    title: "Breadwinners",
    kind: "series",
    year: "2014",
    poster: seriesPoster(x.item),
    overview:
      x.item.description ||
      x.item.summary ||
      "Breadwinners — Pluto TV",
    lang: "en",
    badges: ["Pluto TV"]
  }));
}

/*
 * Obtiene todas las temporadas y episodios.
 */
export async function episodes(ref) {
  const seriesId = String(ref);

  const session = await boot();

  const url =
    API +
    "/v3/vod/series/" +
    encodeURIComponent(seriesId) +
    "/seasons?includeItems=true&deviceType=web";

  const data = await getJson(url, {
    headers: {
      Accept: "application/json",
      Authorization:
        "Bearer " + session.sessionToken,
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/"
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
      season.season ||
      1
    );

    const episodeList =
      Array.isArray(season.episodes)
        ? season.episodes
        : Array.isArray(season.items)
          ? season.items
          : [];

    for (
      let i = 0;
      i < episodeList.length;
      i++
    ) {
      const episode = episodeList[i];

      const episodeId =
        episode._id ||
        episode.id ||
        episode.episodeID;

      if (!episodeId) {
        continue;
      }

      const episodeNumber = Number(
        episode.number ||
        episode.episodeNumber ||
        episode.episode ||
        i + 1
      );

      result.push({
        season:
          seasonNumber > 0
            ? seasonNumber
            : 1,

        number: episodeNumber,

        ref: JSON.stringify({
          id: episodeId,
          slug:
            episode.slug ||
            episodeId
        }),

        title:
          episode.name ||
          episode.title ||
          "Episodio " +
            episodeNumber,

        overview:
          episode.description ||
          episode.summary ||
          undefined,

        still:
          episode.featuredImage &&
          episode.featuredImage.path
            ? episode.featuredImage.path
            : undefined,

        airDate:
          episode.clip &&
          episode.clip.originalReleaseDate
            ? String(
                episode.clip.originalReleaseDate
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

/*
 * Convierte el ID del episodio en una URL HLS
 * válida para la sesión actual de Pluto TV.
 */
export async function resolve(ref) {
  const episode = JSON.parse(ref);

  const session = await boot();

  if (!session.sessionToken) {
    throw new Error(
      "Pluto TV no devolvió un token de sesión"
    );
  }

  const stitcher =
    session.servers &&
    session.servers.stitcher
      ? session.servers.stitcher
      : "https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv";

  let path =
    "/stitch/hls/episode/" +
    encodeURIComponent(episode.id) +
    "/master.m3u8";

  /*
   * Pluto actualmente espera /v2/stitch/...
   */
  if (path.startsWith("/stitch/")) {
    path = "/v2" + path;
  }

  const params =
    new URLSearchParams();

  params.set(
    "jwt",
    session.sessionToken
  );

  params.set(
    "masterJWTPassthrough",
    "true"
  );

  if (session.stitcherParams) {
    const extra =
      new URLSearchParams(
        session.stitcherParams
      );

    for (const [key, value] of extra) {
      params.set(key, value);
    }
  }

  const url =
    stitcher +
    path +
    "?" +
    params.toString();

  return {
    url,

    mime: "application/x-mpegURL",

    headers: {
      Origin: "https://pluto.tv",
      Referer: "https://pluto.tv/"
    },

    expiresInSeconds: 1800
  };
}
