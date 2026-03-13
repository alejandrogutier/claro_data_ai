import { useEffect, useMemo, useState } from "react";
import { Card, Alert, Button, Form, Input, InputNumber, Row, Col, Flex, Table, Switch, Typography } from "antd";
import { ReloadOutlined, FilterOutlined, ClearOutlined } from "@ant-design/icons";
import {
  ApiError,
  type CreateSourceWeightRequest,
  type SourceWeight,
  type UpdateSourceWeightRequest
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

export const SourceScoringPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<SourceWeight[]>([]);
  const [providerFilter, setProviderFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const [providerDraft, setProviderDraft] = useState("");
  const [sourceNameDraft, setSourceNameDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState("0.50");
  const [isActiveDraft, setIsActiveDraft] = useState(true);

  const [uiState, setUiState] = useState<UiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const hydrateDraft = (item: SourceWeight | null) => {
    if (!item) {
      setProviderDraft("");
      setSourceNameDraft("");
      setWeightDraft("0.50");
      setIsActiveDraft(true);
      return;
    }

    setProviderDraft(item.provider);
    setSourceNameDraft(item.source_name ?? "");
    setWeightDraft(typeof item.weight === "number" ? item.weight.toFixed(2) : "0.50");
    setIsActiveDraft(Boolean(item.is_active));
  };

  const load = async () => {
    setUiState("loading");
    setError(null);

    try {
      const response = await client.listSourceWeights(providerFilter.trim() || undefined, includeInactive);
      const rows = response.items ?? [];
      setItems(rows);
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
    void load();
  }, [includeInactive]);

  useEffect(() => {
    hydrateDraft(selected);
  }, [selected]);

  const createWeight = async () => {
    if (!canManage) return;

    const provider = providerDraft.trim().toLowerCase();
    const parsedWeight = Number.parseFloat(weightDraft);
    if (!provider || Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 1) {
      setUiState("error_non_retriable");
      setError("provider y weight (0..1) son obligatorios");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateSourceWeightRequest = {
        provider,
        source_name: sourceNameDraft.trim() ? sourceNameDraft.trim() : null,
        weight: parsedWeight,
        is_active: isActiveDraft
      };
      await client.createSourceWeight(payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateWeight = async () => {
    if (!canManage || !selected) return;

    const parsedWeight = Number.parseFloat(weightDraft);
    if (Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 1) {
      setUiState("error_non_retriable");
      setError("weight debe estar entre 0 y 1");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: UpdateSourceWeightRequest = {
        source_name: sourceNameDraft.trim() ? sourceNameDraft.trim() : null,
        weight: parsedWeight,
        is_active: isActiveDraft
      };
      await client.patchSourceWeight(selected.id, payload);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
      setUiState(toUiStateFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const weightColumns = [
    {
      title: "Provider",
      dataIndex: "provider",
      key: "provider"
    },
    {
      title: "Source Name",
      dataIndex: "source_name",
      key: "source_name",
      render: (value: string | null) => value ?? "provider-default"
    },
    {
      title: "Weight",
      dataIndex: "weight",
      key: "weight",
      render: (value: number | undefined) => (typeof value === "number" ? value.toFixed(2) : "0.50")
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
      render: (_: unknown, record: SourceWeight) => (
        <Button size="small" onClick={() => setSelectedId(record.id)}>
          Ver
        </Button>
      )
    }
  ];

  return (
    <section>
      <PageHeader
        title="Source Scoring Global"
        subtitle="Configuracion jerarquica de peso por `provider+source_name` y fallback por `provider`."
      />

      {uiState === "loading" ? (
        <Alert type="info" showIcon title="loading: consultando pesos configurables..." style={{ marginBottom: 16 }} />
      ) : null}
      {uiState === "empty" ? (
        <Alert type="info" showIcon title="empty: no existen pesos configurados." style={{ marginBottom: 16 }} />
      ) : null}
      {uiState === "partial_data" ? (
        <Alert type="warning" showIcon title="partial_data: hay pesos inactivos en el catalogo." style={{ marginBottom: 16 }} />
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

      {!canManage ? (
        <Alert type="info" showIcon title="Tu rol es de solo lectura para source scoring." style={{ marginBottom: 16 }} />
      ) : null}

      <Card
        title="Filtros"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Form layout="vertical">
          <Row gutter={16} align="bottom">
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Provider">
                <Input value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} placeholder="newsapi" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Incluir inactivos">
                <Switch checked={includeInactive} onChange={(checked) => setIncludeInactive(checked)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label=" ">
                <Button type="primary" icon={<FilterOutlined />} onClick={() => void load()} disabled={saving || uiState === "loading"}>
                  Aplicar filtros
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card
        title="Pesos"
        extra={<Text>{items.length} registros</Text>}
        style={{ marginBottom: 16 }}
      >
        {items.length > 0 ? (
          <Table
            dataSource={items}
            columns={weightColumns}
            rowKey="id"
            size="small"
            pagination={false}
            rowClassName={(record) => (selectedId === record.id ? "ant-table-row-selected" : "")}
          />
        ) : null}
      </Card>

      <Card
        title={selected ? "Editar peso" : "Crear peso"}
        extra={<Text type="secondary">{selected ? selected.id : "nuevo"}</Text>}
        style={{ marginBottom: 16 }}
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Provider">
                <Input
                  value={providerDraft}
                  onChange={(event) => setProviderDraft(event.target.value)}
                  disabled={Boolean(selected)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Source Name (opcional)">
                <Input
                  value={sourceNameDraft}
                  onChange={(event) => setSourceNameDraft(event.target.value)}
                  placeholder="null -> provider fallback"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Weight (0..1)">
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={Number.parseFloat(weightDraft) || 0}
                  onChange={(value) => setWeightDraft(value !== null ? String(value) : "0")}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Estado">
                <Switch
                  checked={isActiveDraft}
                  onChange={(checked) => setIsActiveDraft(checked)}
                  checkedChildren="active"
                  unCheckedChildren="inactive"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Flex gap={8} style={{ marginTop: 10 }}>
          {!selected ? (
            <Button type="primary" disabled={!canManage || saving} onClick={() => void createWeight()} loading={saving}>
              {saving ? "Guardando..." : "Crear peso"}
            </Button>
          ) : (
            <Button type="primary" disabled={!canManage || saving} onClick={() => void updateWeight()} loading={saving}>
              {saving ? "Guardando..." : "Actualizar peso"}
            </Button>
          )}
          <Button
            icon={<ClearOutlined />}
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
