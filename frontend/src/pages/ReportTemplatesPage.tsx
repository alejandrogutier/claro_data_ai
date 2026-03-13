import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Flex, Form, Input, InputNumber, Row, Select, Space, Switch, Typography } from "antd";
import { ReloadOutlined, EditOutlined } from "@ant-design/icons";
import {
  ApiError,
  type CreateReportTemplateRequest,
  type ReportTemplate,
  type UpdateReportTemplateRequest
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

export const ReportTemplatesPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<ReportTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [thresholdDraft, setThresholdDraft] = useState("0.65");
  const [isActiveDraft, setIsActiveDraft] = useState(true);
  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedTemplate = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const hydrateDraft = (template: ReportTemplate | null) => {
    if (!template) {
      setNameDraft("");
      setDescriptionDraft("");
      setThresholdDraft("0.65");
      setIsActiveDraft(true);
      return;
    }

    setNameDraft(template.name ?? "");
    setDescriptionDraft(template.description ?? "");
    setThresholdDraft(typeof template.confidence_threshold === "number" ? String(template.confidence_threshold) : "0.65");
    setIsActiveDraft(Boolean(template.is_active));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const response = await client.listReportTemplates(200);
      const templates = response.items ?? [];
      setItems(templates);
      setSelectedId((current) => {
        if (current && templates.some((template) => template.id === current)) return current;
        return templates[0]?.id ?? "";
      });

      if (templates.length === 0) {
        setUiState("empty");
      } else if (templates.some((template) => !template.is_active)) {
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
    hydrateDraft(selectedTemplate);
  }, [selectedTemplate]);

  const saveCreate = async () => {
    if (!canManage) return;

    const thresholdValue = Number.parseFloat(thresholdDraft);
    if (!nameDraft.trim() || Number.isNaN(thresholdValue)) {
      setError("name y confidence_threshold son obligatorios");
      setUiState("error_non_retriable");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateReportTemplateRequest = {
        name: nameDraft.trim(),
        description: descriptionDraft.trim() || undefined,
        is_active: isActiveDraft,
        confidence_threshold: thresholdValue,
        sections: {
          blocks: ["kpi", "incidents", "top_content"]
        },
        filters: {}
      };

      await client.createReportTemplate(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveUpdate = async () => {
    if (!canManage || !selectedTemplate) return;

    const thresholdValue = Number.parseFloat(thresholdDraft);
    if (!nameDraft.trim() || Number.isNaN(thresholdValue)) {
      setError("name y confidence_threshold son obligatorios");
      setUiState("error_non_retriable");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateReportTemplateRequest = {
        name: nameDraft.trim(),
        description: descriptionDraft.trim() || null,
        is_active: isActiveDraft,
        confidence_threshold: thresholdValue
      };

      await client.patchReportTemplate(selectedTemplate.id, payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Plantillas de Reporte"
        subtitle="CRUD base de plantillas para corridas manuales y programadas del modulo CLARO-035."
      />

      {uiState === "loading" && (
        <Alert type="info" showIcon title="loading: consultando plantillas..." style={{ marginBottom: 12 }} />
      )}
      {uiState === "empty" && (
        <Alert type="info" showIcon title="empty: no hay plantillas configuradas todavia." style={{ marginBottom: 12 }} />
      )}
      {uiState === "partial_data" && (
        <Alert type="warning" showIcon title="partial_data: existen plantillas inactivas en el catalogo." style={{ marginBottom: 12 }} />
      )}
      {uiState === "permission_denied" && (
        <Alert type="error" showIcon title="permission_denied: solo Admin puede modificar plantillas." style={{ marginBottom: 12 }} />
      )}
      {uiState === "error_retriable" && (
        <Alert type="error" showIcon title={`error_retriable: ${error ?? "intenta nuevamente"}`} style={{ marginBottom: 12 }} />
      )}
      {uiState === "error_non_retriable" && (
        <Alert type="error" showIcon title={`error_non_retriable: ${error ?? "revisa los datos"}`} style={{ marginBottom: 12 }} />
      )}
      {!canManage && (
        <Alert type="info" showIcon title="Tu rol tiene lectura. Solo Admin puede crear/editar plantillas." style={{ marginBottom: 12 }} />
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
            {items.map((template) => (
              <Card key={template.id} size="small" type="inner">
                <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                  <Text strong>{template.name}</Text>
                  <StatusTag status={template.is_active ? "active" : "inactive"} />
                </Flex>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  {template.description ?? "Sin descripcion"}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  threshold: {template.confidence_threshold}
                </Text>
                <div style={{ marginTop: 8 }}>
                  <Button icon={<EditOutlined />} onClick={() => setSelectedId(template.id)}>
                    Editar
                  </Button>
                </div>
              </Card>
            ))}
          </Space>
        ) : null}
      </Card>

      <Card
        title={selectedTemplate ? "Editar plantilla" : "Crear plantilla"}
        extra={<Text>{selectedTemplate ? selectedTemplate.id : "nueva"}</Text>}
      >
        <Form layout="vertical">
          <Row gutter={16}>
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
              <Form.Item label="Threshold de confianza (0..1)">
                <InputNumber
                  value={thresholdDraft ? Number(thresholdDraft) : undefined}
                  onChange={(value) => setThresholdDraft(value != null ? String(value) : "")}
                  min={0}
                  max={1}
                  step={0.01}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Estado">
                <Switch
                  checked={isActiveDraft}
                  onChange={(checked) => setIsActiveDraft(checked)}
                  checkedChildren="active"
                  unCheckedChildren="inactive"
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Descripcion">
                <Input.TextArea
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  maxLength={600}
                  rows={4}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Flex gap={8}>
          {!selectedTemplate ? (
            <Button type="primary" disabled={!canManage || saving} onClick={() => void saveCreate()}>
              {saving ? "Guardando..." : "Crear plantilla"}
            </Button>
          ) : (
            <Button type="primary" disabled={!canManage || saving} onClick={() => void saveUpdate()}>
              {saving ? "Guardando..." : "Actualizar plantilla"}
            </Button>
          )}
          <Button
            onClick={() => {
              setSelectedId("");
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
