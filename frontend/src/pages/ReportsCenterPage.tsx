import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Flex, Select, Space, Table, Typography } from "antd";
import { ReloadOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { ApiError, type ReportRun, type ReportRunStatus, type ReportTemplate } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

import type { ColumnsType } from "antd/es/table";

const { Text, Paragraph } = Typography;

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const REPORT_STATUSES: Array<ReportRunStatus | ""> = ["", "queued", "running", "completed", "pending_review", "failed"];

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const statusLabel = (status: ReportRunStatus): string => {
  if (status === "pending_review") return "pending review";
  return status;
};

export const ReportsCenterPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [items, setItems] = useState<ReportRun[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportRunStatus | "">("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const [center, templateResponse] = await Promise.all([
        client.listReportsCenter({ limit: 80, status: statusFilter || undefined }),
        client.listReportTemplates(200)
      ]);

      const runs = center.items ?? [];
      setItems(runs);
      const templateItems = templateResponse.items ?? [];
      setTemplates(templateItems);
      setSelectedTemplateId((current) => {
        if (current && templateItems.some((item) => item.id === current)) return current;
        return templateItems[0]?.id ?? "";
      });
      setSelectedRunId((current) => {
        if (current && runs.some((item) => item.id === current)) return current;
        return runs[0]?.id ?? "";
      });

      if (runs.length === 0) {
        setUiState("empty");
      } else if (runs.some((run) => run.status === "pending_review" || run.status === "failed")) {
        setUiState("partial_data");
      } else {
        setUiState("idle");
      }
    } catch (loadError) {
      setError((loadError as Error).message);
      setUiState(toUiStateFromError(loadError));
    }
  };

  const loadDetail = async (runId: string) => {
    if (!runId) {
      setDetail(null);
      return;
    }

    try {
      const response = await client.getReportRun(runId);
      setDetail(response as Record<string, unknown>);
    } catch (detailError) {
      setDetail(null);
      setError((detailError as Error).message);
      setUiState(toUiStateFromError(detailError));
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  useEffect(() => {
    void loadDetail(selectedRunId);
  }, [selectedRunId]);

  const triggerRun = async () => {
    if (!canOperate || !selectedTemplateId) return;

    setRunning(true);
    setError(null);

    try {
      await client.createReportRun({ template_id: selectedTemplateId });
      await load();
    } catch (runError) {
      setError((runError as Error).message);
      setUiState(toUiStateFromError(runError));
    } finally {
      setRunning(false);
    }
  };

  const columns: ColumnsType<ReportRun> = [
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: ReportRunStatus) => <StatusTag status={statusLabel(status)} />,
    },
    {
      title: "Plantilla",
      dataIndex: "template_name",
      key: "template_name",
    },
    {
      title: "Confianza",
      dataIndex: "confidence",
      key: "confidence",
      render: (confidence: number | undefined) =>
        typeof confidence === "number" ? `${(confidence * 100).toFixed(1)}%` : "n/a",
    },
    {
      title: "Creado",
      dataIndex: "created_at",
      key: "created_at",
    },
    {
      title: "Completado",
      dataIndex: "completed_at",
      key: "completed_at",
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "Export",
      key: "export",
      render: (_: unknown, run: ReportRun) =>
        run.download_url ? (
          <a href={run.download_url} target="_blank" rel="noreferrer">
            Descargar CSV
          </a>
        ) : (
          run.export_status ?? "-"
        ),
    },
    {
      title: "Accion",
      key: "action",
      render: (_: unknown, run: ReportRun) => (
        <Button onClick={() => setSelectedRunId(run.id)}>Ver detalle</Button>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        title="Centro de Reportes"
        subtitle="Historial operativo de corridas, estado editorial (`pending_review`) y descarga de exportes asociados."
      />

      {uiState === "loading" && (
        <Alert type="info" showIcon title="loading: consultando corridas de reportes..." style={{ marginBottom: 12 }} />
      )}
      {uiState === "empty" && (
        <Alert type="info" showIcon title="empty: aun no existen corridas de reportes." style={{ marginBottom: 12 }} />
      )}
      {uiState === "partial_data" && (
        <Alert type="warning" showIcon title="partial_data: hay corridas en `pending_review` o `failed`; revisar detalle antes de distribuir." style={{ marginBottom: 12 }} />
      )}
      {uiState === "permission_denied" && (
        <Alert type="error" showIcon title="permission_denied: tu rol no tiene acceso a este recurso." style={{ marginBottom: 12 }} />
      )}
      {uiState === "error_retriable" && (
        <Alert type="error" showIcon title={`error_retriable: ${error ?? "intenta nuevamente"}`} style={{ marginBottom: 12 }} />
      )}
      {uiState === "error_non_retriable" && (
        <Alert type="error" showIcon title={`error_non_retriable: ${error ?? "revisa la solicitud"}`} style={{ marginBottom: 12 }} />
      )}

      <Card
        title="Controles"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={running || uiState === "loading"}>
            Refrescar
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Flex gap={16} wrap="wrap" align="flex-end">
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>Estado</Text>
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as ReportRunStatus | "")}
              style={{ width: 200 }}
              options={REPORT_STATUSES.map((status) => ({
                value: status,
                label: status ? statusLabel(status) : "Todos",
              }))}
            />
          </div>

          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>Plantilla para corrida manual</Text>
            <Select
              value={selectedTemplateId}
              onChange={(value) => setSelectedTemplateId(value)}
              style={{ width: 260 }}
              options={templates.map((template) => ({
                value: template.id,
                label: template.name,
              }))}
            />
          </div>

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={!canOperate || running || !selectedTemplateId}
            onClick={() => void triggerRun()}
          >
            {running ? "Encolando..." : "Ejecutar corrida manual"}
          </Button>
        </Flex>
      </Card>

      <Card
        title="Historial"
        extra={<Text>{items.length} corridas</Text>}
        style={{ marginBottom: 16 }}
      >
        <Table<ReportRun>
          dataSource={items}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          rowClassName={(record) => (selectedRunId === record.id ? "ant-table-row-selected" : "")}
        />
      </Card>

      <Card
        title="Detalle de corrida"
        extra={<Text>{selectedRunId ? selectedRunId : "Selecciona una corrida"}</Text>}
      >
        {!detail ? (
          <Paragraph>Sin detalle cargado.</Paragraph>
        ) : (
          <pre style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, overflow: "auto", fontSize: 13 }}>
            {JSON.stringify(detail, null, 2)}
          </pre>
        )}
      </Card>
    </section>
  );
};
