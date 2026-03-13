import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Descriptions, Flex, Form, Input, InputNumber, Row, Space, Spin, Switch, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { type TaxonomyEntry, type TaxonomyKind } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

const { Text } = Typography;

type TaxonomyForm = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const defaultForm: TaxonomyForm = {
  key: "",
  label: "",
  description: "",
  sortOrder: 100,
  isActive: true
};

const kinds: Array<{ kind: TaxonomyKind; label: string }> = [
  { kind: "categories", label: "Categorias" },
  { kind: "business_lines", label: "Lineas de negocio" },
  { kind: "macro_regions", label: "Macro regiones" },
  { kind: "campaigns", label: "Campanas" },
  { kind: "strategies", label: "Estrategias" }
];

export const TaxonomyPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [kind, setKind] = useState<TaxonomyKind>("categories");
  const [items, setItems] = useState<TaxonomyEntry[]>([]);
  const [form, setForm] = useState<TaxonomyForm>(defaultForm);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedKind: TaxonomyKind, includeAll: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.listTaxonomy(selectedKind, includeAll);
      setItems(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(kind, includeInactive);
  }, [kind, includeInactive]);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await client.createTaxonomyEntry(kind, {
        key: form.key.trim().toLowerCase().replace(/\s+/g, "_"),
        label: form.label.trim(),
        description: form.description.trim() || undefined,
        is_active: form.isActive,
        sort_order: form.sortOrder
      });

      setItems((current) => [created, ...current]);
      setForm(defaultForm);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item: TaxonomyEntry) => {
    if (!canMutate) return;

    setError(null);
    try {
      const updated = await client.patchTaxonomyEntry(kind, item.id, {
        is_active: !item.is_active
      });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <PageHeader
        title="Taxonomias"
        subtitle="Operacion CLARO-038: catalogos de clasificacion para filtros operativos y reportes."
      />

      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}

      <Card style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
          <Text strong>Tipo de taxonomia</Text>
          <Space>
            <Switch
              checked={includeInactive}
              onChange={(checked) => setIncludeInactive(checked)}
              size="small"
            />
            <Text>Incluir inactivos</Text>
          </Space>
        </Flex>

        <Space wrap>
          {kinds.map((entry) => (
            <Button
              key={entry.kind}
              type={entry.kind === kind ? "primary" : "default"}
              onClick={() => setKind(entry.kind)}
            >
              {entry.label}
            </Button>
          ))}
        </Space>
      </Card>

      {canMutate ? (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={onCreate}>
            <Form layout="vertical" component="div">
              <Row gutter={16}>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item label="Key" required>
                    <Input
                      value={form.key}
                      onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Form.Item label="Label" required>
                    <Input
                      value={form.label}
                      onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Form.Item label="Description">
                    <Input
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={3}>
                  <Form.Item label="Sort order">
                    <InputNumber
                      value={form.sortOrder}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          sortOrder: value ?? 100
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={3}>
                  <Form.Item label="Activo">
                    <Switch
                      checked={form.isActive}
                      onChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting} onClick={(e) => { e.preventDefault(); void onCreate(e as unknown as React.FormEvent); }}>
                  Crear entrada
                </Button>
              </Form.Item>
            </Form>
          </form>
        </Card>
      ) : (
        <Alert type="info" showIcon title="Solo Admin puede crear o editar taxonomias." style={{ marginBottom: 16 }} />
      )}

      <Card
        title={`Entradas (${kind})`}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load(kind, includeInactive)} loading={loading}>
            Recargar
          </Button>
        }
      >
        {loading ? (
          <Flex justify="center" style={{ padding: 24 }}>
            <Spin />
          </Flex>
        ) : null}

        {!loading && items.length === 0 ? <Text type="secondary">No hay entradas para este tipo.</Text> : null}

        {!loading
          ? items.map((item) => (
              <Card key={item.id} size="small" style={{ marginBottom: 12 }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                  <Text strong>
                    {item.label} ({item.key})
                  </Text>
                  <StatusTag status={item.is_active ? "active" : "inactive"} />
                </Flex>

                <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
                  <Descriptions.Item label="Sort">{item.sort_order}</Descriptions.Item>
                  <Descriptions.Item label="Descripcion">{item.description ?? "sin descripcion"}</Descriptions.Item>
                </Descriptions>

                {canMutate ? (
                  <Button size="small" onClick={() => void toggleActive(item)} style={{ marginTop: 8 }}>
                    {item.is_active ? "Desactivar" : "Activar"}
                  </Button>
                ) : null}
              </Card>
            ))
          : null}
      </Card>
    </section>
  );
};
