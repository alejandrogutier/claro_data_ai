import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Row, Col, Card, Alert, Spin, Descriptions, Button, Space, Empty } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from "@ant-design/icons";
import { type AnalyzeOverviewResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { PageHeader } from "../components/shared/PageHeader";
import { KpiCard } from "../components/shared/KpiCard";

const fmt = (v: number) => `${v.toFixed(2)}%`;
const fmtScore = (v: number) => v.toFixed(2);
const fmtDelta = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

const deltaColor = (v: number) =>
  v > 0 ? "#1f8f4e" : v < 0 ? "#e30613" : "#5c6370";

const DeltaIcon = ({ value }: { value: number }) =>
  value > 0 ? (
    <ArrowUpOutlined style={{ color: "#1f8f4e" }} />
  ) : value < 0 ? (
    <ArrowDownOutlined style={{ color: "#e30613" }} />
  ) : (
    <MinusOutlined style={{ color: "#5c6370" }} />
  );

export const AnalyzeOverviewPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnalyzeOverviewResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        setOverview(await client.getAnalyzeOverview());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const hasData = (overview?.totals.items ?? 0) > 0;

  return (
    <section>
      <PageHeader
        title="Analisis Overview Marca"
        subtitle="Comparativo de ventana actual (7 dias) vs periodo anterior para detectar variaciones de riesgo y reputacion."
        extra={
          <Space>
            <Link to="/app/analyze/channel">
              <Button>Ver por Canal</Button>
            </Link>
            <Link to="/app/analyze/competitors">
              <Button>Benchmark Competencia</Button>
            </Link>
          </Space>
        }
      />

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      {overview?.totals.insufficient_data && (
        <Alert
          type="warning"
          showIcon
          title="Datos parciales: menos de 20 items clasificados para una lectura robusta."
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading}>
        {!loading && !error && !hasData && (
          <Card>
            <Empty description="Sin datos activos en la ventana de 7 dias para generar analisis." />
          </Card>
        )}

        {overview && hasData && (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard
                  title="BHS (actual)"
                  value={fmtScore(overview.totals.bhs)}
                  caption={`Anterior: ${fmtScore(overview.previous_totals.bhs)}`}
                />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard
                  title="Sentimiento neto"
                  value={fmt(overview.totals.sentimiento_neto)}
                  caption={`Anterior: ${fmt(overview.previous_totals.sentimiento_neto)}`}
                />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard
                  title="Riesgo activo"
                  value={fmt(overview.totals.riesgo_activo)}
                  caption={`Anterior: ${fmt(overview.previous_totals.riesgo_activo)}`}
                />
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <KpiCard
                  title="SOV Claro"
                  value={fmt(overview.totals.sov_claro)}
                  caption={`Anterior: ${fmt(overview.previous_totals.sov_claro)}`}
                />
              </Col>
            </Row>

            <Card
              title="Variacion vs periodo anterior"
              extra={<span style={{ color: "#5c6370" }}>Formula: {overview.formula_version}</span>}
              style={{ marginTop: 16 }}
            >
              <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                <Descriptions.Item label="Items">
                  <span style={{ color: deltaColor(overview.delta.items) }}>
                    <DeltaIcon value={overview.delta.items} /> {fmtDelta(overview.delta.items)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Clasificados">
                  <span style={{ color: deltaColor(overview.delta.classified_items) }}>
                    <DeltaIcon value={overview.delta.classified_items} /> {fmtDelta(overview.delta.classified_items)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Sentimiento neto">
                  <span style={{ color: deltaColor(overview.delta.sentimiento_neto) }}>
                    <DeltaIcon value={overview.delta.sentimiento_neto} /> {fmtDelta(overview.delta.sentimiento_neto)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="BHS">
                  <span style={{ color: deltaColor(overview.delta.bhs) }}>
                    <DeltaIcon value={overview.delta.bhs} /> {fmtDelta(overview.delta.bhs)}
                  </span>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={12}>
                <Card title="Scope Claro">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Items">{overview.by_scope.claro.items}</Descriptions.Item>
                    <Descriptions.Item label="Riesgo">{fmt(overview.by_scope.claro.riesgo_activo)}</Descriptions.Item>
                    <Descriptions.Item label="BHS">{fmtScore(overview.by_scope.claro.bhs)}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="Scope Competencia">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Items">{overview.by_scope.competencia.items}</Descriptions.Item>
                    <Descriptions.Item label="Riesgo">{fmt(overview.by_scope.competencia.riesgo_activo)}</Descriptions.Item>
                    <Descriptions.Item label="BHS">{fmtScore(overview.by_scope.competencia.bhs)}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Spin>
    </section>
  );
};
