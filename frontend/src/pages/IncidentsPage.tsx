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
  List,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { type Incident, type IncidentNote, type IncidentSeverity, type IncidentStatus } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { SeverityTag } from "../components/shared/SeverityTag";
import { SlaTag } from "../components/shared/SlaTag";

const { Text, Paragraph } = Typography;

const STATUS_OPTIONS: IncidentStatus[] = ["open", "acknowledged", "in_progress", "resolved", "dismissed"];
const SEVERITY_OPTIONS: IncidentSeverity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];

const formatSla = (minutes: number): string => {
  if (minutes < 0) return `${Math.abs(minutes)}m vencido`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours <= 0) return `${remainingMinutes}m`;
  return `${hours}h ${remainingMinutes}m`;
};

const slaStatus = (minutes: number): string => {
  if (minutes < 0) return "overdue";
  if (minutes <= 30) return "critical";
  if (minutes <= 4 * 60) return "warning";
  return "ok";
};

const toStatusLabel = (status: IncidentStatus): string => {
  if (status === "in_progress") return "in progress";
  return status;
};

export const IncidentsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("");
  const [notes, setNotes] = useState<IncidentNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [filters, setFilters] = useState<{ status?: IncidentStatus; severity?: IncidentSeverity; scope?: "claro" | "competencia" }>({});
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [runningEvaluate, setRunningEvaluate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId]
  );

  const loadIncidents = async () => {
    setLoadingIncidents(true);
    setError(null);

    try {
      const response = await client.listMonitorIncidents({
        limit: 80,
        scope: filters.scope,
        severity: filters.severity,
        status: filters.status
      });
      const items = response.items ?? [];
      setIncidents(items);
      setSelectedIncidentId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items[0]?.id ?? "";
      });
    } catch (loadError) {
      setError((loadError as Error).message);
      setIncidents([]);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const loadNotes = async (incidentId: string) => {
    if (!incidentId) {
      setNotes([]);
      return;
    }

    setLoadingNotes(true);
    setError(null);

    try {
      const response = await client.listMonitorIncidentNotes(incidentId, 100);
      setNotes(response.items ?? []);
    } catch (notesError) {
      setError((notesError as Error).message);
      setNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
  }, [filters.scope, filters.severity, filters.status]);

  useEffect(() => {
    void loadNotes(selectedIncidentId);
  }, [selectedIncidentId]);

  const triggerEvaluation = async () => {
    if (!canOperate) return;
    setRunningEvaluate(true);
    setError(null);

    try {
      await client.evaluateMonitorIncidents();
      await loadIncidents();
    } catch (evaluateError) {
      setError((evaluateError as Error).message);
    } finally {
      setRunningEvaluate(false);
    }
  };

  const assignToMe = async (incidentId: string) => {
    if (!canOperate || !session?.sub) return;

    setError(null);
    try {
      await client.patchMonitorIncident(incidentId, { owner_user_id: session.sub });
      await Promise.all([loadIncidents(), loadNotes(incidentId)]);
    } catch (assignError) {
      setError((assignError as Error).message);
    }
  };

  const changeStatus = async (incidentId: string, status: IncidentStatus) => {
    if (!canOperate) return;

    setError(null);
    try {
      await client.patchMonitorIncident(incidentId, { status });
      await Promise.all([loadIncidents(), loadNotes(incidentId)]);
    } catch (statusError) {
      setError((statusError as Error).message);
    }
  };

  const submitNote = async () => {
    if (!canOperate || !selectedIncidentId) return;

    const trimmed = noteDraft.trim();
    if (!trimmed) return;

    setError(null);
    try {
      await client.createMonitorIncidentNote(selectedIncidentId, {
        note: trimmed
      });
      setNoteDraft("");
      await Promise.all([loadIncidents(), loadNotes(selectedIncidentId)]);
    } catch (noteError) {
      setError((noteError as Error).message);
    }
  };

  const incidentColumns = [
    {
      title: "Severidad",
      dataIndex: "severity",
      key: "severity",
      width: 100,
      render: (severity: string) => <SeverityTag severity={severity} />,
    },
    {
      title: "Scope",
      dataIndex: "scope",
      key: "scope",
      width: 110,
    },
    {
      title: "Owner",
      key: "owner",
      width: 160,
      render: (_: unknown, incident: Incident) =>
        incident.owner?.name ?? incident.owner?.email ?? incident.owner_user_id ?? "sin asignar",
    },
    {
      title: "Estado",
      key: "status",
      width: 150,
      render: (_: unknown, incident: Incident) =>
        canOperate ? (
          <Select
            value={incident.status}
            onChange={(value) => void changeStatus(incident.id, value as IncidentStatus)}
            size="small"
            style={{ width: 140 }}
          >
            {STATUS_OPTIONS.map((status) => (
              <Select.Option key={status} value={status}>
                {toStatusLabel(status)}
              </Select.Option>
            ))}
          </Select>
        ) : (
          <Text>{toStatusLabel(incident.status)}</Text>
        ),
    },
    {
      title: "SLA restante",
      key: "sla",
      width: 140,
      render: (_: unknown, incident: Incident) => (
        <Space>
          <SlaTag status={slaStatus(incident.sla_remaining_minutes)} />
          <Text>{formatSla(incident.sla_remaining_minutes)}</Text>
        </Space>
      ),
    },
    {
      title: "Actualizado",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 180,
    },
    {
      title: "Acciones",
      key: "actions",
      width: 180,
      render: (_: unknown, incident: Incident) => (
        <Space>
          <Button size="small" onClick={() => setSelectedIncidentId(incident.id)}>
            Ver
          </Button>
          {canOperate ? (
            <Button size="small" onClick={() => void assignToMe(incident.id)}>
              Asignarme
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        title="Incidentes y Alertas"
        subtitle="Triage operativo por scope (`claro|competencia`) con SLA visible y notas auditables."
      />

      {error ? (
        <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />
      ) : null}

      <Card
        title="Control de evaluacion"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void loadIncidents()}
            disabled={loadingIncidents}
          >
            Refrescar
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Form layout="vertical">
          <Row gutter={[16, 0]} align="bottom">
            <Col xs={24} sm={8} md={6}>
              <Form.Item label="Scope">
                <Select
                  value={filters.scope ?? ""}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      scope: (value as "claro" | "competencia" | "") || undefined
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <Select.Option value="">Todos</Select.Option>
                  <Select.Option value="claro">claro</Select.Option>
                  <Select.Option value="competencia">competencia</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Form.Item label="Severidad">
                <Select
                  value={filters.severity ?? ""}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      severity: (value as IncidentSeverity | "") || undefined
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <Select.Option value="">Todas</Select.Option>
                  {SEVERITY_OPTIONS.map((severity) => (
                    <Select.Option key={severity} value={severity}>
                      {severity}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Form.Item label="Estado">
                <Select
                  value={filters.status ?? ""}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      status: (value as IncidentStatus | "") || undefined
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <Select.Option value="">Todos</Select.Option>
                  {STATUS_OPTIONS.map((status) => (
                    <Select.Option key={status} value={status}>
                      {toStatusLabel(status)}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Form.Item>
                <Button
                  type="primary"
                  disabled={!canOperate || runningEvaluate}
                  loading={runningEvaluate}
                  onClick={() => void triggerEvaluation()}
                >
                  {runningEvaluate ? "Evaluando..." : "Evaluar incidentes"}
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card
        title="Incidentes"
        extra={
          <Text type="secondary">
            {loadingIncidents ? "Cargando..." : `${incidents.length} registros`}
          </Text>
        }
        style={{ marginBottom: 16 }}
      >
        {loadingIncidents ? (
          <Flex justify="center" style={{ padding: 32 }}>
            <Spin size="large" />
          </Flex>
        ) : incidents.length === 0 ? (
          <Empty description="No hay incidentes para los filtros seleccionados." />
        ) : (
          <Table
            dataSource={incidents}
            columns={incidentColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 1000 }}
            rowClassName={(record) => (selectedIncidentId === record.id ? "ant-table-row-selected" : "")}
          />
        )}
      </Card>

      <Card
        title="Notas del incidente"
        extra={
          <Text type="secondary">
            {selectedIncident ? `Incidente ${selectedIncident.id}` : "Selecciona un incidente"}
          </Text>
        }
        style={{ marginBottom: 16 }}
      >
        {loadingNotes ? (
          <Flex justify="center" style={{ padding: 32 }}>
            <Spin size="large" />
          </Flex>
        ) : null}

        {!loadingNotes && selectedIncident && notes.length === 0 ? (
          <Empty description="Sin notas registradas." />
        ) : null}

        {!loadingNotes && notes.length > 0 ? (
          <List
            dataSource={notes}
            renderItem={(note) => (
              <List.Item key={note.id}>
                <List.Item.Meta
                  title={
                    <Text strong>
                      {note.author.name ?? note.author.email ?? note.author_user_id}
                    </Text>
                  }
                  description={
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>{note.created_at}</Text>
                      <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>{note.note}</Paragraph>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        ) : null}

        {canOperate && selectedIncident ? (
          <div style={{ marginTop: 16 }}>
            <Form layout="vertical">
              <Form.Item label="Agregar nota">
                <Input.TextArea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Contexto, accion tomada y siguiente paso"
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" onClick={() => void submitNote()}>
                  Guardar nota
                </Button>
              </Form.Item>
            </Form>
          </div>
        ) : null}
      </Card>
    </section>
  );
};
