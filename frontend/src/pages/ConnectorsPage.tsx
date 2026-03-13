import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Col, Empty, Input, Row, Select, Space, Spin, Statistic, Table, Typography } from "antd";
import { ReloadOutlined, PlayCircleOutlined, SaveOutlined, LinkOutlined } from "@ant-design/icons";
import { type AwarioAlertBinding, type Connector, type ConnectorSyncRun } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

const toRunLabel = (run: ConnectorSyncRun): string => {
  const started = run.started_at ?? run.created_at;
  return `${run.status} | ${started}`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const awarioColumns: ColumnsType<AwarioAlertBinding> = [
  {
    title: "alert_id",
    dataIndex: "awario_alert_id",
    key: "awario_alert_id",
  },
  {
    title: "estado",
    dataIndex: "status",
    key: "status",
    render: (text: string) => <StatusTag status={text} />,
  },
  {
    title: "sync_state",
    dataIndex: "sync_state",
    key: "sync_state",
    render: (text: string) => <StatusTag status={text} />,
  },
  {
    title: "ultimo sync",
    key: "last_sync_at",
    render: (_: unknown, record: AwarioAlertBinding) => formatDateTime(record.last_sync_at),
  },
  {
    title: "error",
    dataIndex: "last_sync_error",
    key: "last_sync_error",
    render: (text: string | null) => text ?? "-",
  },
];

const runColumns: ColumnsType<ConnectorSyncRun> = [
  {
    title: "Run",
    key: "label",
    render: (_: unknown, record: ConnectorSyncRun) => <strong>{toRunLabel(record)}</strong>,
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    render: (text: string) => <StatusTag status={text} />,
  },
  {
    title: "Error",
    dataIndex: "error",
    key: "error",
    render: (text: string | null) => <Text type={text ? "danger" : "secondary"}>{text ?? "-"}</Text>,
  },
  {
    title: "Metrics",
    key: "metrics",
    render: (_: unknown, record: ConnectorSyncRun) => (
      <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>
        {JSON.stringify(record.metrics ?? {}, null, 2)}
      </pre>
    ),
  },
];

export const ConnectorsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [runs, setRuns] = useState<ConnectorSyncRun[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>("");
  const [frequencyDraft, setFrequencyDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const [awarioBindings, setAwarioBindings] = useState<AwarioAlertBinding[]>([]);
  const [loadingAwario, setLoadingAwario] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId]
  );

  const awarioSummary = useMemo(() => {
    const total = awarioBindings.length;
    const active = awarioBindings.filter((item) => item.status === "active").length;
    const pendingBackfill = awarioBindings.filter((item) => item.sync_state === "pending_backfill" || item.sync_state === "backfilling").length;
    const withError = awarioBindings.filter((item) => item.sync_state === "error").length;
    return { total, active, pendingBackfill, withError };
  }, [awarioBindings]);

  const loadConnectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConnectors(100);
      const items = response.items ?? [];
      setConnectors(items);
      setFrequencyDraft(
        items.reduce<Record<string, number>>((acc, item) => {
          acc[item.id] = item.frequency_minutes;
          return acc;
        }, {})
      );
      setSelectedConnectorId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items[0]?.id ?? "";
      });
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async (connectorId: string) => {
    if (!connectorId) {
      setRuns([]);
      return;
    }

    setLoadingRuns(true);
    try {
      const response = await client.listConnectorRuns(connectorId, 20);
      setRuns(response.items ?? []);
    } catch (runsError) {
      setError((runsError as Error).message);
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  };

  const loadAwarioConfig = async () => {
    setLoadingAwario(true);
    try {
      const bindingsResponse = await client.listAwarioBindings(200);
      setAwarioBindings(bindingsResponse.items ?? []);
    } catch (awarioError) {
      setError((awarioError as Error).message);
      setAwarioBindings([]);
    } finally {
      setLoadingAwario(false);
    }
  };

  useEffect(() => {
    void loadConnectors();
    void loadAwarioConfig();
  }, []);

  useEffect(() => {
    void loadRuns(selectedConnectorId);
  }, [selectedConnectorId]);

  const updateConnector = async (connector: Connector, patch: { enabled?: boolean; frequency_minutes?: number }) => {
    if (!canOperate) return;
    setError(null);
    try {
      const updated = await client.patchConnector(connector.id, patch);
      setConnectors((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFrequencyDraft((current) => ({
        ...current,
        [updated.id]: updated.frequency_minutes
      }));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  const syncConnector = async (connectorId: string) => {
    if (!canOperate) return;
    setError(null);
    try {
      await client.triggerConnectorSync(connectorId);
      await Promise.all([loadConnectors(), loadRuns(connectorId), loadAwarioConfig()]);
    } catch (syncError) {
      setError((syncError as Error).message);
    }
  };

  return (
    <section>
      <PageHeader
        title="Configuracion de Conectores"
        subtitle="Operacion de salud, frecuencia y corridas manuales. La vinculacion Awario se gestiona desde Configuracion de Queries."
      />

      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}

      <Card
        title="Conectores"
        style={{ marginBottom: 16 }}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void loadConnectors()} disabled={loading}>
            Recargar
          </Button>
        }
      >
        <Spin spinning={loading}>
          {!loading && connectors.length === 0 ? (
            <Empty description="Sin conectores configurados." />
          ) : (
            <Row gutter={[16, 16]}>
              {connectors.map((connector) => (
                <Col xs={24} key={connector.id}>
                  <Card size="small" type="inner">
                    <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                      <Col>
                        <Space>
                          <strong>{connector.provider}</strong>
                          <StatusTag status={connector.enabled ? "active" : "inactive"} />
                          <StatusTag status={connector.health_status} />
                        </Space>
                      </Col>
                    </Row>

                    <Space size="large" wrap style={{ marginBottom: canOperate ? 8 : 0 }}>
                      <Text>Frecuencia: {connector.frequency_minutes} min</Text>
                      <Text>Ultimo sync: {formatDateTime(connector.last_sync_at)}</Text>
                      <Text>p95: {connector.latency_p95_ms ?? "n/a"} ms</Text>
                    </Space>

                    {canOperate ? (
                      <Row gutter={8} align="middle" style={{ marginTop: 8 }}>
                        <Col>
                          <Button
                            onClick={() =>
                              void updateConnector(connector, {
                                enabled: !connector.enabled
                              })
                            }
                          >
                            {connector.enabled ? "Deshabilitar" : "Habilitar"}
                          </Button>
                        </Col>
                        <Col>
                          <Space.Compact>
                            <Input
                              type="number"
                              min={5}
                              max={1440}
                              value={frequencyDraft[connector.id] ?? connector.frequency_minutes}
                              onChange={(event) =>
                                setFrequencyDraft((current) => ({
                                  ...current,
                                  [connector.id]: Number.parseInt(event.target.value || String(connector.frequency_minutes), 10)
                                }))
                              }
                              style={{ width: 110 }}
                              addonBefore="min"
                            />
                            <Button
                              icon={<SaveOutlined />}
                              onClick={() =>
                                void updateConnector(connector, {
                                  frequency_minutes: frequencyDraft[connector.id] ?? connector.frequency_minutes
                                })
                              }
                            >
                              Guardar
                            </Button>
                          </Space.Compact>
                        </Col>
                        <Col>
                          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void syncConnector(connector.id)}>
                            Ejecutar sync
                          </Button>
                        </Col>
                      </Row>
                    ) : null}
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </Card>

      <Card
        title="Runs del conector"
        style={{ marginBottom: 16 }}
        extra={
          <Select
            value={selectedConnectorId || undefined}
            onChange={(value) => setSelectedConnectorId(value)}
            style={{ minWidth: 200 }}
            placeholder="Selecciona conector"
            options={connectors.map((connector) => ({
              value: connector.id,
              label: connector.provider,
            }))}
          />
        }
      >
        {selectedConnector ? (
          <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            Historial para <strong>{selectedConnector.provider}</strong>
          </Text>
        ) : null}

        <Spin spinning={loadingRuns}>
          {!loadingRuns && runs.length === 0 ? (
            <Empty description="Sin ejecuciones registradas." />
          ) : (
            <Table<ConnectorSyncRun>
              dataSource={runs}
              columns={runColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          )}
        </Spin>
      </Card>

      <Card
        title="Awario (operativo)"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadAwarioConfig()} disabled={loadingAwario}>
              Recargar
            </Button>
            <Link to="/app/config/queries?tab=awario">
              <Button type="primary" icon={<LinkOutlined />}>
                Ir a Vinculacion Awario
              </Button>
            </Link>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Vista read-only para estado operativo. La vinculacion y reintentos se hacen en Configuracion de Queries.
        </Text>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="Bindings" value={awarioSummary.total} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="Activos" value={awarioSummary.active} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="Backfill pendiente" value={awarioSummary.pendingBackfill} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="Con error" value={awarioSummary.withError} />
            </Card>
          </Col>
        </Row>

        <Spin spinning={loadingAwario}>
          {!loadingAwario && awarioBindings.length === 0 ? (
            <Empty description="Sin bindings configurados." />
          ) : (
            <Table<AwarioAlertBinding>
              dataSource={awarioBindings.slice(0, 50)}
              columns={awarioColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          )}
        </Spin>
      </Card>
    </section>
  );
};
