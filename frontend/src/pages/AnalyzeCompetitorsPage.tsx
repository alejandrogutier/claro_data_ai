import { useEffect, useState } from "react";
import { Row, Col, Card, Alert, Spin, Table, Button, Descriptions, Empty } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { type AnalyzeCompetitorsResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { PageHeader } from "../components/shared/PageHeader";
import { SeverityTag } from "../components/shared/SeverityTag";

const fmt = (v: number) => `${v.toFixed(2)}%`;
const fmtScore = (v: number) => v.toFixed(2);

type CompetitorRow = AnalyzeCompetitorsResponse["competitors"][number];

const columns: ColumnsType<CompetitorRow> = [
  { title: "Competidor", dataIndex: "term_name", key: "name" },
  { title: "Items", dataIndex: "items", key: "items", align: "right" },
  { title: "SOV", key: "sov", align: "right", render: (_, r) => fmt(r.sov) },
  { title: "Sentimiento neto", key: "sentiment", align: "right", render: (_, r) => fmt(r.sentimiento_neto) },
  { title: "Riesgo", key: "risk", align: "right", render: (_, r) => fmt(r.riesgo_activo) },
  { title: "BHS", key: "bhs", align: "right", render: (_, r) => fmtScore(r.bhs) },
  { title: "Severidad", key: "severity", render: (_, r) => <SeverityTag severity={r.severidad} /> },
];

export const AnalyzeCompetitorsPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyzeCompetitorsResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await client.getAnalyzeCompetitors(50));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hasPartialData = Boolean(payload?.competitors?.some((i) => i.insufficient_data));

  return (
    <section>
      <PageHeader
        title="Benchmark Competencia"
        subtitle="Comparativo de SOV, riesgo y sentimiento contra el set cerrado de competidores activos."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Refrescar
          </Button>
        }
      />

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      {hasPartialData && (
        <Alert
          type="warning"
          showIcon
          title="Hay competidores con datos insuficientes en la ventana actual."
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading}>
        {payload && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card title="Baseline Claro">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Items">{payload.baseline_claro.items}</Descriptions.Item>
                  <Descriptions.Item label="SOV">{fmt(payload.baseline_claro.sov)}</Descriptions.Item>
                  <Descriptions.Item label="Sentimiento neto">{fmt(payload.baseline_claro.sentimiento_neto)}</Descriptions.Item>
                  <Descriptions.Item label="BHS">{fmtScore(payload.baseline_claro.bhs)}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Resumen de universo">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Competidores activos">{payload.totals.competitor_terms}</Descriptions.Item>
                  <Descriptions.Item label="Items totales">{payload.totals.items}</Descriptions.Item>
                  <Descriptions.Item label="Clasificados">{payload.totals.classified_items}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
        )}

        <Card>
          <Table<CompetitorRow>
            columns={columns}
            dataSource={payload?.competitors ?? []}
            rowKey="term_id"
            pagination={false}
            size="middle"
            locale={{ emptyText: <Empty description="No hay datos de competidores en la ventana actual." /> }}
          />
        </Card>
      </Spin>
    </section>
  );
};
