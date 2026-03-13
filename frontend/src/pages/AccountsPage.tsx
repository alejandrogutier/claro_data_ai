import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Descriptions, Flex, Form, Input, Row, Select, Spin, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { ApiError, type OwnedAccount } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusTag } from "../components/shared/StatusTag";

const { Text } = Typography;

type AccountForm = {
  platform: string;
  handle: string;
  accountName: string;
  businessLine: string;
  macroRegion: string;
  language: string;
  teamOwner: string;
  status: string;
  campaignTags: string[];
};

const defaultForm: AccountForm = {
  platform: "x",
  handle: "",
  accountName: "",
  businessLine: "",
  macroRegion: "",
  language: "es",
  teamOwner: "",
  status: "active",
  campaignTags: []
};

export const AccountsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canMutate = useMemo(() => session?.role === "Admin", [session?.role]);

  const [items, setItems] = useState<OwnedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(defaultForm);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listConfigAccounts(250);
      setItems(response.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canMutate) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await client.createConfigAccount({
        platform: form.platform.trim().toLowerCase(),
        handle: form.handle.trim(),
        account_name: form.accountName.trim(),
        business_line: form.businessLine.trim() || undefined,
        macro_region: form.macroRegion.trim() || undefined,
        language: form.language.trim().toLowerCase(),
        team_owner: form.teamOwner.trim() || undefined,
        status: form.status.trim().toLowerCase(),
        campaign_tags: form.campaignTags.slice(0, 40)
      });

      setItems((current) => [created, ...current]);
      setForm(defaultForm);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(`No se pudo crear la cuenta: ${createError.message}`);
      } else {
        setError((createError as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (account: OwnedAccount) => {
    if (!canMutate) return;
    setError(null);
    try {
      const updated = await client.patchConfigAccount(account.id, {
        status: account.estado === "active" ? "inactive" : "active"
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  };

  return (
    <section>
      <PageHeader
        title="Cuentas Propias"
        subtitle="Operacion CLARO-038: catalogo operativo de cuentas oficiales de Claro."
      />

      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      {!canMutate ? (
        <Alert type="info" showIcon title="Solo Admin puede crear/editar cuentas." style={{ marginBottom: 16 }} />
      ) : null}

      {canMutate ? (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={onCreate}>
            <Form layout="vertical" component="div">
              <Row gutter={16}>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Plataforma" required>
                    <Input
                      value={form.platform}
                      onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Handle" required>
                    <Input
                      value={form.handle}
                      onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Nombre de cuenta" required>
                    <Input
                      value={form.accountName}
                      onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Linea de negocio">
                    <Input
                      value={form.businessLine}
                      onChange={(event) => setForm((current) => ({ ...current, businessLine: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Region macro">
                    <Input
                      value={form.macroRegion}
                      onChange={(event) => setForm((current) => ({ ...current, macroRegion: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Idioma" required>
                    <Input
                      value={form.language}
                      onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Owner equipo">
                    <Input
                      value={form.teamOwner}
                      onChange={(event) => setForm((current) => ({ ...current, teamOwner: event.target.value }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} md={8}>
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

                <Col xs={24} sm={12} md={8}>
                  <Form.Item label="Tags campana">
                    <Select
                      mode="tags"
                      value={form.campaignTags}
                      onChange={(value) => setForm((current) => ({ ...current, campaignTags: value }))}
                      placeholder="hogar, prepago, q1"
                      tokenSeparators={[","]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting} onClick={(e) => { e.preventDefault(); void onCreate(e as unknown as React.FormEvent); }}>
                  Crear cuenta
                </Button>
              </Form.Item>
            </Form>
          </form>
        </Card>
      ) : null}

      <Card
        title="Listado"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void loadAccounts()} loading={loading}>
            Recargar
          </Button>
        }
      >
        {loading ? (
          <Flex justify="center" style={{ padding: 24 }}>
            <Spin />
          </Flex>
        ) : null}

        {!loading && items.length === 0 ? <Text type="secondary">No hay cuentas registradas.</Text> : null}

        {!loading
          ? items.map((account) => (
              <Card key={account.id} size="small" style={{ marginBottom: 12 }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                  <Text strong>
                    {account.nombre_cuenta} ({account.plataforma})
                  </Text>
                  <Text>{account.handle}</Text>
                </Flex>

                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }}>
                  <Descriptions.Item label="Estado">
                    <StatusTag status={account.estado} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Linea">{account.linea_negocio ?? "n/a"}</Descriptions.Item>
                  <Descriptions.Item label="Region">{account.region_macro ?? "n/a"}</Descriptions.Item>
                  <Descriptions.Item label="Tags">{account.tags_campana.join(", ") || "n/a"}</Descriptions.Item>
                </Descriptions>

                {canMutate ? (
                  <Button size="small" onClick={() => void toggleStatus(account)} style={{ marginTop: 8 }}>
                    {account.estado === "active" ? "Desactivar" : "Activar"}
                  </Button>
                ) : null}
              </Card>
            ))
          : null}
      </Card>
    </section>
  );
};
