import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppStoreError, createAppStore, type TermRecord, type UpdateTermInput } from "../../data/appStore";
import { getRole, hasRole } from "../../core/auth";
import { json, parseBody } from "../../core/http";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CreateTermBody = {
  name?: unknown;
  language?: unknown;
  max_articles_per_run?: unknown;
};

type UpdateTermBody = {
  name?: unknown;
  language?: unknown;
  is_active?: unknown;
  max_articles_per_run?: unknown;
};

const toApiTerm = (term: TermRecord) => ({
  id: term.id,
  name: term.name,
  language: term.language,
  is_active: term.isActive,
  max_articles_per_run: term.maxArticlesPerRun,
  created_at: term.createdAt.toISOString(),
  updated_at: term.updatedAt.toISOString()
});

const parseLimit = (value: string | undefined): number | null => {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > 200) return null;
  return parsed;
};

const normalizeName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 160) return null;
  return normalized;
};

const normalizeLanguage = (value: unknown): string | null => {
  if (value === undefined) return "es";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 8) return null;
  return normalized;
};

const normalizeMaxArticles = (value: unknown): number | null => {
  if (value === undefined) return 100;
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < 1 || normalized > 500) return null;
  return normalized;
};

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "conflict") {
      return json(409, {
        error: "term_conflict",
        message: error.message
      });
    }

    if (error.code === "validation") {
      return json(422, {
        error: "validation_error",
        message: error.message
      });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
};

export const listTerms = async (event: APIGatewayProxyEventV2) => {
  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit);
  if (limit === null) {
    return json(422, {
      error: "validation_error",
      message: "limit must be an integer between 1 and 200"
    });
  }

  const cursor = query.cursor ?? undefined;

  try {
    const result = await store.listTerms(limit, cursor);
    return json(200, {
      items: result.items.map(toApiTerm),
      page_info: {
        next_cursor: result.nextCursor,
        has_next: result.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createTerm = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede crear terminos" });
  }

  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const body = parseBody<CreateTermBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  const name = normalizeName(body.name);
  const language = normalizeLanguage(body.language);
  const maxArticlesPerRun = normalizeMaxArticles(body.max_articles_per_run);

  if (!name || !language || maxArticlesPerRun === null) {
    return json(422, {
      error: "validation_error",
      message: "name (2-160), language (1-8) y max_articles_per_run (1-500) son requeridos"
    });
  }

  try {
    const term = await store.createTerm({
      name,
      language,
      maxArticlesPerRun
    });

    return json(201, toApiTerm(term));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const updateTerm = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede editar terminos" });
  }

  const id = event.pathParameters?.id;
  if (!id || !UUID_REGEX.test(id)) {
    return json(422, {
      error: "validation_error",
      message: "id debe ser UUID valido"
    });
  }

  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const body = parseBody<UpdateTermBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  const update: UpdateTermInput = {};

  if (body.name !== undefined) {
    const name = normalizeName(body.name);
    if (!name) {
      return json(422, {
        error: "validation_error",
        message: "name debe tener entre 2 y 160 caracteres"
      });
    }
    update.name = name;
  }

  if (body.language !== undefined) {
    const language = normalizeLanguage(body.language);
    if (!language) {
      return json(422, {
        error: "validation_error",
        message: "language debe tener entre 1 y 8 caracteres"
      });
    }
    update.language = language;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return json(422, {
        error: "validation_error",
        message: "is_active debe ser boolean"
      });
    }
    update.isActive = body.is_active;
  }

  if (body.max_articles_per_run !== undefined) {
    const maxArticlesPerRun = normalizeMaxArticles(body.max_articles_per_run);
    if (maxArticlesPerRun === null) {
      return json(422, {
        error: "validation_error",
        message: "max_articles_per_run debe estar entre 1 y 500"
      });
    }
    update.maxArticlesPerRun = maxArticlesPerRun;
  }

  if (Object.keys(update).length === 0) {
    return json(422, {
      error: "validation_error",
      message: "No fields to update"
    });
  }

  try {
    const term = await store.updateTerm(id, update);
    if (!term) {
      return json(404, {
        error: "not_found",
        message: "Termino no encontrado"
      });
    }

    return json(200, toApiTerm(term));
  } catch (error) {
    return mapStoreError(error);
  }
};
