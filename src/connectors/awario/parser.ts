export type AwarioChannel = "facebook" | "instagram" | "linkedin" | "tiktok" | "unknown";

const KNOWN_PATH_TOKENS = new Set([
  "posts",
  "post",
  "videos",
  "video",
  "reel",
  "reels",
  "p",
  "permalink",
  "watch",
  "photos",
  "photo",
  "story"
]);

const trimTrailingSlashes = (value: string): string => {
  const trimmed = value.replace(/\/+$/g, "");
  return trimmed.length > 0 ? trimmed : "/";
};

export const normalizeAwarioUrl = (value: string | null | undefined): string | null => {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const pathname = trimTrailingSlashes(parsed.pathname || "/");
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}`;
  } catch {
    return null;
  }
};

export const mapAwarioSourceToChannel = (source: string | null | undefined): AwarioChannel => {
  if (!source) return "unknown";
  const normalized = source.trim().toLowerCase();
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("instagram")) return "instagram";
  if (normalized.includes("linkedin")) return "linkedin";
  if (normalized.includes("tiktok")) return "tiktok";
  return "unknown";
};

const looksLikeExternalId = (value: string): boolean => /^[a-zA-Z0-9_.-]{5,}$/.test(value);

const pickParentIdFromPath = (segments: string[]): string | null => {
  for (let i = 0; i < segments.length; i += 1) {
    const token = segments[i]?.toLowerCase();
    if (!token) continue;
    if (!KNOWN_PATH_TOKENS.has(token)) continue;
    const candidate = segments[i + 1];
    if (candidate && looksLikeExternalId(candidate)) {
      return candidate;
    }
  }

  const candidates = segments.filter((segment) => looksLikeExternalId(segment)).sort((a, b) => b.length - a.length);
  return candidates[0] ?? null;
};

export type ParsedAwarioCommentUrl = {
  parentExternalPostId: string | null;
  externalCommentId: string | null;
  externalReplyCommentId: string | null;
  normalizedParentUrl: string | null;
};

export const extractAwarioCommentIdsFromUrl = (value: string | null | undefined): ParsedAwarioCommentUrl => {
  if (!value || typeof value !== "string") {
    return {
      parentExternalPostId: null,
      externalCommentId: null,
      externalReplyCommentId: null,
      normalizedParentUrl: null
    };
  }

  try {
    const parsed = new URL(value.trim());
    const params = parsed.searchParams;

    const externalCommentId = params.get("comment_id") || params.get("commentId") || null;
    const externalReplyCommentId = params.get("reply_comment_id") || params.get("replyCommentId") || null;

    const parentFromParams =
      params.get("parent_post_id") ||
      params.get("post_id") ||
      params.get("story_fbid") ||
      params.get("fbid") ||
      params.get("id") ||
      null;

    const pathSegments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    const parentExternalPostId = parentFromParams && looksLikeExternalId(parentFromParams)
      ? parentFromParams
      : pickParentIdFromPath(pathSegments);

    const normalizedParentUrl = normalizeAwarioUrl(`${parsed.protocol}//${parsed.host}${parsed.pathname}`);

    return {
      parentExternalPostId,
      externalCommentId,
      externalReplyCommentId,
      normalizedParentUrl
    };
  } catch {
    return {
      parentExternalPostId: null,
      externalCommentId: null,
      externalReplyCommentId: null,
      normalizedParentUrl: normalizeAwarioUrl(value)
    };
  }
};
