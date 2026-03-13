import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Descriptions, Flex, Row, Space, Statistic, Typography } from "antd";
import { ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { type Connector, type MetaResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

const { Text, Paragraph } = Typography;

const countByState = (meta: MetaResponse | null, state: string): number =>
  meta?.states?.find((entry) => entry.value === state)?.count ?? 0;

export const AlertsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unhealthy = useMemo(
    () => connectors.filter((connector) => connector.health_status === "offline" || connector.health_status === "degraded"),
    [connectors]
  );

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [metaResponse, connectorsResponse] = await Promise.all([client.getMeta(), client.listConnectors(100)]);
      setMeta(metaResponse);
      setConnectors(connectorsResponse.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const triggerSync = async (connectorId: string) => {
    if (!canOperate) return;
    setError(null);
    try {
      await client.triggerConnectorSync(connectorId);
      await load();
    } catch (syncError) {
      setError((syncError as Error).message);
    }
  };

  return (
    <section>
      <PageHeader
        title="Reglas de Alertas (Base)"
        subtitle="Base funcional no-stub: indicadores operativos y accion manual sobre conectores criticos."
      />

      {error && (
        <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Contenido oculto"
              value={loading ? "..." : countByState(meta, "hidden")}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Contenido archivado"
              value={loading ? "..." : countByState(meta, "archived")}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Conectores en riesgo"
              value={loading ? "..." : unhealthy.length}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Conectores con accion sugerida"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={loading}>
            Refrescar
          </Button>
        }
      >
        {loading && <Paragraph>Cargando indicadores...</Paragraph>}
        {!loading && connectors.length === 0 && <Paragraph>No hay conectores configurados.</Paragraph>}

        {!loading && connectors.length > 0 && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {connectors.map((connector) => (
              <Card key={connector.id} size="small" type="inner">
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                  <Text strong>{connector.provider}</Text>
                  <Space>
                    <StatusTag status={connector.enabled ? "enabled" : "disabled"} color={connector.enabled ? "green" : "default"} />
                    <StatusTag status={connector.health_status} />
                  </Space>
                </Flex>
                <Descriptions size="small" column={{ xs: 1, sm: 3 }}>
                  <Descriptions.Item label="ultima sync">{connector.last_sync_at ?? "n/a"}</Descriptions.Item>
                  <Descriptions.Item label="freq">{connector.frequency_minutes} min</Descriptions.Item>
                  <Descriptions.Item label="error">{connector.last_error ?? "none"}</Descriptions.Item>
                </Descriptions>

                {canOperate && (
                  <div style={{ marginTop: 8 }}>
                    <Button icon={<SyncOutlined />} onClick={() => void triggerSync(connector.id)}>
                      Ejecutar sync correctivo
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </section>
  );
};
