import { useEffect, useMemo, useState } from "react";
import { Card, Alert, Button, Form, Input, Row, Col, Flex, Table, Switch, Descriptions, Typography, Space } from "antd";
import { ReloadOutlined, PlusOutlined } from "@ant-design/icons";
import {
  ApiError,
  type CreateNotificationRecipientRequest,
  type NotificationEmailStatusResponse,
  type NotificationRecipient,
  type NotificationRecipientKind,
  type UpdateNotificationRecipientRequest
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

const { Text } = Typography;

type UiState = "idle" | "loading" | "empty" | "partial_data" | "permission_denied" | "error_retriable" | "error_non_retriable";

const toUiStateFromError = (error: unknown): UiState => {
  if (error instanceof ApiError) {
    if (error.status === 403) return "permission_denied";
    if (error.status >= 500) return "error_retriable";
    return "error_non_retriable";
  }
  return "error_retriable";
};

const renderRecipientEmail = (item: NotificationRecipient): string => item.email ?? item.email_masked ?? "(oculto)";

export const NotificationRecipientsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();

  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);
  const canView = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [kind, setKind] = useState<NotificationRecipientKind>("digest");
  const [scopeFilter, setScopeFilter] = useState("ops");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [items, setItems] = useState<NotificationRecipient[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const [emailDraft, setEmailDraft] = useState("");
  const [scopeDraft, setScopeDraft] = useState("ops");
  const [isActiveDraft, setIsActiveDraft] = useState(true);

  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sesStatus, setSesStatus] = useState<NotificationEmailStatusResponse | null>(null);
  const [sesError, setSesError] = useState<string | null>(null);

  const hydrateDraft = (item: NotificationRecipient | null) => {
    if (!item) {
      setEmailDraft("");
      setScopeDraft(scopeFilter.trim().toLowerCase() || "ops");
      setIsActiveDraft(true);
      return;
    }

    setEmailDraft((item.email ?? "").trim());
    setScopeDraft((item.scope ?? "ops").trim());
    setIsActiveDraft(Boolean(item.is_active));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);
    setSesError(null);

    const scope = scopeFilter.trim().toLowerCase();

    try {
      const [recipientsResponse, statusResponse] = await Promise.all([
        client.listNotificationRecipients({
          kind,
          scope: scope || undefined,
          include_inactive: includeInactive,
          limit: 200
        }),
        client
          .getNotificationEmailStatus()
          .then((value) => value)
          .catch((statusError) => {
            setSesError((statusError as Error).message);
            return null;
          })
      ]);

      const rows = recipientsResponse.items ?? [];
      setItems(rows);
      setSesStatus(statusResponse);
      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? "";
      });

      if (rows.length === 0) {
        setUiState("empty");
      } else if (rows.some((row) => row.is_active === false)) {
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
    if (!canView) {
      setUiState("permission_denied");
      return;
    }
    void load();
  }, [kind, includeInactive]);

  useEffect(() => {
    hydrateDraft(selected);
  }, [selected]);

  const createRecipient = async () => {
    if (!canManage) return;

    const email = emailDraft.trim().toLowerCase();
    const scope = scopeDraft.trim().toLowerCase() || "ops";
    if (!email || !email.includes("@")) {
      setUiState("error_non_retriable");
      setError("email es obligatorio y debe ser valido");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateNotificationRecipientRequest = {
        kind,
        scope,
        email,
        is_active: isActiveDraft
      };
      await client.createNotificationRecipient(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateRecipient = async () => {
    if (!canManage || !selected) return;

    const email = emailDraft.trim().toLowerCase();
    const scope = scopeDraft.trim().toLowerCase() || "ops";
    if (!email || !email.includes("@")) {
      setUiState("error_non_retriable");
      setError("email es obligatorio y debe ser valido");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateNotificationRecipientRequest = {
        scope,
        email,
        is_active: isActiveDraft
      };
      await client.patchNotificationRecipient(selected.id, payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const isSandbox = sesStatus ? !sesStatus.production_access_enabled : null;

  const recipientColumns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (_: unknown, record: NotificationRecipient) => renderRecipientEmail(record)
    },
    {
      title: "Scope",
      dataIndex: "scope",
      key: "scope"
    },
    {
      title: "Estado",
      dataIndex: "is_active",
      key: "is_active",
      render: (value: boolean) => <StatusTag status={value ? "active" : "inactive"} />
    },
    {
      title: "Actualizado",
      dataIndex: "updated_at",
      key: "updated_at"
    },
    {
      title: "Accion",
      key: "action",
      render: (_: unknown, record: NotificationRecipient) => (
        <Button size="small" onClick={() => setSelectedId(record.id)}>
          Ver
        </Button>
      )
    }
  ];

  return (
    <section>
      <PageHeader
        title="Notificaciones: Recipients"
        subtitle="Catalogo en DB para recipients de digest e incidentes, con gobernanza Admin y visibilidad enmascarada para Analyst."
      />

      {uiState === "loading" ? <Alert type="info" showIcon title="loading: consultando recipients..." style={{ marginBottom: 16 }} /> : null}
      {uiState === "empty" ? <Alert type="info" showIcon title="empty: no existen recipients configurados." style={{ marginBottom: 16 }} /> : null}
      {uiState === "partial_data" ? (
        <Alert type="warning" showIcon title="partial_data: hay recipients inactivos en el catalogo." style={{ marginBottom: 16 }} />
      ) : null}
      {uiState === "permission_denied" ? (
        <Alert type="error" showIcon title="permission_denied: tu rol no tiene acceso." style={{ marginBottom: 16 }} />
      ) : null}
      {uiState === "error_retriable" ? (
        <Alert type="error" showIcon title={`error_retriable: ${error ?? "intenta nuevamente"}`} style={{ marginBottom: 16 }} />
      ) : null}
      {uiState === "error_non_retriable" ? (
        <Alert type="error" showIcon title={`error_non_retriable: ${error ?? "revisa los datos"}`} style={{ marginBottom: 16 }} />
      ) : null}

      <Card
        title="Estado SES"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {!sesStatus && sesError ? <Alert type="error" showIcon title={`error_retriable: ${sesError}`} style={{ marginBottom: 12 }} /> : null}
        {!sesStatus && !sesError ? <Text type="secondary">Cargando estado SES...</Text> : null}

        {sesStatus ? (
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            <Descriptions column={1} size="small" bordered={false}>
              <Descriptions.Item label="SES">
                <Text strong>{sesStatus.production_access_enabled ? "produccion" : "sandbox"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="sending_enabled">
                <Text strong>{sesStatus.sending_enabled ? "true" : "false"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Sender">
                <Text strong>{sesStatus.sender_email ?? "(no configurado)"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="verified_for_sending">
                <Text strong>{sesStatus.sender_verified_for_sending ? "true" : "false"}</Text>
                {sesStatus.sender_verification_status ? <Text> ({sesStatus.sender_verification_status})</Text> : null}
              </Descriptions.Item>
              <Descriptions.Item label="Quota">
                max24h={sesStatus.send_quota?.max_24_hour_send ?? "n/a"} | rate={sesStatus.send_quota?.max_send_rate ?? "n/a"} |
                sent24h={sesStatus.send_quota?.sent_last_24_hours ?? "n/a"}
              </Descriptions.Item>
            </Descriptions>
            {isSandbox ? (
              <Alert
                type="warning"
                showIcon
                title="Nota: SES sandbox requiere recipients verificados (email identity) para que el envio funcione."
              />
            ) : null}
          </Space>
        ) : null}
      </Card>

      <Card
        title="Tipo"
        extra={
          <Flex gap={8}>
            <Button onClick={() => setKind("digest")} disabled={kind === "digest" || uiState === "loading"}>
              Digest
            </Button>
            <Button onClick={() => setKind("incident")} disabled={kind === "incident" || uiState === "loading"}>
              Incidentes
            </Button>
          </Flex>
        }
        style={{ marginBottom: 16 }}
      />

      <Card
        title="Filtros"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Aplicar
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Form layout="vertical">
          <Row gutter={16} align="bottom">
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Scope">
                <Input value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} placeholder="ops" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Incluir inactivos">
                <Switch checked={includeInactive} onChange={(checked) => setIncludeInactive(checked)} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card
        title="Recipients"
        extra={<Text>{items.length} registros</Text>}
        style={{ marginBottom: 16 }}
      >
        {items.length > 0 ? (
          <Table
            dataSource={items}
            columns={recipientColumns}
            rowKey="id"
            size="small"
            pagination={false}
            rowClassName={(record) => (selectedId === record.id ? "ant-table-row-selected" : "")}
          />
        ) : null}
      </Card>

      <Card
        title={selected ? "Editar recipient" : "Crear recipient"}
        extra={<Text type="secondary">{selected ? selected.id : "nuevo"}</Text>}
        style={{ marginBottom: 16 }}
      >
        {!canManage ? (
          <Alert type="info" showIcon title="Tu rol es de solo lectura para notificaciones." style={{ marginBottom: 16 }} />
        ) : null}

        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Email">
                <Input
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  disabled={!canManage}
                  placeholder="ops@example.com"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Scope">
                <Input value={scopeDraft} onChange={(event) => setScopeDraft(event.target.value)} disabled={!canManage} placeholder="ops" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Estado">
                <Switch
                  checked={isActiveDraft}
                  onChange={(checked) => setIsActiveDraft(checked)}
                  disabled={!canManage}
                  checkedChildren="active"
                  unCheckedChildren="inactive"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {canManage ? (
          <Flex gap={8} style={{ marginTop: 10 }}>
            {!selected ? (
              <Button type="primary" onClick={() => void createRecipient()} disabled={saving || uiState === "loading"} loading={saving}>
                Crear
              </Button>
            ) : (
              <Button type="primary" onClick={() => void updateRecipient()} disabled={saving || uiState === "loading"} loading={saving}>
                Guardar cambios
              </Button>
            )}
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedId("");
                hydrateDraft(null);
              }}
              disabled={saving || uiState === "loading"}
            >
              Nuevo
            </Button>
          </Flex>
        ) : null}
      </Card>
    </section>
  );
};
