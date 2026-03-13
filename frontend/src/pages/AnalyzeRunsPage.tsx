import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Empty, Form, Input, Row, Select, Space, Spin, Table, Typography } from "antd";
import { PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  ApiError,
  type AnalysisRun,
  type AnalysisRunScope,
  type AnalysisRunStatus,
  type AnalysisSourceType,
  type CreateAnalysisRunRequest
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const ANALYSIS_STATUSES: Array<AnalysisRunStatus | ""> = ["", "queued", "running", "completed", "failed"];
const ANALYSIS_SCOPES: Array<AnalysisRunScope | ""> = ["", "overview", "channel", "competitors", "custom"];

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const toIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const uiStateAlerts: Record<string, { type: "info" | "warning" | "error"; message: string } | null> = {
  loading: { type: "info", message: "loading: consultando corridas de analisis..." },
  empty: { type: "info", message: "empty: aun no existen corridas de analisis." },
  partial_data: { type: "warning", message: "partial_data: hay corridas `failed` en historial reciente." },
  permission_denied: { type: "error", message: "permission_denied: tu rol no tiene acceso." },
};

export const AnalyzeRunsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [items, setItems] = useState<AnalysisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [statusFilter, setStatusFilter] = useState<AnalysisRunStatus | "">("");
  const [scopeFilter, setScopeFilter] = useState<AnalysisRunScope | "">("");

  const [scopeDraft, setScopeDraft] = useState<AnalysisRunScope>("overview");
  const [sourceTypeDraft, setSourceTypeDraft] = useState<AnalysisSourceType>("news");
  const [promptDraft, setPromptDraft] = useState("analysis-v1");
  const [modelDraft, setModelDraft] = useState("");
  const [limitDraft, setLimitDraft] = useState("120");
  const [providerDraft, setProviderDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [sentimientoDraft, setSentimientoDraft] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");

  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const response = await client.listAnalysisHistory({
        limit: 80,
        status: statusFilter || undefined,
        scope: scopeFilter || undefined
      });
      const rows = response.items ?? [];
      setItems(rows);
      setSelectedRunId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? "";
      });

      if (rows.length === 0) {
        setUiState("empty");
      } else if (rows.some((row) => row.status === "failed")) {
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
      const response = await client.getAnalysisRun(runId);
      setDetail(response as Record<string, unknown>);
    } catch (detailError) {
      setDetail(null);
      setError((detailError as Error).message);
      setUiState(toUiStateFromError(detailError));
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, scopeFilter]);

  useEffect(() => {
    void loadDetail(selectedRunId);
  }, [selectedRunId]);

  const triggerRun = async () => {
    if (!canOperate) return;
    const parsedLimit = Number.parseInt(limitDraft, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      setUiState("error_non_retriable");
      setError("limit debe estar entre 1 y 500");
      return;
    }

    const payload: CreateAnalysisRunRequest = {
      scope: scopeDraft,
      source_type: sourceTypeDraft,
      trigger_type: "manual",
      prompt_version: promptDraft.trim() || "analysis-v1",
      model_id: modelDraft.trim() || undefined,
      limit: parsedLimit,
      filters: {
        provider: providerDraft.trim() || undefined,
        category: categoryDraft.trim() || undefined,
        sentimiento: sentimientoDraft.trim() || undefined,
        q: queryDraft.trim() || undefined,
        from: toIso(fromDraft),
        to: toIso(toDraft)
      }
    };

    setRunning(true);
    setError(null);

    try {
      const accepted = await client.createAnalysisRun(payload);
      await load();
      if (accepted.analysis_run_id) {
        setSelectedRunId(accepted.analysis_run_id);
      }
    } catch (runError) {
      setError((runError as Error).message);
      setUiState(toUiStateFromError(runError));
    } finally {
      setRunning(false);
    }
  };

  const historyColumns: ColumnsType<AnalysisRun> = [
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (text: string) => <StatusTag status={text} />,
    },
    {
      title: "Scope",
      dataIndex: "scope",
      key: "scope",
    },
    {
      title: "Input",
      dataIndex: "input_count",
      key: "input_count",
    },
    {
      title: "Modelo",
      dataIndex: "model_id",
      key: "model_id",
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
      render: (text: string | null) => text ?? "-",
    },
    {
      title: "Accion",
      key: "action",
      render: (_: unknown, record: AnalysisRun) => (
        <Button size="small" onClick={() => setSelectedRunId(record.id)}>
          Ver detalle
        </Button>
      ),
    },
  ];

  const renderUiAlert = () => {
    if (uiState === "error_retriable") {
      return <Alert type="error" showIcon title={`error_retriable: ${error ?? "intenta nuevamente"}`} style={{ marginBottom: 16 }} />;
    }
    if (uiState === "error_non_retriable") {
      return <Alert type="error" showIcon title={`error_non_retriable: ${error ?? "revisa la solicitud"}`} style={{ marginBottom: 16 }} />;
    }
    const alertConfig = uiStateAlerts[uiState];
    if (alertConfig) {
      return <Alert type={alertConfig.type} showIcon title={alertConfig.message} style={{ marginBottom: 16 }} />;
    }
    return null;
  };

  return (
    <section>
      <PageHeader
        title="Analysis Runs Async"
        subtitle="Disparo manual, historial y detalle de corridas `/v1/analysis/*` sobre worker SQS + Bedrock."
      />

      {renderUiAlert()}

      <Card
        title="Disparo manual"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            disabled={running || uiState === "loading"}
          >
            Refrescar historial
          </Button>
        }
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Scope">
                <Select
                  value={scopeDraft}
                  onChange={(value) => setScopeDraft(value)}
                  options={[
                    { value: "overview", label: "overview" },
                    { value: "channel", label: "channel" },
                    { value: "competitors", label: "competitors" },
                    { value: "custom", label: "custom" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Source Type">
                <Select
                  value={sourceTypeDraft}
                  onChange={(value) => setSourceTypeDraft(value)}
                  options={[
                    { value: "news", label: "news" },
                    { value: "social", label: "social" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Prompt Version">
                <Input value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Model ID (opcional)">
                <Input value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} placeholder="usa default runtime" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Limit">
                <Input type="number" min={1} max={500} value={limitDraft} onChange={(event) => setLimitDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Provider">
                <Input value={providerDraft} onChange={(event) => setProviderDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Category">
                <Input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Sentimiento">
                <Input value={sentimientoDraft} onChange={(event) => setSentimientoDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Query">
                <Input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="From">
                <Input type="datetime-local" value={fromDraft} onChange={(event) => setFromDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="To">
                <Input type="datetime-local" value={toDraft} onChange={(event) => setToDraft(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} style={{ display: "flex", alignItems: "flex-end" }}>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => void triggerRun()}
                  disabled={!canOperate || running}
                  loading={running}
                >
                  {running ? "Encolando..." : "Crear corrida"}
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card
        title="Historial"
        style={{ marginBottom: 16 }}
        extra={<Text type="secondary">{items.length} corridas</Text>}
      >
        <Space style={{ marginBottom: 16 }}>
          <Select
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            style={{ minWidth: 150 }}
            options={ANALYSIS_STATUSES.map((status) => ({
              value: status,
              label: status || "Todos",
            }))}
            placeholder="Filtro status"
          />
          <Select
            value={scopeFilter}
            onChange={(value) => setScopeFilter(value)}
            style={{ minWidth: 150 }}
            options={ANALYSIS_SCOPES.map((scope) => ({
              value: scope,
              label: scope || "Todos",
            }))}
            placeholder="Filtro scope"
          />
        </Space>

        <Spin spinning={uiState === "loading"}>
          {items.length > 0 ? (
            <Table<AnalysisRun>
              dataSource={items}
              columns={historyColumns}
              rowKey="id"
              pagination={false}
              size="small"
              rowClassName={(record) => (selectedRunId === record.id ? "ant-table-row-selected" : "")}
            />
          ) : (
            <Empty description="Sin corridas de analisis." />
          )}
        </Spin>
      </Card>

      <Card
        title="Detalle"
        extra={<Text type="secondary">{selectedRunId || "Selecciona una corrida"}</Text>}
      >
        {!detail ? (
          <Empty description="Sin detalle cargado." />
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 16, borderRadius: 6, fontSize: 12 }}>
            {JSON.stringify(detail, null, 2)}
          </pre>
        )}
      </Card>
    </section>
  );
};
