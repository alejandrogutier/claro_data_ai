import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { getRequestId, json, parseBody } from "../../core/http";
import { AppStoreError, createAppStore } from "../../data/appStore";
import { createQueryConfigStore, type QueryUpdateInput } from "../../data/queryConfigStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERM_SCOPES = ["claro", "competencia"] as const;

type TermScope = (typeof TERM_SCOPES)[number];

type CreateTermBody = {
  name?: unknown;
  language?: unknown;
  scope?: unknown;
  max_articles_per_run?: unknown;
};

type UpdateTermBody = {
  name?: unknown;
  language?: unknown;
  scope?: unknown;
  is_active?: unknown;
  max_articles_per_run?: unknown;
};

const withLegacyHeader = (response: ReturnType<typeof json>) => ({
  ...response,
  headers: {
    ...response.headers,
    "X-Legacy-Endpoint": "true"
  }
});

const toApiTerm = (term: {
  id: string;
  name: string;
  language: string;
  scope: TermScope;
  isActive: boolean;
  maxArticlesPerRun: number;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: term.id,
  name: term.name,
  language: term.language,
  scope: term.scope,
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

const normalizeScope = (value: unknown, fallback: TermScope = "claro"): TermScope | null => {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!TERM_SCOPES.includes(normalized as TermScope)) return null;
  return normalized as TermScope;
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
      return withLegacyHeader(
        json(409, {
          error: "term_conflict",
          message: error.message
        })
      );
    }

    if (error.code === "validation") {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: error.message
        })
      );
    }

    if (error.code === "not_found") {
      return withLegacyHeader(
        json(404, {
          error: "not_found",
          message: error.message
        })
      );
    }
  }

  return withLegacyHeader(
    json(500, {
      error: "internal_error",
      message: (error as Error).message
    })
  );
};

const assertStores = () => {
  const queryStore = createQueryConfigStore();
  const appStore = createAppStore();
  if (!queryStore || !appStore) {
    return {
      error: withLegacyHeader(
        json(500, {
          error: "misconfigured",
          message: "Database runtime is not configured"
        })
      )
    };
  }

  return { queryStore, appStore };
};

export const listTerms = async (event: APIGatewayProxyEventV2) => {
  const stores = assertStores();
  if (stores.error) return stores.error;

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit);
  if (limit === null) {
    return withLegacyHeader(
      json(422, {
        error: "validation_error",
        message: "limit must be an integer between 1 and 200"
      })
    );
  }

  let scope: TermScope | undefined;
  if (query.scope !== undefined) {
    const parsedScope = normalizeScope(query.scope, "claro");
    if (!parsedScope) {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: "scope must be one of: claro, competencia"
        })
      );
    }
    scope = parsedScope;
  }

  try {
    const result = await stores.queryStore.listQueries(limit, query.cursor, {
      scope,
      language: query.language,
      q: query.q
    });

    return withLegacyHeader(
      json(200, {
        items: result.items.map((item) =>
          toApiTerm({
            id: item.id,
            name: item.name,
            language: item.language,
            scope: item.scope,
            isActive: item.isActive,
            maxArticlesPerRun: item.maxArticlesPerRun,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          })
        ),
        page_info: {
          next_cursor: result.nextCursor,
          has_next: result.hasNext
        }
      })
    );
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createTerm = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return withLegacyHeader(json(403, { error: "forbidden", message: "Solo Admin puede crear terminos" }));
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  const body = parseBody<CreateTermBody>(event);
  if (!body) {
    return withLegacyHeader(
      json(400, {
        error: "invalid_json",
        message: "Body JSON invalido"
      })
    );
  }

  const name = normalizeName(body.name);
  const language = normalizeLanguage(body.language);
  const scope = normalizeScope(body.scope, "claro");
  const maxArticlesPerRun = normalizeMaxArticles(body.max_articles_per_run);

  if (!name || !language || !scope || maxArticlesPerRun === null) {
    return withLegacyHeader(
      json(422, {
        error: "validation_error",
        message: "name (2-160), language (1-8), scope (claro|competencia) y max_articles_per_run (1-500) son requeridos"
      })
    );
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const created = await stores.queryStore.createQuery(
      {
        name,
        language,
        scope,
        maxArticlesPerRun
      },
      actorUserId,
      getRequestId(event)
    );

    return withLegacyHeader(
      json(
        201,
        toApiTerm({
          id: created.id,
          name: created.name,
          language: created.language,
          scope: created.scope,
          isActive: created.isActive,
          maxArticlesPerRun: created.maxArticlesPerRun,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt
        })
      )
    );
  } catch (error) {
    return mapStoreError(error);
  }
};

export const updateTerm = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return withLegacyHeader(json(403, { error: "forbidden", message: "Solo Admin puede editar terminos" }));
  }

  const id = event.pathParameters?.id;
  if (!id || !UUID_REGEX.test(id)) {
    return withLegacyHeader(
      json(422, {
        error: "validation_error",
        message: "id debe ser UUID valido"
      })
    );
  }

  const stores = assertStores();
  if (stores.error) return stores.error;

  const body = parseBody<UpdateTermBody>(event);
  if (!body) {
    return withLegacyHeader(
      json(400, {
        error: "invalid_json",
        message: "Body JSON invalido"
      })
    );
  }

  const update: QueryUpdateInput = {};

  if (body.name !== undefined) {
    const name = normalizeName(body.name);
    if (!name) {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: "name debe tener entre 2 y 160 caracteres"
        })
      );
    }
    update.name = name;
  }

  if (body.language !== undefined) {
    const language = normalizeLanguage(body.language);
    if (!language) {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: "language debe tener entre 1 y 8 caracteres"
        })
      );
    }
    update.language = language;
  }

  if (body.scope !== undefined) {
    const scope = normalizeScope(body.scope, "claro");
    if (!scope) {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: "scope debe ser uno de: claro, competencia"
        })
      );
    }
    update.scope = scope;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: "is_active debe ser boolean"
        })
      );
    }
    update.isActive = body.is_active;
  }

  if (body.max_articles_per_run !== undefined) {
    const maxArticlesPerRun = normalizeMaxArticles(body.max_articles_per_run);
    if (maxArticlesPerRun === null) {
      return withLegacyHeader(
        json(422, {
          error: "validation_error",
          message: "max_articles_per_run debe estar entre 1 y 500"
        })
      );
    }
    update.maxArticlesPerRun = maxArticlesPerRun;
  }

  if (Object.keys(update).length === 0) {
    return withLegacyHeader(
      json(422, {
        error: "validation_error",
        message: "No fields to update"
      })
    );
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await stores.appStore.upsertUserFromPrincipal(principal);
    const updated = await stores.queryStore.updateQuery(id, update, actorUserId, getRequestId(event));

    return withLegacyHeader(
      json(
        200,
        toApiTerm({
          id: updated.id,
          name: updated.name,
          language: updated.language,
          scope: updated.scope,
          isActive: updated.isActive,
          maxArticlesPerRun: updated.maxArticlesPerRun,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt
        })
      )
    );
  } catch (error) {
    return mapStoreError(error);
  }
};
