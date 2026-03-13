import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { LinkOutlined, ReloadOutlined, ClearOutlined } from "@ant-design/icons";
import { ApiError, type ConfigQuery, type NewsFeedResponse, type OriginType, type TermScope } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { PageHeader } from "../components/shared/PageHeader";
import { SentimentTag } from "../components/shared/SentimentTag";

const { Text, Paragraph } = Typography;

type MonitorFeedPageProps = {
  scope: TermScope;
  title: string;
  subtitle: string;
};

type FeedViewMode = "table" | "cards";

const PAGE_LIMIT = 20;
const VIEW_MODE_STORAGE_PREFIX = "monitor-feed:view-mode";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short"
});

const getViewModeStorageKey = (scope: TermScope) => `${VIEW_MODE_STORAGE_PREFIX}:${scope}`;

const readStoredViewMode = (scope: TermScope): FeedViewMode => {
  if (typeof window === "undefined") return "table";
  const stored = window.localStorage.getItem(getViewModeStorageKey(scope));
  return stored === "cards" ? "cards" : "table";
};

const relativeDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffH = (Date.now() - d.getTime()) / 3600000;
  if (diffH < 1) return `hace ${Math.max(1, Math.round(diffH * 60))} min`;
  if (diffH < 24) return `hace ${Math.round(diffH)}h`;
  if (diffH < 48) return "ayer";
  return null;
};

const extractDomain = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "dominio desconocido";
  }
};

const formatFeedDate = (item: NewsFeedResponse["items"][number]): { label: "Publicacion" | "Detectado"; value: string } => {
  const rawValue = item.published_at ?? item.created_at;
  const parsed = new Date(rawValue);
  const fallback = rawValue ?? "n/a";
  return {
    label: item.published_at ? "Publicacion" : "Detectado",
    value: Number.isNaN(parsed.getTime()) ? fallback : DATE_FORMATTER.format(parsed)
  };
};

const truncate = (value: string | null | undefined, max = 220): string => {
  const normalized = value?.trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
};

const normalizeToken = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

const shouldShowMediumChip = (item: NewsFeedResponse["items"][number]): boolean => {
  const medium = normalizeToken(item.medium);
  if (!medium) return false;

  const provider = normalizeToken(item.provider);
  const origin = normalizeToken(item.origin);
  return medium !== provider && medium !== origin;
};

const originColor = (origin: string): string => {
  switch (origin) {
    case "news": return "blue";
    case "awario": return "purple";
    default: return "default";
  }
};

export const MonitorFeedPage = ({ scope, title, subtitle }: MonitorFeedPageProps) => {
  const client = useApiClient();

  const [queries, setQueries] = useState<ConfigQuery[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  const [items, setItems] = useState<NewsFeedResponse["items"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<OriginType | "all">("all");
  const [mediumFilter, setMediumFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sentimientoFilter, setSentimientoFilter] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [viewMode, setViewMode] = useState<FeedViewMode>(() => readStoredViewMode(scope));
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const selectedQuery = useMemo(
    () => queries.find((query) => query.id === selectedQueryId) ?? null,
    [queries, selectedQueryId]
  );

  const isSelectedQueryBlocked = selectedQuery?.awario_link_status !== "linked";

  const hasActiveFilters = originFilter !== "all" || mediumFilter.trim().length > 0 || tagFilter.trim().length > 0 || sentimientoFilter.trim().length > 0 || categoriaFilter.trim().length > 0;

  useEffect(() => {
    setViewMode(readStoredViewMode(scope));
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getViewModeStorageKey(scope), viewMode);
  }, [scope, viewMode]);

  const loadFeed = async (options: { append: boolean }) => {
    if (!selectedQueryId) {
      setItems([]);
      setNextCursor(null);
      setHasNext(false);
      return;
    }

    const selected = queries.find((query) => query.id === selectedQueryId) ?? null;
    if (selected && selected.awario_link_status !== "linked") {
      setItems([]);
      setNextCursor(null);
      setHasNext(false);
      setExpandedRows({});
      return;
    }

    const cursor = options.append ? nextCursor ?? undefined : undefined;
    if (options.append && !cursor) return;

    if (options.append) {
      setLoadingMore(true);
    } else {
      setLoadingFeed(true);
    }
    setError(null);

    try {
      const response = await client.listNewsFeed(selectedQueryId, {
        limit: PAGE_LIMIT,
        cursor,
        origin: originFilter === "all" ? undefined : originFilter,
        medium: mediumFilter.trim() || undefined,
        tag: tagFilter.trim() || undefined,
        sentimiento: sentimientoFilter.trim() || undefined,
        categoria: categoriaFilter.trim() || undefined
      });

      setItems((current) => (options.append ? [...current, ...(response.items ?? [])] : response.items ?? []));
      setNextCursor(response.page_info?.next_cursor ?? null);
      setHasNext(Boolean(response.page_info?.has_next));
      if (!options.append) {
        setExpandedRows({});
      }
    } catch (feedError) {
      if (feedError instanceof ApiError && feedError.status === 409) {
        setError("La query seleccionada esta bloqueada: falta vinculo Awario activo.");
      } else {
        setError((feedError as Error).message);
      }
      if (!options.append) {
        setItems([]);
        setNextCursor(null);
        setHasNext(false);
        setExpandedRows({});
      }
    } finally {
      if (options.append) {
        setLoadingMore(false);
      } else {
        setLoadingFeed(false);
      }
    }
  };

  useEffect(() => {
    const loadQueries = async () => {
      setLoadingQueries(true);
      setError(null);
      try {
        const response = await client.listConfigQueries({
          limit: 200,
          scope,
          is_active: true
        });
        const activeQueries = (response.items ?? []).filter((query) => query.is_active && query.scope === scope);
        setQueries(activeQueries);
        setSelectedQueryId((current) => {
          if (current && activeQueries.some((query) => query.id === current)) return current;
          const linked = activeQueries.find((query) => query.awario_link_status === "linked");
          return linked?.id ?? activeQueries[0]?.id ?? "";
        });
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoadingQueries(false);
      }
    };

    void loadQueries();
  }, [client, scope]);

  useEffect(() => {
    void loadFeed({ append: false });
  }, [selectedQueryId, originFilter, mediumFilter, tagFilter, sentimientoFilter, categoriaFilter]);

  const onToggleRow = (itemId: string) => {
    setExpandedRows((current) => ({ ...current, [itemId]: !current[itemId] }));
  };

  const resetFilters = () => {
    setOriginFilter("all");
    setMediumFilter("");
    setTagFilter("");
    setSentimientoFilter("");
    setCategoriaFilter("");
  };

  const tableColumns = [
    {
      title: "Fecha",
      dataIndex: "id",
      key: "date",
      width: 160,
      render: (_: unknown, item: NewsFeedResponse["items"][number]) => {
        const date = formatFeedDate(item);
        const rel = relativeDate(item.published_at ?? item.created_at);
        return (
          <div>
            <Text strong>{rel ?? date.value}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{rel ? date.value : date.label}</Text>
          </div>
        );
      },
    },
    {
      title: "Titular",
      dataIndex: "title",
      key: "title",
      render: (_: unknown, item: NewsFeedResponse["items"][number]) => {
        const domain = extractDomain(item.canonical_url);
        return (
          <div>
            <Text strong>{item.title}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{domain}</Text>
            {item.categoria ? (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{item.categoria}</Text>
              </>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "Origen",
      dataIndex: "origin",
      key: "origin",
      width: 100,
      render: (origin: string) => <Tag color={originColor(origin)}>{origin}</Tag>,
    },
    {
      title: "Medio",
      dataIndex: "medium",
      key: "medium",
      width: 120,
      render: (medium: string | null) => medium ?? "-",
    },
    {
      title: "Fuente",
      dataIndex: "provider",
      key: "provider",
      width: 120,
    },
    {
      title: "Sentimiento",
      dataIndex: "sentimiento",
      key: "sentimiento",
      width: 110,
      render: (sentimiento: string | undefined) =>
        sentimiento ? <SentimentTag sentiment={sentimiento} /> : <Text type="secondary">--</Text>,
    },
    {
      title: "Accion",
      key: "action",
      width: 160,
      render: (_: unknown, item: NewsFeedResponse["items"][number]) => {
        const isExpanded = Boolean(expandedRows[item.id]);
        return (
          <Space>
            <a href={item.canonical_url} target="_blank" rel="noreferrer">
              Abrir
            </a>
            <Button size="small" onClick={() => onToggleRow(item.id)}>
              {isExpanded ? "Ocultar" : "Detalle"}
            </Button>
          </Space>
        );
      },
    },
  ];

  const expandedRowRender = (item: NewsFeedResponse["items"][number]) => {
    if (!expandedRows[item.id]) return null;
    return (
      <div style={{ padding: "8px 0" }}>
        <Space wrap style={{ marginBottom: 8 }}>
          {item.sentimiento ? <SentimentTag sentiment={item.sentimiento} /> : null}
          {item.categoria ? <Tag color="cyan">{item.categoria}</Tag> : null}
          {item.confianza != null ? <Tag>confianza: {Math.round(item.confianza * 100)}%</Tag> : null}
        </Space>
        <Paragraph style={{ margin: "8px 0" }}>
          {truncate(item.classification_resumen ?? item.summary ?? item.content, 600) || "Sin resumen disponible."}
        </Paragraph>
        <Space wrap>
          {(item.etiquetas ?? []).map((etiqueta) => (
            <Tag color="cyan" key={`${item.id}-etq-${etiqueta}`}>{etiqueta}</Tag>
          ))}
          {item.tags.map((tag) => (
            <Tag key={`${item.id}-${tag}`}>{tag}</Tag>
          ))}
        </Space>
      </div>
    );
  };

  return (
    <section>
      <PageHeader title={title} subtitle={subtitle} />

      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => void loadFeed({ append: false })} disabled={!selectedQueryId || loadingFeed}>
              Reintentar
            </Button>
          }
        />
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label={`Query activa (${scope})`}>
                <Select
                  value={selectedQueryId || undefined}
                  onChange={(value) => setSelectedQueryId(value)}
                  disabled={loadingQueries || queries.length === 0}
                  placeholder="No hay queries activas para este scope"
                  style={{ width: "100%" }}
                >
                  {queries.map((query) => (
                    <Select.Option key={query.id} value={query.id}>
                      {query.name} {query.awario_link_status === "linked" ? "" : "(bloqueada: falta Awario)"}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Origen">
                <Select value={originFilter} onChange={(value) => setOriginFilter(value)} style={{ width: "100%" }}>
                  <Select.Option value="all">all</Select.Option>
                  <Select.Option value="news">news</Select.Option>
                  <Select.Option value="awario">awario</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Medio">
                <Input
                  value={mediumFilter}
                  onChange={(event) => setMediumFilter(event.target.value)}
                  placeholder="facebook, web, instagram, x"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Tag">
                <Input
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  placeholder="origin:awario, medium:web"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Sentimiento">
                <Select value={sentimientoFilter} onChange={(value) => setSentimientoFilter(value)} style={{ width: "100%" }}>
                  <Select.Option value="">Todos</Select.Option>
                  <Select.Option value="positivo">Positivo</Select.Option>
                  <Select.Option value="neutro">Neutro</Select.Option>
                  <Select.Option value="negativo">Negativo</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Categoria">
                <Input
                  value={categoriaFilter}
                  onChange={(event) => setCategoriaFilter(event.target.value)}
                  placeholder="regulacion, competencia"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
          <Segmented
            options={[
              { label: "Tabla", value: "table" },
              { label: "Cards", value: "cards" },
            ]}
            value={viewMode}
            onChange={(value) => setViewMode(value as FeedViewMode)}
          />
          <Space>
            <Button icon={<ClearOutlined />} onClick={resetFilters} disabled={!hasActiveFilters}>
              Limpiar filtros
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadFeed({ append: false })} disabled={!selectedQueryId || loadingFeed}>
              Refrescar
            </Button>
          </Space>
        </Flex>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space split={<span style={{ color: "#d9d9d9" }}>|</span>}>
          <Text type="secondary">
            Estado vinculo: {selectedQuery ? (isSelectedQueryBlocked ? "missing_awario" : `linked (${selectedQuery.awario_sync_state ?? "-"})`) : "-"}
          </Text>
          <Text type="secondary">Resultados cargados: {items.length}</Text>
          <Text type="secondary">Cursor: {nextCursor ? "si" : "no"}</Text>
        </Space>
      </Card>

      {isSelectedQueryBlocked ? (
        <Alert
          type="warning"
          showIcon
          title="La query seleccionada esta bloqueada hasta vincular una alerta Awario."
          style={{ marginBottom: 16 }}
          action={
            <Link to="/app/config/queries">
              <Button size="small">Ir a Configuracion de Queries</Button>
            </Link>
          }
        />
      ) : null}

      {loadingFeed ? (
        <Card style={{ marginBottom: 16 }}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </Card>
      ) : null}

      {!loadingFeed && !isSelectedQueryBlocked && selectedQuery && items.length === 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <Empty description={hasActiveFilters ? "No hay resultados con los filtros actuales." : "No hay resultados para la query seleccionada."} />
        </Card>
      ) : null}

      {!loadingFeed && !isSelectedQueryBlocked && items.length > 0 && viewMode === "table" ? (
        <Card style={{ marginBottom: 16 }}>
          <Table
            dataSource={items}
            columns={tableColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 900 }}
            expandable={{
              expandedRowKeys: Object.entries(expandedRows)
                .filter(([, v]) => v)
                .map(([k]) => k),
              expandedRowRender,
              showExpandColumn: false,
            }}
          />
        </Card>
      ) : null}

      {!loadingFeed && !isSelectedQueryBlocked && items.length > 0 && viewMode === "cards" ? (
        <Row gutter={[16, 16]}>
          {items.map((item) => {
            const date = formatFeedDate(item);
            const summaryText = truncate(item.classification_resumen ?? item.summary ?? item.content, 220) || "Sin resumen disponible.";
            const rel = relativeDate(item.published_at ?? item.created_at);

            return (
              <Col xs={24} sm={12} lg={8} key={item.id}>
                <Card
                  cover={item.image_url ? <img src={item.image_url} alt="" loading="lazy" style={{ maxHeight: 180, objectFit: "cover" }} /> : undefined}
                  actions={[
                    <a href={item.canonical_url} target="_blank" rel="noreferrer" key="open">
                      <LinkOutlined /> Abrir fuente
                    </a>,
                  ]}
                >
                  <Space wrap style={{ marginBottom: 8 }}>
                    <Tag color={originColor(item.origin)}>{item.origin}</Tag>
                    {item.sentimiento ? <SentimentTag sentiment={item.sentimiento} /> : null}
                    {item.categoria ? <Tag color="cyan">{item.categoria}</Tag> : null}
                    {shouldShowMediumChip(item) ? <Tag>medio:{item.medium}</Tag> : null}
                  </Space>
                  <Card.Meta
                    title={item.title}
                    description={
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {rel ?? `${date.label}: ${date.value}`}
                          {rel ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{date.value}</span> : null}
                        </Text>
                        <Paragraph style={{ marginTop: 8, marginBottom: 0 }} ellipsis={{ rows: 4 }}>
                          {summaryText}
                        </Paragraph>
                        <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>{item.provider}</Text>
                      </>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : null}

      {!isSelectedQueryBlocked && hasNext ? (
        <Flex justify="center" style={{ marginTop: 16 }}>
          <Button onClick={() => void loadFeed({ append: true })} loading={loadingMore}>
            {loadingMore ? "Cargando..." : "Cargar mas"}
          </Button>
        </Flex>
      ) : null}
    </section>
  );
};
