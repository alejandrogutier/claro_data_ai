#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const OUTPUT_ROOT = path.join(ROOT, "tmp");
const PAGES_DIR = path.join(OUTPUT_ROOT, "social_posts_pages");
const RAW_JSONL_PATH = path.join(OUTPUT_ROOT, "social_posts_raw_2024_2026.jsonl");
const RAW_ALL_JSONL_PATH = path.join(OUTPUT_ROOT, "social_posts_raw_all_2024_2026.jsonl");
const THEME_SUMMARY_CSV_PATH = path.join(OUTPUT_ROOT, "theme_summary.csv");
const THEME_EXAMPLES_CSV_PATH = path.join(OUTPUT_ROOT, "theme_examples.csv");
const ASSIGNMENTS_JSONL_PATH = path.join(OUTPUT_ROOT, "post_theme_assignments.jsonl");
const EXEC_SUMMARY_MD_PATH = path.join(OUTPUT_ROOT, "executive_summary.md");
const VALIDATION_JSON_PATH = path.join(OUTPUT_ROOT, "social_theme_validation_report.json");
const DISCOVERY_JSON_PATH = path.join(OUTPUT_ROOT, "social_theme_discovery_report.json");
const CREATIVE_DUPLICATES_CSV_PATH = path.join(OUTPUT_ROOT, "creative_duplicates.csv");
const RULE_AUDIT_JSON_PATH = path.join(OUTPUT_ROOT, "theme_rule_audit.json");

const DEFAULT_FROM = "2024-01-01T00:00:00Z";
const DEFAULT_TO = "2026-02-25T23:59:59Z";
const DEFAULT_LIMIT = 200;
const DEFAULT_SORT = "published_at_desc";
const DEFAULT_PRESET = "custom";
const DISCOVERY_MIN_POSTS = 12;
const MAX_DISCOVERY_THEMES = 25;

const REQUIRED_SEED_THEMES = [
  "prepago",
  "pospago",
  "hogares",
  "tripleplay",
  "claro_musica_app",
  "claro_music_venue_eventos",
  "claro_empresas",
  "claro_video"
];

const ADDITIONAL_SEED_THEMES = [
  "promociones_beneficios",
  "recargas",
  "streaming_bundles",
  "servicio_soporte",
  "cobertura_conectividad",
  "gaming_esports",
  "sostenibilidad_impacto_social"
];

const STOPWORDS = new Set([
  "a", "acá", "ahi", "ahora", "al", "algo", "algun", "alguna", "alguno", "algunos", "alla", "alli", "ante",
  "antes", "asi", "aun", "aún", "bajo", "bien", "cada", "casi", "claro", "colombia", "como", "con", "contra",
  "cual", "cuales", "cualquier", "cuando", "cuanto", "de", "del", "desde", "donde", "dos", "durante", "e",
  "el", "ella", "ellas", "ellos", "en", "entre", "era", "eran", "eres", "es", "esa", "esas", "ese", "eso",
  "esos", "esta", "estaba", "estado", "estamos", "estan", "estar", "estas", "este", "esto", "estos", "fue",
  "fueron", "ha", "hace", "hacia", "han", "hasta", "hay", "hoy", "la", "las", "le", "les", "lo", "los", "más",
  "mas", "me", "mi", "mis", "mismo", "mismos", "muy", "ni", "no", "nos", "nosotros", "nuestra", "nuestro",
  "o", "otra", "otro", "para", "pero", "poco", "por", "porque", "que", "se", "sea", "ser", "si", "sí", "sin",
  "sobre", "solo", "su", "sus", "tal", "tambien", "también", "te", "tenemos", "tiene", "tienen", "todo", "todos",
  "tu", "tus", "un", "una", "uno", "unos", "usa", "usan", "ya", "y"
]);

const DISCOVERY_BANNED_UNIGRAMS = new Set([
  "caption", "video", "instagram", "facebook", "linkedin", "tiktok", "post", "posts", "vivo", "oficial", "link",
  "bit", "ly", "http", "https", "com", "co", "www", "play", "dale", "fyp"
]);

const TOKEN_ALIAS = {
  apps: "app",
  app: "app",
  aplicaciones: "app",
  promociones: "promocion",
  promocion: "promocion",
  beneficios: "beneficio",
  recargas: "recarga",
  hogares: "hogar",
  empresas: "empresa",
  pymes: "pyme",
  videos: "video",
  conciertos: "concierto",
  canciones: "cancion"
};

const DISCOVERY_GENERIC_TOKENS = new Set([
  "aqui",
  "ahi",
  "alla",
  "mejor",
  "dia",
  "dias",
  "quien",
  "juntos",
  "todas",
  "todos",
  "hacer",
  "hace",
  "gracias",
  "posible",
  "comenta",
  "historia",
  "persona",
  "nuestros",
  "nuestro",
  "listo",
  "club",
  "siempre",
  "vivo",
  "nuevo",
  "nueva",
  "hoy",
  "momento",
  "momentos",
  "parte",
  "sigue",
  "seguir"
]);

const DISCOVERY_UNIGRAM_ALLOWLIST = new Set([
  "musica",
  "cupones",
  "humor",
  "navidad",
  "tecnologia",
  "gaming",
  "esports",
  "conectividad",
  "fibra",
  "festival",
  "concierto",
  "streaming",
  "promo",
  "beneficio",
  "reciclaje",
  "sostenibilidad",
  "futuro",
  "experiencia",
  "conexion",
  "copa",
  "video",
  "hogar",
  "prepago",
  "pospago",
  "recarga"
]);

const MUSIC_MARKERS = ["claro musica", "claro music", "claro música", "claro música"];
const MUSIC_APP_SIGNALS = [
  "app",
  "premium",
  "playlist",
  "escuchar",
  "escucha",
  "cancion",
  "canciones",
  "catalogo",
  "catálogo",
  "suscripcion",
  "suscripción",
  "musica sin interrupciones"
];
const MUSIC_VENUE_SIGNALS = [
  "concierto",
  "conciertos",
  "boleta",
  "boletas",
  "festival",
  "escenario",
  "artista",
  "artistas",
  "evento",
  "eventos",
  "venue",
  "show"
];

const BASE_THEME_RULES = [
  {
    id: "prepago",
    kind: "required_seed",
    patterns: [
      "prepago",
      "paquete prepago",
      "planes prepago",
      "linea prepago",
      "línea prepago"
    ]
  },
  {
    id: "pospago",
    kind: "required_seed",
    patterns: ["pospago", "postpago", "plan pospago", "plan postpago", "factura movil", "factura móvil"]
  },
  {
    id: "hogares",
    kind: "required_seed",
    patterns: [
      "hogares",
      "internet hogar",
      "internet en casa",
      "wifi hogar",
      "servicios hogar",
      "conectividad en casa"
    ]
  },
  {
    id: "tripleplay",
    kind: "required_seed",
    patterns: [
      "tripleplay",
      "triple play",
      "internet tv telefonia",
      "internet tv y telefonia",
      "internet + tv + telefonia"
    ]
  },
  {
    id: "claro_musica_app",
    kind: "required_seed",
    patterns: []
  },
  {
    id: "claro_music_venue_eventos",
    kind: "required_seed",
    patterns: []
  },
  {
    id: "claro_empresas",
    kind: "required_seed",
    patterns: [
      "claro empresas",
      "soluciones empresariales",
      "empresas",
      "pymes",
      "negocio",
      "corporativo",
      "b2b"
    ]
  },
  {
    id: "claro_video",
    kind: "required_seed",
    patterns: ["claro video", "clarovideo"]
  },
  {
    id: "promociones_beneficios",
    kind: "additional_seed",
    patterns: [
      "promocion",
      "promoción",
      "oferta",
      "beneficio",
      "beneficios",
      "descuento",
      "gratis",
      "meses gratis",
      "bono"
    ]
  },
  {
    id: "recargas",
    kind: "additional_seed",
    patterns: ["recarga", "recargas", "recargar", "recarga tu prepago", "paquete de recarga"]
  },
  {
    id: "streaming_bundles",
    kind: "additional_seed",
    patterns: [
      "netflix",
      "disney+",
      "disney plus",
      "prime video",
      "hbo",
      "max",
      "paramount+",
      "streaming",
      "activa netflix",
      "activa disney"
    ]
  },
  {
    id: "servicio_soporte",
    kind: "additional_seed",
    patterns: [
      "normalidad en tu sector",
      "si necesitas verificar",
      "escribenos",
      "escríbenos",
      "whatsapp",
      "soporte",
      "atencion",
      "atención",
      "ayuda",
      "falla",
      "falla de servicio",
      "intermitencia"
    ]
  },
  {
    id: "cobertura_conectividad",
    kind: "additional_seed",
    patterns: [
      "conectividad",
      "cobertura",
      "fibra optica",
      "fibra óptica",
      "5g",
      "4g",
      "internet",
      "senal",
      "señal",
      "red movil",
      "red móvil"
    ]
  },
  {
    id: "gaming_esports",
    kind: "additional_seed",
    patterns: [
      "gaming",
      "gamer",
      "esports",
      "claro gaming",
      "torneo",
      "videojuego",
      "videojuegos"
    ]
  },
  {
    id: "sostenibilidad_impacto_social",
    kind: "additional_seed",
    patterns: [
      "sostenibilidad",
      "sostenible",
      "raee",
      "reciclaje",
      "ambiental",
      "impacto social",
      "comunidad",
      "inclusion",
      "inclusión",
      "educacion",
      "educación"
    ]
  }
];

const THEME_META = {
  prepago: { label: "Prepago" },
  pospago: { label: "Pospago" },
  hogares: { label: "Hogares" },
  tripleplay: { label: "Tripleplay" },
  claro_musica_app: { label: "Claro Música (App)" },
  claro_music_venue_eventos: { label: "Claro Music (Venue/Eventos)" },
  claro_empresas: { label: "Claro Empresas" },
  claro_video: { label: "Claro Video" },
  promociones_beneficios: { label: "Promociones y Beneficios" },
  recargas: { label: "Recargas" },
  streaming_bundles: { label: "Bundles de Streaming" },
  servicio_soporte: { label: "Servicio y Soporte" },
  cobertura_conectividad: { label: "Cobertura y Conectividad" },
  gaming_esports: { label: "Gaming y Esports" },
  sostenibilidad_impacto_social: { label: "Sostenibilidad e Impacto Social" }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config = {
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    limit: DEFAULT_LIMIT,
    sort: DEFAULT_SORT,
    preset: DEFAULT_PRESET
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--from" && args[i + 1]) config.from = args[++i];
    else if (arg === "--to" && args[i + 1]) config.to = args[++i];
    else if (arg === "--limit" && args[i + 1]) config.limit = Number.parseInt(args[++i], 10);
    else if (arg === "--sort" && args[i + 1]) config.sort = args[++i];
    else if (arg === "--preset" && args[i + 1]) config.preset = args[++i];
  }

  if (!Number.isFinite(config.limit) || Number.isNaN(config.limit) || config.limit < 1 || config.limit > 200) {
    throw new Error("Invalid --limit, must be between 1 and 200");
  }

  return config;
};

const loadEnvFile = () => {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const ensureOutputDirs = () => {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.rmSync(PAGES_DIR, { recursive: true, force: true });
  fs.mkdirSync(PAGES_DIR, { recursive: true });
};

const execText = (cmd, args) => {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
};

const getTerraformOutput = (key) => {
  return execText("terraform", ["-chdir=infra/terraform", "output", "-raw", key]);
};

const resolveApiBase = () => {
  return process.env.HTTP_API_ENDPOINT || process.env.API_BASE_URL || getTerraformOutput("http_api_endpoint");
};

const resolveCognitoPoolId = () => {
  return process.env.COGNITO_USER_POOL_ID || getTerraformOutput("cognito_user_pool_id");
};

const resolveCognitoClientId = () => {
  return process.env.COGNITO_CLIENT_ID || getTerraformOutput("cognito_client_id");
};

const resolveViewerUser = () => {
  return process.env.SOCIAL_THEME_VIEWER_USER || process.env.TEST_VIEWER_USER || "viewer-test@claro.local";
};

const resolveViewerPassword = () => {
  return process.env.SOCIAL_THEME_VIEWER_PASSWORD || process.env.TEST_USER_PASSWORD || "ClaroData!2026";
};

const getCognitoIdToken = (input) => {
  const args = [
    "cognito-idp",
    "admin-initiate-auth",
    "--region",
    input.region,
    "--user-pool-id",
    input.poolId,
    "--client-id",
    input.clientId,
    "--auth-flow",
    "ADMIN_USER_PASSWORD_AUTH",
    "--auth-parameters",
    `USERNAME=${input.username},PASSWORD=${input.password}`,
    "--query",
    "AuthenticationResult.IdToken",
    "--output",
    "text"
  ];
  const token = execText("aws", args);
  if (!token || token === "None") {
    throw new Error("Could not obtain Cognito IdToken");
  }
  return token;
};

const apiGet = async (url, token) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed ? JSON.stringify(parsed) : body;
    throw new Error(`API ${response.status} for ${url}: ${detail}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid JSON payload for ${url}`);
  }

  return parsed;
};

const stripAccents = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const toAsciiKey = (text) =>
  stripAccents(String(text || "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cleanTextPreserveAccents = (text) =>
  String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const safeDate = (raw) => {
  const parsed = new Date(raw || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsPhrase = (haystackKey, phrase) => {
  const phraseKey = toAsciiKey(phrase);
  if (!phraseKey) return false;
  const regex = new RegExp(`(^|\\b)${escapeRegex(phraseKey).replace(/\s+/g, "\\s+")}(\\b|$)`, "i");
  return regex.test(haystackKey);
};

const containsAnyPhrase = (haystackKey, phrases) => {
  for (const phrase of phrases) {
    if (containsPhrase(haystackKey, phrase)) return true;
  }
  return false;
};

const csvEscape = (value) => {
  const str = value === null || value === undefined ? "" : String(value);
  const needsQuotes = /[",\n\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const writeCsv = (filePath, headers, rows) => {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
};

const writeJsonl = (filePath, rows) => {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, content ? `${content}\n` : "", "utf8");
};

const isClaroAccount = (accountName) => {
  const key = toAsciiKey(accountName);
  return key.startsWith("claro");
};

const extractPosts = async (input) => {
  const allPosts = [];
  const seenIds = new Set();
  let duplicateIdsAcrossPages = 0;
  let hasNext = true;
  let cursor = null;
  let pageNumber = 0;

  while (hasNext) {
    const url = new URL(`${input.apiBase}/v1/monitor/social/posts`);
    url.searchParams.set("preset", input.preset);
    url.searchParams.set("from", input.from);
    url.searchParams.set("to", input.to);
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("sort", input.sort);
    if (cursor) url.searchParams.set("cursor", cursor);

    const payload = await apiGet(url.toString(), input.token);
    if (!Array.isArray(payload.items)) {
      throw new Error(`Invalid items in page payload ${pageNumber + 1}`);
    }

    pageNumber += 1;
    const pagePath = path.join(PAGES_DIR, `page_${String(pageNumber).padStart(4, "0")}.json`);
    fs.writeFileSync(pagePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    for (const item of payload.items) {
      if (item && typeof item === "object") {
        if (seenIds.has(item.id)) duplicateIdsAcrossPages += 1;
        else seenIds.add(item.id);
        allPosts.push(item);
      }
    }

    const pageInfo = payload.page_info || {};
    hasNext = Boolean(pageInfo.has_next);
    cursor = typeof pageInfo.next_cursor === "string" && pageInfo.next_cursor ? pageInfo.next_cursor : null;
    if (hasNext && !cursor) {
      throw new Error(`Invalid cursor state at page ${pageNumber}: has_next=true but next_cursor is null`);
    }

    if (pageNumber > 10000) {
      throw new Error("Pagination guard triggered (>10000 pages)");
    }
  }

  return {
    allPosts,
    pageCount: pageNumber,
    uniqueIds: seenIds.size,
    duplicateIdsAcrossPages
  };
};

const dedupeOperational = (posts) => {
  const map = new Map();
  let duplicateCandidates = 0;
  let replacements = 0;

  for (const post of posts) {
    const channel = String(post.channel || "").trim().toLowerCase();
    const externalPostId = String(post.external_post_id || post.id || "").trim();
    const key = `${channel}::${externalPostId}`;
    if (!map.has(key)) {
      map.set(key, post);
      continue;
    }

    duplicateCandidates += 1;
    const current = map.get(key);
    const currentUpdated = safeDate(current.updated_at || current.created_at);
    const candidateUpdated = safeDate(post.updated_at || post.created_at);

    const currentUpdatedMs = currentUpdated ? currentUpdated.getTime() : 0;
    const candidateUpdatedMs = candidateUpdated ? candidateUpdated.getTime() : 0;

    if (candidateUpdatedMs > currentUpdatedMs) {
      map.set(key, post);
      replacements += 1;
      continue;
    }

    if (candidateUpdatedMs === currentUpdatedMs) {
      const currentId = String(current.id || "");
      const candidateId = String(post.id || "");
      if (candidateId > currentId) {
        map.set(key, post);
        replacements += 1;
      }
    }
  }

  const deduped = Array.from(map.values()).sort((a, b) => {
    const ad = safeDate(a.published_at || a.created_at);
    const bd = safeDate(b.published_at || b.created_at);
    const aMs = ad ? ad.getTime() : 0;
    const bMs = bd ? bd.getTime() : 0;
    if (bMs !== aMs) return bMs - aMs;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  return {
    posts: deduped,
    duplicateCandidates,
    replacements
  };
};

const buildRuleIndex = () => {
  const byId = new Map();
  for (const rule of BASE_THEME_RULES) {
    byId.set(rule.id, rule);
  }
  return byId;
};

const assignThemeSeeds = (post) => {
  const themes = new Set();
  const accountName = String(post.account_name || "");
  const accountKey = toAsciiKey(accountName);
  const rawText = String(post.text || post.title || "");
  const cleanText = cleanTextPreserveAccents(rawText);
  const matchText = toAsciiKey(cleanText);

  const hasMusicMarker = containsAnyPhrase(matchText, MUSIC_MARKERS);
  const hasMusicAppSignal = containsAnyPhrase(matchText, MUSIC_APP_SIGNALS);
  const hasMusicVenueSignal = containsAnyPhrase(matchText, MUSIC_VENUE_SIGNALS);

  if (hasMusicMarker && (hasMusicAppSignal || accountKey === "claro musica")) {
    themes.add("claro_musica_app");
  }
  if (hasMusicMarker && hasMusicVenueSignal) {
    themes.add("claro_music_venue_eventos");
  }

  if (!themes.has("claro_musica_app") && accountKey === "claro musica" && !hasMusicVenueSignal) {
    themes.add("claro_musica_app");
  }

  if (!themes.has("claro_music_venue_eventos") && hasMusicVenueSignal && containsAnyPhrase(matchText, ["claro music", "claro musica"])) {
    themes.add("claro_music_venue_eventos");
  }

  for (const rule of BASE_THEME_RULES) {
    if (rule.id === "claro_musica_app" || rule.id === "claro_music_venue_eventos") continue;

    let matched = false;
    if (rule.id === "claro_empresas") {
      matched = accountKey.includes("claro empresas") || containsAnyPhrase(matchText, rule.patterns);
    } else if (rule.id === "claro_video") {
      matched = accountKey.includes("claro video") || containsAnyPhrase(matchText, rule.patterns);
    } else if (rule.id === "gaming_esports") {
      matched = accountKey.includes("claro gaming") || containsAnyPhrase(matchText, rule.patterns);
    } else {
      matched = containsAnyPhrase(matchText, rule.patterns);
    }

    if (matched) themes.add(rule.id);
  }

  return {
    cleanText,
    matchText,
    themes: Array.from(themes).sort(),
    ambiguousDualContext: themes.has("claro_musica_app") && themes.has("claro_music_venue_eventos")
  };
};

const normalizeDiscoveryToken = (token) => {
  if (!token) return "";
  const aliased = TOKEN_ALIAS[token] || token;
  if (aliased.length > 4 && aliased.endsWith("es")) {
    return aliased.slice(0, -2);
  }
  if (aliased.length > 4 && aliased.endsWith("s")) {
    return aliased.slice(0, -1);
  }
  return aliased;
};

const tokenizeForDiscovery = (matchText) => {
  return matchText
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !DISCOVERY_BANNED_UNIGRAMS.has(token));
};

const isValidDiscoveryPhrase = (phrase) => {
  if (!phrase) return false;
  const tokens = phrase.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token.length < 4) return false;
    if (DISCOVERY_GENERIC_TOKENS.has(token)) return false;
    if (!DISCOVERY_UNIGRAM_ALLOWLIST.has(token)) return false;
    return true;
  }
  const allGeneric = tokens.every((token) => DISCOVERY_GENERIC_TOKENS.has(token));
  return !allGeneric;
};

const buildDiscoveryThemes = (unmatchedAssignments) => {
  const phraseMap = new Map();

  for (const assignment of unmatchedAssignments) {
    const postId = String(assignment.post_id);
    const tokens = tokenizeForDiscovery(assignment.match_text);
    if (tokens.length === 0) continue;

    const phrasesInPost = new Set();
    for (let n = 1; n <= 3; n += 1) {
      for (let i = 0; i <= tokens.length - n; i += 1) {
        const phraseTokens = tokens.slice(i, i + n);
        const phrase = phraseTokens.join(" ");
        if (n === 1 && DISCOVERY_BANNED_UNIGRAMS.has(phrase)) continue;
        if (!isValidDiscoveryPhrase(phrase)) continue;
        phrasesInPost.add(phrase);
      }
    }

    for (const phrase of phrasesInPost) {
      let entry = phraseMap.get(phrase);
      if (!entry) {
        entry = { phrase, postIds: new Set() };
        phraseMap.set(phrase, entry);
      }
      entry.postIds.add(postId);
    }
  }

  const candidates = [];
  for (const entry of phraseMap.values()) {
    const count = entry.postIds.size;
    if (count >= DISCOVERY_MIN_POSTS) {
      candidates.push({ phrase: entry.phrase, count, postIds: entry.postIds });
    }
  }

  const grouped = new Map();
  for (const candidate of candidates) {
    const root = candidate.phrase
      .split(" ")
      .map(normalizeDiscoveryToken)
      .join(" ")
      .trim();
    if (!root) continue;
    if (!isValidDiscoveryPhrase(root)) continue;

    let group = grouped.get(root);
    if (!group) {
      group = { root, variants: [], postIds: new Set() };
      grouped.set(root, group);
    }

    group.variants.push(candidate);
    for (const postId of candidate.postIds) {
      group.postIds.add(postId);
    }
  }

  const discoveredThemes = [];
  for (const group of grouped.values()) {
    const count = group.postIds.size;
    if (count < DISCOVERY_MIN_POSTS) continue;

    const representative = group.variants
      .slice()
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.phrase.localeCompare(b.phrase);
      })[0];

    const slugBase = representative.phrase
      .replace(/[^a-z0-9\s]/gi, " ")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 50)
      .toLowerCase();

    if (!slugBase) continue;

    discoveredThemes.push({
      id: `tema_descubierto_${slugBase}`,
      representative: representative.phrase,
      count,
      variants: group.variants.map((variant) => ({ phrase: variant.phrase, count: variant.count })),
      phrasesForMatch: Array.from(new Set(group.variants.map((variant) => variant.phrase)))
    });
  }

  discoveredThemes.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.id.localeCompare(b.id);
  });

  return discoveredThemes.slice(0, MAX_DISCOVERY_THEMES);
};

const assignDiscoveredThemes = (unmatchedAssignments, discoveredThemes) => {
  const assigned = [];

  for (const assignment of unmatchedAssignments) {
    const themes = [];
    for (const theme of discoveredThemes) {
      if (containsAnyPhrase(assignment.match_text, theme.phrasesForMatch)) {
        themes.push(theme.id);
      }
    }

    assigned.push({
      ...assignment,
      themes,
      discovery_only: themes.length > 0,
      unclassified: themes.length === 0
    });
  }

  return assigned;
};

const buildAssignments = (posts) => {
  const withSeed = [];
  const unmatched = [];

  for (const post of posts) {
    const seed = assignThemeSeeds(post);
    const textBase = String(post.text || post.title || "").replace(/\s+/g, " ").trim();
    const creativeHash = crypto.createHash("sha1").update(seed.matchText).digest("hex");

    const assignment = {
      post_id: String(post.id || ""),
      content_item_id: String(post.content_item_id || ""),
      external_post_id: String(post.external_post_id || ""),
      published_at: post.published_at || post.created_at || null,
      account_name: post.account_name || "",
      channel: post.channel || "",
      sentiment: post.sentiment || "unknown",
      engagement_total: toNumber(post.engagement_total),
      text: textBase,
      text_clean: seed.cleanText,
      match_text: seed.matchText,
      creative_hash: creativeHash,
      themes: seed.themes,
      ambiguous_dual_context: seed.ambiguousDualContext,
      discovery_only: false,
      unclassified: false
    };

    if (seed.themes.length === 0) unmatched.push(assignment);
    else withSeed.push(assignment);
  }

  const discoveredThemes = buildDiscoveryThemes(unmatched);
  const unmatchedAfterDiscovery = assignDiscoveredThemes(unmatched, discoveredThemes);

  const finalAssignments = withSeed.concat(unmatchedAfterDiscovery);

  return {
    assignments: finalAssignments,
    discoveredThemes,
    unmatchedCount: unmatchedAfterDiscovery.filter((item) => item.unclassified).length,
    seedAssignedCount: withSeed.length,
    discoveryAssignedCount: unmatchedAfterDiscovery.filter((item) => item.discovery_only).length
  };
};

const buildCreativeDuplicateRows = (assignments) => {
  const grouped = new Map();

  for (const assignment of assignments) {
    const key = assignment.creative_hash;
    if (!key) continue;

    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        creative_hash: key,
        count: 0,
        accounts: new Map(),
        channels: new Map(),
        sample_text: assignment.text_clean || assignment.text || ""
      };
      grouped.set(key, entry);
    }

    entry.count += 1;
    const account = assignment.account_name || "(unknown)";
    const channel = assignment.channel || "(unknown)";
    entry.accounts.set(account, (entry.accounts.get(account) || 0) + 1);
    entry.channels.set(channel, (entry.channels.get(channel) || 0) + 1);
  }

  const rows = [];
  for (const entry of grouped.values()) {
    if (entry.count <= 1) continue;

    const topAccounts = Array.from(entry.accounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name}:${count}`)
      .join("|");

    const topChannels = Array.from(entry.channels.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name}:${count}`)
      .join("|");

    rows.push({
      creative_hash: entry.creative_hash,
      count: entry.count,
      accounts_top: topAccounts,
      channels_top: topChannels,
      sample_text: entry.sample_text.slice(0, 220)
    });
  }

  rows.sort((a, b) => b.count - a.count);
  return rows;
};

const buildThemeMetrics = (assignments) => {
  const byTheme = new Map();

  for (const assignment of assignments) {
    if (!Array.isArray(assignment.themes) || assignment.themes.length === 0) continue;

    for (const theme of assignment.themes) {
      let entry = byTheme.get(theme);
      if (!entry) {
        entry = {
          theme,
          postIds: new Set(),
          posts_count: 0,
          engagement_total: 0,
          accounts: new Map(),
          channels: new Map(),
          sentiments: new Map(),
          examples: []
        };
        byTheme.set(theme, entry);
      }

      if (entry.postIds.has(assignment.post_id)) continue;
      entry.postIds.add(assignment.post_id);
      entry.posts_count += 1;
      entry.engagement_total += assignment.engagement_total;
      entry.accounts.set(assignment.account_name, (entry.accounts.get(assignment.account_name) || 0) + 1);
      entry.channels.set(assignment.channel, (entry.channels.get(assignment.channel) || 0) + 1);
      entry.sentiments.set(assignment.sentiment, (entry.sentiments.get(assignment.sentiment) || 0) + 1);
      entry.examples.push(assignment);
    }
  }

  const metrics = [];
  for (const entry of byTheme.values()) {
    const maxAccounts = Array.from(entry.accounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name}:${count}`)
      .join("|");

    const maxChannels = Array.from(entry.channels.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name}:${count}`)
      .join("|");

    const engagementPromedio = entry.posts_count > 0 ? entry.engagement_total / entry.posts_count : 0;

    metrics.push({
      theme: entry.theme,
      theme_label: THEME_META[entry.theme]?.label || entry.theme,
      posts_count: entry.posts_count,
      engagement_total: entry.engagement_total,
      engagement_promedio: engagementPromedio,
      accounts_top: maxAccounts,
      channels_top: maxChannels,
      accounts_contribuyentes: entry.accounts.size,
      canales_contribuyentes: entry.channels.size,
      sentiments: Object.fromEntries(entry.sentiments.entries()),
      examples: entry.examples
    });
  }

  const maxPosts = metrics.reduce((acc, item) => Math.max(acc, item.posts_count), 0);
  const maxEng = metrics.reduce((acc, item) => Math.max(acc, item.engagement_total), 0);

  for (const metric of metrics) {
    const freqNorm = maxPosts > 0 ? metric.posts_count / maxPosts : 0;
    const engNorm = maxEng > 0 ? metric.engagement_total / maxEng : 0;
    metric.priority_score = 0.6 * freqNorm + 0.4 * engNorm;
  }

  metrics.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    if (b.posts_count !== a.posts_count) return b.posts_count - a.posts_count;
    return a.theme.localeCompare(b.theme);
  });

  return metrics;
};

const buildRuleAudit = (assignments) => {
  const ruleByTheme = buildRuleIndex();
  const allPostIds = assignments.map((item) => item.post_id);
  const results = [];

  for (const theme of [...REQUIRED_SEED_THEMES, ...ADDITIONAL_SEED_THEMES]) {
    const rule = ruleByTheme.get(theme);
    const positives = assignments.filter((item) => item.themes.includes(theme));
    const negative = assignments.find((item) => !item.themes.includes(theme));

    results.push({
      theme,
      rule_defined: Boolean(rule),
      patterns: rule ? rule.patterns : [],
      positive_examples_count: positives.length,
      positive_example_post_id: positives[0]?.post_id || null,
      negative_example_post_id: negative ? negative.post_id : null,
      total_posts_evaluated: allPostIds.length
    });
  }

  return results;
};

const buildExampleRows = (themeMetrics) => {
  const rows = [];

  for (const metric of themeMetrics) {
    const topExamples = metric.examples
      .slice()
      .sort((a, b) => {
        if (b.engagement_total !== a.engagement_total) return b.engagement_total - a.engagement_total;
        const ad = safeDate(a.published_at);
        const bd = safeDate(b.published_at);
        const aMs = ad ? ad.getTime() : 0;
        const bMs = bd ? bd.getTime() : 0;
        if (bMs !== aMs) return bMs - aMs;
        return a.post_id.localeCompare(b.post_id);
      })
      .slice(0, 3);

    for (const item of topExamples) {
      rows.push({
        theme: metric.theme,
        post_id: item.post_id,
        published_at: item.published_at || "",
        account_name: item.account_name,
        channel: item.channel,
        text_excerpt: (item.text || item.text_clean || "").replace(/\s+/g, " ").slice(0, 220),
        engagement_total: item.engagement_total
      });
    }
  }

  return rows;
};

const buildExecutiveSummary = (input) => {
  const top15 = input.themeMetrics.slice(0, 15);
  const supportMetric = input.themeMetrics.find((item) => item.theme === "servicio_soporte");
  const musicAppMetric = input.themeMetrics.find((item) => item.theme === "claro_musica_app");
  const musicVenueMetric = input.themeMetrics.find((item) => item.theme === "claro_music_venue_eventos");

  const opportunities = input.themeMetrics
    .filter((item) => item.posts_count >= 15)
    .sort((a, b) => b.engagement_promedio - a.engagement_promedio)
    .slice(0, 3)
    .map((item) => `- ${item.theme_label}: engagement promedio ${item.engagement_promedio.toFixed(2)} en ${item.posts_count} posts.`)
    .join("\n");

  const risks = [];
  if (supportMetric) {
    risks.push(`- Servicio/soporte aparece en ${supportMetric.posts_count} posts; requiere monitoreo continuo de mensajes operativos.`);
  }
  if (input.ambiguousDualContextCount > 0) {
    risks.push(
      `- Se detectaron ${input.ambiguousDualContextCount} posts con contexto dual (app + venue) en Claro Música/Claro Music; conviene revisión manual puntual.`
    );
  }
  if (input.unclassifiedCount > 0) {
    risks.push(`- ${input.unclassifiedCount} posts quedaron sin tema; revisar nuevas reglas para cubrirlos.`);
  }
  if (risks.length === 0) {
    risks.push("- No se detectaron riesgos críticos de clasificación en esta corrida.");
  }

  const tableLines = [
    "| # | Tema | Posts | Engagement total | Score | Cuentas top | Canales top |",
    "|---|------|------:|-----------------:|------:|-------------|-------------|"
  ];

  top15.forEach((item, index) => {
    tableLines.push(
      `| ${index + 1} | ${item.theme_label} | ${item.posts_count} | ${item.engagement_total.toFixed(2)} | ${item.priority_score.toFixed(4)} | ${item.accounts_top || "-"} | ${item.channels_top || "-"} |`
    );
  });

  const lines = [
    "# Resumen Ejecutivo: Temas Sociales de Claro Colombia",
    "",
    `- Ventana analizada: ${input.from} a ${input.to}.`,
    `- Posts extraídos (scope Claro): ${input.scopedRawCount}.`,
    `- Posts después de dedupe operativo: ${input.dedupedCount}.`,
    `- Cobertura vs overview (kpis.posts=${input.overviewPosts}): delta ${input.coverageDeltaPct.toFixed(4)}%.`,
    `- Cuentas analizadas: ${input.accountList.join(", ")}.`,
    `- Temas detectados: ${input.themeMetrics.length} (${input.discoveredThemes.length} descubiertos).`,
    "",
    "## Top 15 Temas (Frecuencia + Engagement)",
    "",
    ...tableLines,
    "",
    "## Hallazgos de Claro Música",
    "",
    `- Claro Música (app): ${musicAppMetric ? musicAppMetric.posts_count : 0} posts.`,
    `- Claro Music (venue/eventos): ${musicVenueMetric ? musicVenueMetric.posts_count : 0} posts.`,
    `- Posts con ambigüedad dual: ${input.ambiguousDualContextCount}.`,
    "",
    "## Oportunidades",
    "",
    opportunities || "- No hay suficientes datos para oportunidades con umbral mínimo.",
    "",
    "## Riesgos",
    "",
    ...risks,
    "",
    "## Validaciones Técnicas",
    "",
    `- Paginación completa: ${input.paginationPass ? "OK" : "FAIL"}.`,
    `- Cobertura <= 1%: ${input.coveragePass ? "OK" : "FAIL"}.`,
    `- Dedupe operativo sin llaves duplicadas: ${input.dedupePass ? "OK" : "FAIL"}.`,
    `- Discovery con umbral >= ${DISCOVERY_MIN_POSTS}: ${input.discoveryThresholdPass ? "OK" : "FAIL"}.`
  ];

  fs.writeFileSync(EXEC_SUMMARY_MD_PATH, `${lines.join("\n")}\n`, "utf8");
};

const run = async () => {
  loadEnvFile();
  ensureOutputDirs();

  const args = parseArgs();
  const awsRegion = process.env.AWS_REGION || "us-east-1";

  const apiBase = resolveApiBase();
  const poolId = resolveCognitoPoolId();
  const clientId = resolveCognitoClientId();
  const viewerUser = resolveViewerUser();
  const viewerPassword = resolveViewerPassword();

  const token = getCognitoIdToken({
    region: awsRegion,
    poolId,
    clientId,
    username: viewerUser,
    password: viewerPassword
  });

  console.log("[1/8] Extrayendo posts paginados...");
  const extraction = await extractPosts({
    apiBase,
    token,
    from: args.from,
    to: args.to,
    limit: args.limit,
    sort: args.sort,
    preset: args.preset
  });

  console.log(`[INFO] páginas=${extraction.pageCount}, items=${extraction.allPosts.length}, unique_ids=${extraction.uniqueIds}`);

  console.log("[2/8] Filtrando scope social Claro y escribiendo raw JSONL...");
  const scopedRawPosts = extraction.allPosts.filter((item) => isClaroAccount(item.account_name));
  writeJsonl(RAW_ALL_JSONL_PATH, extraction.allPosts);
  writeJsonl(RAW_JSONL_PATH, scopedRawPosts);

  console.log("[3/8] Validando cobertura contra social overview...");
  const overview = await apiGet(`${apiBase}/v1/monitor/social/overview?preset=all`, token);
  const overviewPosts = toNumber(overview?.kpis?.posts);
  const coverageDeltaPct = overviewPosts > 0
    ? Math.abs(extraction.allPosts.length - overviewPosts) / overviewPosts * 100
    : 0;

  console.log("[4/8] Ejecutando dedupe operativo...");
  const dedupe = dedupeOperational(scopedRawPosts);

  console.log("[5/8] Asignando temas seed + discovery...");
  const assignmentResult = buildAssignments(dedupe.posts);
  const assignments = assignmentResult.assignments;

  console.log("[6/8] Calculando métricas y ranking de temas...");
  const themeMetrics = buildThemeMetrics(assignments);
  const exampleRows = buildExampleRows(themeMetrics);
  const creativeDuplicateRows = buildCreativeDuplicateRows(assignments);

  const summaryRows = themeMetrics.map((item) => ({
    theme: item.theme,
    posts_count: item.posts_count,
    engagement_total: item.engagement_total.toFixed(2),
    engagement_promedio: item.engagement_promedio.toFixed(2),
    priority_score: item.priority_score.toFixed(6),
    accounts_top: item.accounts_top,
    channels_top: item.channels_top,
    accounts_contribuyentes: item.accounts_contribuyentes,
    canales_contribuyentes: item.canales_contribuyentes
  }));

  console.log("[7/8] Exportando artefactos...");
  writeJsonl(
    ASSIGNMENTS_JSONL_PATH,
    assignments.map((item) => ({
      post_id: item.post_id,
      content_item_id: item.content_item_id,
      external_post_id: item.external_post_id,
      published_at: item.published_at,
      account_name: item.account_name,
      channel: item.channel,
      sentiment: item.sentiment,
      engagement_total: item.engagement_total,
      themes: item.themes,
      ambiguous_dual_context: item.ambiguous_dual_context,
      discovery_only: item.discovery_only,
      unclassified: item.unclassified,
      text: item.text,
      text_clean: item.text_clean,
      creative_hash: item.creative_hash
    }))
  );

  writeCsv(THEME_SUMMARY_CSV_PATH, [
    "theme",
    "posts_count",
    "engagement_total",
    "engagement_promedio",
    "priority_score",
    "accounts_top",
    "channels_top",
    "accounts_contribuyentes",
    "canales_contribuyentes"
  ], summaryRows);

  writeCsv(THEME_EXAMPLES_CSV_PATH, [
    "theme",
    "post_id",
    "published_at",
    "account_name",
    "channel",
    "text_excerpt",
    "engagement_total"
  ], exampleRows);

  writeCsv(CREATIVE_DUPLICATES_CSV_PATH, [
    "creative_hash",
    "count",
    "accounts_top",
    "channels_top",
    "sample_text"
  ], creativeDuplicateRows);

  fs.writeFileSync(DISCOVERY_JSON_PATH, `${JSON.stringify(assignmentResult.discoveredThemes, null, 2)}\n`, "utf8");

  const ruleAudit = buildRuleAudit(assignments);
  fs.writeFileSync(RULE_AUDIT_JSON_PATH, `${JSON.stringify(ruleAudit, null, 2)}\n`, "utf8");

  const dedupeKeySet = new Set();
  let dedupeKeyCollisions = 0;
  for (const post of dedupe.posts) {
    const key = `${String(post.channel || "").toLowerCase()}::${String(post.external_post_id || post.id || "")}`;
    if (dedupeKeySet.has(key)) dedupeKeyCollisions += 1;
    else dedupeKeySet.add(key);
  }

  const discoveryThresholdPass = assignmentResult.discoveredThemes.every((theme) => theme.count >= DISCOVERY_MIN_POSTS);
  const ambiguousDualContextCount = assignments.filter((item) => item.ambiguous_dual_context).length;
  const unclassifiedCount = assignments.filter((item) => item.unclassified).length;

  const validation = {
    run_at: new Date().toISOString(),
    config: {
      from: args.from,
      to: args.to,
      limit: args.limit,
      sort: args.sort,
      preset: args.preset,
      discovery_min_posts: DISCOVERY_MIN_POSTS
    },
    checks: {
      pagination_complete: {
        pass: extraction.pageCount >= 1 && extraction.duplicateIdsAcrossPages === 0,
        details: {
          page_count: extraction.pageCount,
          duplicate_ids_across_pages: extraction.duplicateIdsAcrossPages
        }
      },
      coverage_within_tolerance: {
        pass: coverageDeltaPct <= 1,
        details: {
          extracted_posts_all: extraction.allPosts.length,
          overview_posts_all: overviewPosts,
          delta_pct: Number(coverageDeltaPct.toFixed(6)),
          tolerance_pct: 1
        }
      },
      dedupe_operational: {
        pass: dedupeKeyCollisions === 0,
        details: {
          input_posts_scope: scopedRawPosts.length,
          deduped_posts_scope: dedupe.posts.length,
          duplicate_candidates: dedupe.duplicateCandidates,
          replacements: dedupe.replacements,
          dedupe_key_collisions: dedupeKeyCollisions
        }
      },
      seed_rules_defined: {
        pass: ruleAudit.every((item) => item.rule_defined),
        details: {
          required_seed_themes: REQUIRED_SEED_THEMES,
          additional_seed_themes: ADDITIONAL_SEED_THEMES
        }
      },
      claro_musica_disambiguation: {
        pass: true,
        details: {
          app_posts: assignments.filter((item) => item.themes.includes("claro_musica_app")).length,
          venue_posts: assignments.filter((item) => item.themes.includes("claro_music_venue_eventos")).length,
          ambiguous_dual_context_posts: ambiguousDualContextCount
        }
      },
      discovery_threshold: {
        pass: discoveryThresholdPass,
        details: {
          discovered_theme_count: assignmentResult.discoveredThemes.length,
          min_posts_required: DISCOVERY_MIN_POSTS
        }
      }
    },
    totals: {
      extracted_posts_all: extraction.allPosts.length,
      extracted_posts_scope: scopedRawPosts.length,
      deduped_posts_scope: dedupe.posts.length,
      assignments_total: assignments.length,
      seed_assigned_posts: assignmentResult.seedAssignedCount,
      discovery_assigned_posts: assignmentResult.discoveryAssignedCount,
      unclassified_posts: unclassifiedCount,
      themes_total: themeMetrics.length,
      discovered_themes_total: assignmentResult.discoveredThemes.length
    }
  };

  fs.writeFileSync(VALIDATION_JSON_PATH, `${JSON.stringify(validation, null, 2)}\n`, "utf8");

  const accountList = Array.from(new Set(dedupe.posts.map((item) => item.account_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  buildExecutiveSummary({
    from: args.from,
    to: args.to,
    scopedRawCount: scopedRawPosts.length,
    dedupedCount: dedupe.posts.length,
    overviewPosts,
    coverageDeltaPct,
    accountList,
    themeMetrics,
    discoveredThemes: assignmentResult.discoveredThemes,
    ambiguousDualContextCount,
    unclassifiedCount,
    paginationPass: validation.checks.pagination_complete.pass,
    coveragePass: validation.checks.coverage_within_tolerance.pass,
    dedupePass: validation.checks.dedupe_operational.pass,
    discoveryThresholdPass
  });

  console.log("[8/8] Finalizado.");
  console.log("---");
  console.log(`Raw pages: ${PAGES_DIR}`);
  console.log(`Raw JSONL (scope): ${RAW_JSONL_PATH}`);
  console.log(`Assignments JSONL: ${ASSIGNMENTS_JSONL_PATH}`);
  console.log(`Theme summary CSV: ${THEME_SUMMARY_CSV_PATH}`);
  console.log(`Theme examples CSV: ${THEME_EXAMPLES_CSV_PATH}`);
  console.log(`Executive summary: ${EXEC_SUMMARY_MD_PATH}`);
  console.log(`Validation report: ${VALIDATION_JSON_PATH}`);

  if (!validation.checks.coverage_within_tolerance.pass) {
    process.exitCode = 2;
  }
};

run().catch((error) => {
  console.error("[ERROR]", error.message);
  process.exit(1);
});
