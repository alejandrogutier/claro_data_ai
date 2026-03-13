import { useEffect, useState } from "react";
import { Row, Col, Card, Alert, Spin, Descriptions } from "antd";
import { type MonitorOverviewResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { PageHeader } from "../components/shared/PageHeader";
import { KpiCard } from "../components/shared/KpiCard";
import { SeverityTag } from "../components/shared/SeverityTag";

const fmt = (v: number) => `${v.toFixed(2)}%`;
const fmtScore = (v: number) => v.toFixed(2);

export const MonitorOverviewPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<MonitorOverviewResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        setOverview(await client.getMonitorOverview());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const v = (fn: (o: MonitorOverviewResponse) => string) =>
    loading ? "..." : overview ? fn(overview) : "--";

  return (
    <section>
      <PageHeader
        title="Overview de Monitoreo"
        subtitle="KPIs de negocio (V1 news-only, ventana fija de 7 dias) para salud de marca y competencia."
      />

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      {overview?.totals.insufficient_data && (
        <Alert
          type="warning"
          showIcon
          title="Datos insuficientes para alta confianza de KPI (menos de 20 items clasificados)."
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <KpiCard title="BHS" value={v((o) => fmtScore(o.totals.bhs))} caption="Formula v1" />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard title="SOV Claro" value={v((o) => fmt(o.totals.sov_claro))} caption="vs competencia" />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard title="Sentimiento neto" value={v((o) => fmt(o.totals.sentimiento_neto))} caption="positivo-negativo" />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard title="Riesgo activo" value={v((o) => fmt(o.totals.riesgo_activo))} caption="porcentaje negativo" />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <Card size="small">
              <div style={{ fontSize: 13, color: "#5c6370", marginBottom: 8 }}>Severidad</div>
              {loading ? "..." : overview ? <SeverityTag severity={overview.totals.severidad} /> : "--"}
              <div style={{ fontSize: 13, color: "#5c6370", marginTop: 8 }}>umbral de riesgo</div>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title="Scope Claro">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Items">{v((o) => String(o.by_scope.claro.items))}</Descriptions.Item>
                <Descriptions.Item label="Clasificados">{v((o) => String(o.by_scope.claro.classified_items))}</Descriptions.Item>
                <Descriptions.Item label="Sentimiento neto">{v((o) => fmt(o.by_scope.claro.sentimiento_neto))}</Descriptions.Item>
                <Descriptions.Item label="SOV">{v((o) => fmt(o.by_scope.claro.sov))}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Scope Competencia">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Items">{v((o) => String(o.by_scope.competencia.items))}</Descriptions.Item>
                <Descriptions.Item label="Clasificados">{v((o) => String(o.by_scope.competencia.classified_items))}</Descriptions.Item>
                <Descriptions.Item label="Sentimiento neto">{v((o) => fmt(o.by_scope.competencia.sentimiento_neto))}</Descriptions.Item>
                <Descriptions.Item label="SOV">{v((o) => fmt(o.by_scope.competencia.sov))}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>

        <Card title="Diagnostico" style={{ marginTop: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Items sin scope">{v((o) => String(o.diagnostics.unscoped_items))}</Descriptions.Item>
            <Descriptions.Item label="Sentimientos desconocidos">{v((o) => String(o.diagnostics.unknown_sentiment_items))}</Descriptions.Item>
            <Descriptions.Item label="Fuente / ventana">{v((o) => `${o.source_type} / ${o.window_days}d`)}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Spin>
    </section>
  );
};
