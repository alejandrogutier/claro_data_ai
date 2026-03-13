import { useEffect, useMemo, useState } from "react";
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
  Select,
  Spin,
  Space,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined, LinkOutlined } from "@ant-design/icons";
import { ApiError, type ConfigQuery, type NewsFeedResponse, type OriginType } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { PageHeader } from "../components/shared/PageHeader";

const { Text, Paragraph } = Typography;

const PAGE_LIMIT = 20;

const originColor = (origin: string): string => {
  switch (origin) {
    case "news": return "blue";
    case "awario": return "purple";
    default: return "default";
  }
};

export const NewsFeedPage = () => {
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
  const [tagFilter, setTagFilter] = useState("");

  const selectedQuery = useMemo(
    () => queries.find((query) => query.id === selectedQueryId) ?? null,
    [queries, selectedQueryId]
  );

  const loadFeed = async (options: { append: boolean }) => {
    if (!selectedQueryId) {
      setItems([]);
      setNextCursor(null);
      setHasNext(false);
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
        tag: tagFilter.trim() || undefined
      });

      setItems((current) => (options.append ? [...current, ...(response.items ?? [])] : response.items ?? []));
      setNextCursor(response.page_info?.next_cursor ?? null);
      setHasNext(Boolean(response.page_info?.has_next));
    } catch (feedError) {
      if (feedError instanceof ApiError && feedError.status === 409) {
        setError("La query seleccionada no tiene vinculo Awario activo.");
      } else {
        setError((feedError as Error).message);
      }
      if (!options.append) {
        setItems([]);
        setNextCursor(null);
        setHasNext(false);
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
        const response = await client.listConfigQueries({ limit: 200, is_active: true });
        const activeQueries = (response.items ?? []).filter((query) => query.is_active);
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
  }, []);

  useEffect(() => {
    void loadFeed({ append: false });
  }, [selectedQueryId, originFilter, tagFilter]);

  return (
    <section>
      <PageHeader
        title="Feed de Noticias por Query"
        subtitle="Feed unificado (news + awario) deduplicado por URL y paginado."
      />

      {error ? (
        <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Row gutter={[16, 0]} align="bottom">
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Query activa">
                <Select
                  value={selectedQueryId || undefined}
                  onChange={(value) => setSelectedQueryId(value)}
                  disabled={loadingQueries || queries.length === 0}
                  placeholder="No hay queries activas"
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
            <Col xs={24} sm={6} md={4}>
              <Form.Item>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void loadFeed({ append: false })}
                  disabled={!selectedQueryId || loadingFeed}
                >
                  Refrescar
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Row gutter={[16, 0]} align="bottom">
            <Col xs={24} sm={8} md={6}>
              <Form.Item label="Origen">
                <Select value={originFilter} onChange={(value) => setOriginFilter(value)} style={{ width: "100%" }}>
                  <Select.Option value="all">all</Select.Option>
                  <Select.Option value="news">news</Select.Option>
                  <Select.Option value="awario">awario</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Form.Item label="Tag">
                <Input
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  placeholder="origin:news o provider:newsapi"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {selectedQuery && selectedQuery.awario_link_status !== "linked" ? (
        <Alert
          type="warning"
          showIcon
          title="La query seleccionada esta bloqueada hasta vincular una alerta Awario."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {loadingFeed ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin tip="Cargando feed..." size="large">
            <div style={{ padding: 50 }} />
          </Spin>
        </Flex>
      ) : null}

      {!loadingFeed && selectedQuery && items.length === 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <Empty description="No hay resultados para la query seleccionada." />
        </Card>
      ) : null}

      <Row gutter={[16, 16]}>
        {items.map((item) => (
          <Col xs={24} sm={12} lg={8} key={item.id}>
            <Card
              actions={[
                <a href={item.canonical_url} target="_blank" rel="noreferrer" key="open">
                  <LinkOutlined /> Abrir fuente
                </a>,
              ]}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>{item.provider}</Text>
              <Space wrap style={{ marginTop: 4, marginBottom: 8 }}>
                <Tag color={originColor(item.origin)}>{item.origin}</Tag>
                {item.medium ? <Tag>medio:{item.medium}</Tag> : null}
              </Space>
              <Card.Meta
                title={item.title}
                description={
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>{item.published_at ?? item.created_at}</Text>
                    <Paragraph style={{ marginTop: 8, marginBottom: 0 }} ellipsis={{ rows: 4 }}>
                      {item.summary ?? "Sin resumen disponible."}
                    </Paragraph>
                  </>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      {hasNext ? (
        <Flex justify="center" style={{ marginTop: 16 }}>
          <Button onClick={() => void loadFeed({ append: true })} loading={loadingMore}>
            {loadingMore ? "Cargando..." : "Cargar mas"}
          </Button>
        </Flex>
      ) : null}
    </section>
  );
};
