import { useEffect, useState } from "react";
import { Card, Alert, Spin, Table, Button, Empty } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { type AnalyzeChannelResponse } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { PageHeader } from "../components/shared/PageHeader";
import { SeverityTag } from "../components/shared/SeverityTag";

const fmt = (v: number) => `${v.toFixed(2)}%`;
const fmtScore = (v: number) => v.toFixed(2);

type ChannelRow = AnalyzeChannelResponse["items"][number];

const columns: ColumnsType<ChannelRow> = [
  { title: "Canal", dataIndex: "provider", key: "provider" },
  { title: "Items", dataIndex: "items", key: "items", align: "right" },
  { title: "Clasificados", dataIndex: "classified_items", key: "classified", align: "right" },
  { title: "Sentimiento neto", key: "sentiment", align: "right", render: (_, r) => fmt(r.sentimiento_neto) },
  { title: "Riesgo", key: "risk", align: "right", render: (_, r) => fmt(r.riesgo_activo) },
  { title: "BHS", key: "bhs", align: "right", render: (_, r) => fmtScore(r.bhs) },
  { title: "Severidad", key: "severity", render: (_, r) => <SeverityTag severity={r.severidad} /> },
  {
    title: "Top categorias",
    key: "categories",
    render: (_, r) =>
      r.top_categories.map((c) => `${c.value} (${c.count})`).join(", ") || "n/a",
  },
];

export const AnalyzeChannelPage = () => {
  const client = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyzeChannelResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await client.getAnalyzeChannel(30));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hasPartialData = Boolean(payload?.items?.some((i) => i.insufficient_data));

  return (
    <section>
      <PageHeader
        title="Analisis por Canal"
        subtitle="Desglose operativo por proveedor para sentimiento, riesgo y calidad de senal."
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
          title="Hay canales con datos insuficientes para confianza alta."
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title="Resumen de canales"
        extra={
          payload && (
            <span style={{ color: "#5c6370" }}>
              {payload.totals.providers} proveedores | {payload.totals.items} items
            </span>
          )
        }
      >
        <Spin spinning={loading}>
          <Table<ChannelRow>
            columns={columns}
            dataSource={payload?.items ?? []}
            rowKey="provider"
            pagination={false}
            size="middle"
            locale={{ emptyText: <Empty description="Sin datos por canal en la ventana actual." /> }}
          />
        </Spin>
      </Card>
    </section>
  );
};
