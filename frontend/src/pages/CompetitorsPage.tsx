import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Descriptions, Flex, Form, Input, InputNumber, Row, Select, Space, Spin, Typography } from "antd";
import { ArrowUpOutlined, ReloadOutlined } from "@ant-design/icons";
import { type Competitor } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

const { Text } = Typography;

type CompetitorForm = {
  brandName: string;
  aliases: string[];
  priority: number;
  status: string;
};

const defaultForm: CompetitorForm = {
  brandName: "",
  aliases: [],
  priority: 3,
  status: "active"
};

export const CompetitorsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<Competitor[]>([]);
  const [form, setForm] = useState<CompetitorForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCompetitors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConfigCompetitors(250);
      setItems(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCompetitors();
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await client.createConfigCompetitor({
        brand_name: form.brandName.trim(),
        aliases: form.aliases.slice(0, 50),
        priority: form.priority,
        status: form.status
      });

      setItems((current) => [created, ...current]);
      setForm(defaultForm);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const updatePriority = async (competitor: Competitor, nextPriority: number) => {
    if (!canMutate) return;

    setError(null);
    try {
      const updated = await client.patchConfigCompetitor(competitor.id, {
        priority: nextPriority
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  const toggleStatus = async (competitor: Competitor) => {
    if (!canMutate) return;

    setError(null);
    try {
      const updated = await client.patchConfigCompetitor(competitor.id, {
        status: competitor.estado === "active" ? "inactive" : "active"
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <PageHeader
        title="Competidores"
        subtitle="Operacion CLARO-038: catalogo oficial de marcas competidoras y prioridad de seguimiento."
      />

      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      {!canMutate ? (
        <Alert type="info" showIcon title="Solo Admin puede crear o editar competidores." style={{ marginBottom: 16 }} />
      ) : null}

      {canMutate ? (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={onCreate}>
            <Form layout="vertical" component="div">
              <Row gutter={16}>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Marca competidora" required>
                    <Input
                      value={form.brandName}
                      onChange={(event) => setForm((current) => ({ ...current, brandName: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Aliases">
                    <Select
                      mode="tags"
                      value={form.aliases}
                      onChange={(value) => setForm((current) => ({ ...current, aliases: value }))}
                      tokenSeparators={[","]}
                      placeholder="alias1, alias2"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={4}>
                  <Form.Item label="Prioridad">
                    <InputNumber
                      min={1}
                      max={10}
                      value={form.priority}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          priority: Math.max(1, Math.min(10, value ?? 3))
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={4}>
                  <Form.Item label="Estado">
                    <Select
                      value={form.status}
                      onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                      options={[
                        { value: "active", label: "active" },
                        { value: "inactive", label: "inactive" }
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting} onClick={(e) => { e.preventDefault(); void onCreate(e as unknown as React.FormEvent); }}>
                  Crear competidor
                </Button>
              </Form.Item>
            </Form>
          </form>
        </Card>
      ) : null}

      <Card
        title="Listado"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void loadCompetitors()} loading={loading}>
            Recargar
          </Button>
        }
      >
        {loading ? (
          <Flex justify="center" style={{ padding: 24 }}>
            <Spin />
          </Flex>
        ) : null}

        {!loading && items.length === 0 ? <Text type="secondary">No hay competidores registrados.</Text> : null}

        {!loading
          ? items.map((item) => (
              <Card key={item.id} size="small" style={{ marginBottom: 12 }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                  <Text strong>{item.marca_competidora}</Text>
                  <StatusTag status={item.estado} />
                </Flex>

                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                  <Descriptions.Item label="Prioridad">{item.prioridad}</Descriptions.Item>
                  <Descriptions.Item label="Aliases">{item.aliases.join(", ") || "n/a"}</Descriptions.Item>
                </Descriptions>

                {canMutate ? (
                  <Space style={{ marginTop: 8 }}>
                    <Button size="small" onClick={() => void toggleStatus(item)}>
                      {item.estado === "active" ? "Desactivar" : "Activar"}
                    </Button>

                    <Button
                      size="small"
                      icon={<ArrowUpOutlined />}
                      onClick={() =>
                        void updatePriority(item, item.prioridad >= 10 ? 1 : Math.min(10, Math.max(1, item.prioridad + 1)))
                      }
                    >
                      Subir prioridad
                    </Button>
                  </Space>
                ) : null}
              </Card>
            ))
          : null}
      </Card>
    </section>
  );
};
