import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Flex, Form, Input, Row, Select, Space, Switch, Typography } from "antd";
import { ReloadOutlined, EditOutlined, PlayCircleOutlined } from "@ant-design/icons";
import {
  ApiError,
  type CreateReportScheduleRequest,
  type ReportSchedule,
  type ReportScheduleFrequency,
  type ReportTemplate,
  type UpdateReportScheduleRequest
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

const { Text, Paragraph } = Typography;

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const weekdayLabels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export const ReportsSchedulesPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canOperate = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [items, setItems] = useState<ReportSchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [templateIdDraft, setTemplateIdDraft] = useState<string>("");
  const [nameDraft, setNameDraft] = useState("");
  const [enabledDraft, setEnabledDraft] = useState(true);
  const [frequencyDraft, setFrequencyDraft] = useState<ReportScheduleFrequency>("daily");
  const [dayOfWeekDraft, setDayOfWeekDraft] = useState<number | "">("");
  const [timeDraft, setTimeDraft] = useState("08:00");
  const [timezoneDraft, setTimezoneDraft] = useState("America/Bogota");
  const [recipientsDraft, setRecipientsDraft] = useState("");
  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedSchedule = useMemo(
    () => items.find((item) => item.id === selectedScheduleId) ?? null,
    [items, selectedScheduleId]
  );

  const hydrateDraft = (schedule: ReportSchedule | null) => {
    if (!schedule) {
      setNameDraft("");
      setEnabledDraft(true);
      setFrequencyDraft("daily");
      setDayOfWeekDraft("");
      setTimeDraft("08:00");
      setTimezoneDraft("America/Bogota");
      setRecipientsDraft("");
      return;
    }

    setTemplateIdDraft(schedule.template_id);
    setNameDraft(schedule.name);
    setEnabledDraft(Boolean(schedule.enabled));
    setFrequencyDraft(schedule.frequency);
    setDayOfWeekDraft(typeof schedule.day_of_week === "number" ? schedule.day_of_week : "");
    setTimeDraft(schedule.time_local);
    setTimezoneDraft(schedule.timezone || "America/Bogota");
    setRecipientsDraft((schedule.recipients ?? []).join(", "));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const [templatesResponse, schedulesResponse] = await Promise.all([
        client.listReportTemplates(200),
        client.listReportSchedules(200)
      ]);

      const templateItems = templatesResponse.items ?? [];
      const scheduleItems = schedulesResponse.items ?? [];

      setTemplates(templateItems);
      setItems(scheduleItems);
      setTemplateIdDraft((current) => {
        if (current && templateItems.some((item) => item.id === current)) return current;
        return templateItems[0]?.id ?? "";
      });
      setSelectedScheduleId((current) => {
        if (current && scheduleItems.some((item) => item.id === current)) return current;
        return scheduleItems[0]?.id ?? "";
      });

      if (scheduleItems.length === 0) {
        setUiState("empty");
      } else if (scheduleItems.some((item) => item.enabled === false)) {
        setUiState("partial_data");
      } else {
        setUiState("idle");
      }
    } catch (loadError) {
      setError((loadError as Error).message);
      setUiState(toUiStateFromError(loadError));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    hydrateDraft(selectedSchedule);
  }, [selectedSchedule]);

  const parseRecipients = (): string[] =>
    recipientsDraft
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const saveCreate = async () => {
    if (!canOperate || !templateIdDraft || !nameDraft.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const payload: CreateReportScheduleRequest = {
        template_id: templateIdDraft,
        name: nameDraft.trim(),
        enabled: enabledDraft,
        frequency: frequencyDraft,
        day_of_week: frequencyDraft === "weekly" ? (typeof dayOfWeekDraft === "number" ? dayOfWeekDraft : null) : null,
        time_local: timeDraft,
        timezone: timezoneDraft,
        recipients: parseRecipients()
      };

      await client.createReportSchedule(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveUpdate = async () => {
    if (!canOperate || !selectedSchedule) return;

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateReportScheduleRequest = {
        name: nameDraft.trim(),
        enabled: enabledDraft,
        frequency: frequencyDraft,
        day_of_week: frequencyDraft === "weekly" ? (typeof dayOfWeekDraft === "number" ? dayOfWeekDraft : null) : null,
        time_local: timeDraft,
        timezone: timezoneDraft,
        recipients: parseRecipients()
      };

      await client.patchReportSchedule(selectedSchedule.id, payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const triggerRun = async (scheduleId: string) => {
    if (!canOperate) return;

    setSaving(true);
    setError(null);

    try {
      await client.triggerReportScheduleRun(scheduleId);
      await load();
    } catch (runError) {
      setError((runError as Error).message);
      setUiState(toUiStateFromError(runError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Programacion de Reportes"
        subtitle="Schedules de ejecucion (`daily|weekly`) con trigger manual y destinatarios para correo SES verificado."
      />

      {uiState === "loading" && (
        <Alert type="info" showIcon title="loading: consultando schedules..." style={{ marginBottom: 12 }} />
      )}
      {uiState === "empty" && (
        <Alert type="info" showIcon title="empty: no hay schedules configurados." style={{ marginBottom: 12 }} />
      )}
      {uiState === "partial_data" && (
        <Alert type="warning" showIcon title="partial_data: hay schedules deshabilitados." style={{ marginBottom: 12 }} />
      )}
      {uiState === "permission_denied" && (
        <Alert type="error" showIcon title="permission_denied: solo Analyst/Admin puede operar schedules." style={{ marginBottom: 12 }} />
      )}
      {uiState === "error_retriable" && (
        <Alert type="error" showIcon title={`error_retriable: ${error ?? "intenta nuevamente"}`} style={{ marginBottom: 12 }} />
      )}
      {uiState === "error_non_retriable" && (
        <Alert type="error" showIcon title={`error_non_retriable: ${error ?? "revisa los datos"}`} style={{ marginBottom: 12 }} />
      )}
      {!canOperate && (
        <Alert type="info" showIcon title="Tu rol tiene lectura para schedules." style={{ marginBottom: 12 }} />
      )}

      <Card
        title="Listado"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {items.length > 0 ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {items.map((schedule) => (
              <Card key={schedule.id} size="small" type="inner">
                <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                  <Text strong>{schedule.name}</Text>
                  <StatusTag status={schedule.enabled ? "enabled" : "disabled"} color={schedule.enabled ? "green" : "default"} />
                </Flex>
                <Paragraph type="secondary" style={{ margin: "0 0 4px 0" }}>
                  {schedule.template_name} | {schedule.frequency}
                  {typeof schedule.day_of_week === "number" ? ` (${weekdayLabels[schedule.day_of_week]})` : ""} | {schedule.time_local}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  next: {schedule.next_run_at}
                </Text>
                <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                  <Button icon={<EditOutlined />} onClick={() => setSelectedScheduleId(schedule.id)}>
                    Editar
                  </Button>
                  <Button type="primary" icon={<PlayCircleOutlined />} disabled={!canOperate || saving} onClick={() => void triggerRun(schedule.id)}>
                    Run manual
                  </Button>
                </Flex>
              </Card>
            ))}
          </Space>
        ) : null}
      </Card>

      <Card
        title={selectedSchedule ? "Editar schedule" : "Crear schedule"}
        extra={<Text>{selectedSchedule ? selectedSchedule.id : "nuevo"}</Text>}
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Plantilla">
                <Select
                  value={templateIdDraft}
                  onChange={(value) => setTemplateIdDraft(value)}
                  disabled={Boolean(selectedSchedule)}
                  style={{ width: "100%" }}
                  options={templates.map((template) => ({
                    value: template.id,
                    label: template.name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Nombre">
                <Input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  maxLength={120}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Frecuencia">
                <Select
                  value={frequencyDraft}
                  onChange={(value) => setFrequencyDraft(value as ReportScheduleFrequency)}
                  style={{ width: "100%" }}
                  options={[
                    { value: "daily", label: "daily" },
                    { value: "weekly", label: "weekly" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Dia semana (0-6)">
                <Select
                  value={dayOfWeekDraft}
                  onChange={(value) => setDayOfWeekDraft(value === "" ? "" : value)}
                  style={{ width: "100%" }}
                  options={[
                    { value: "", label: "n/a" },
                    ...weekdayLabels.map((label, index) => ({
                      value: index,
                      label: `${index} - ${label}`,
                    })),
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Hora local (HH:mm)">
                <Input
                  value={timeDraft}
                  onChange={(event) => setTimeDraft(event.target.value)}
                  placeholder="08:00"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Zona horaria">
                <Input
                  value={timezoneDraft}
                  onChange={(event) => setTimezoneDraft(event.target.value)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Estado">
                <Switch
                  checked={enabledDraft}
                  onChange={(checked) => setEnabledDraft(checked)}
                  checkedChildren="enabled"
                  unCheckedChildren="disabled"
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Recipients (coma)">
                <Input.TextArea
                  value={recipientsDraft}
                  onChange={(event) => setRecipientsDraft(event.target.value)}
                  rows={3}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Flex gap={8}>
          {!selectedSchedule ? (
            <Button type="primary" disabled={!canOperate || saving || !templateIdDraft} onClick={() => void saveCreate()}>
              {saving ? "Guardando..." : "Crear schedule"}
            </Button>
          ) : (
            <Button type="primary" disabled={!canOperate || saving} onClick={() => void saveUpdate()}>
              {saving ? "Guardando..." : "Actualizar schedule"}
            </Button>
          )}
          <Button
            onClick={() => {
              setSelectedScheduleId("");
              hydrateDraft(null);
            }}
          >
            Limpiar
          </Button>
        </Flex>
      </Card>
    </section>
  );
};
