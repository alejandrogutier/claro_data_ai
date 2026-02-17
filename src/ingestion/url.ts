export const canonicalizeUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";

    // Keep host/path stable for dedupe, avoid trailing slash variance.
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

export const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
