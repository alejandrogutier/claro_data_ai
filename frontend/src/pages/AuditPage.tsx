import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Form, Input, Row, Col, Space, Spin, Table, Typography } from "antd";
import { DownloadOutlined, FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import { ApiError, type AuditExportResponse, type AuditItem } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";

import type { ColumnsType } from "antd/es/table";

const { Link: AntLink } = Typography;

type AuditFiltersForm = {
  resourceType: string;
  action: string;
  actorUserId: string;
  from: string;
  to: string;
};

const defaultFilters: AuditFiltersForm = {
  resourceType: "",
  action: "",
  actorUserId: "",
  from: "",
  to: ""
};

const columns: ColumnsType<AuditItem> = [
  {
    title: "Action",
    dataIndex: "action",
    key: "action",
    render: (text: string) => <strong>{text}</strong>,
  },
  {
    title: "Resource",
    dataIndex: "resource_type",
    key: "resource_type",
  },
  {
    title: "Resource ID",
    dataIndex: "resource_id",
    key: "resource_id",
    render: (text: string | null) => text ?? "n/a",
  },
  {
    title: "Actor",
    key: "actor",
    render: (_: unknown, record: AuditItem) =>
      record.actor_email ?? record.actor_user_id ?? "redacted",
  },
  {
    title: "Fecha",
    dataIndex: "created_at",
    key: "created_at",
  },
];

export const AuditPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canExport = useMemo(() => session?.role === "Admin" || session?.role === "Analyst", [session?.role]);

  const [filters, setFilters] = useState<AuditFiltersForm>(defaultFilters);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<AuditExportResponse | null>(null);

  const loadAudit = async (nextCursor?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.listConfigAudit({
        limit: 80,
        cursor: nextCursor,
        resource_type: filters.resourceType || undefined,
        action: filters.action || undefined,
        actor_user_id: filters.actorUserId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined
      });

      setItems(response.items ?? []);
      setCursor(response.page_info.next_cursor ?? null);
      setHasNext(response.page_info.has_next ?? false);
    } catch (loadError) {
      setError((loadError as Error).message);
      setItems([]);
      setCursor(null);
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, []);

  const onApplyFilters = async () => {
    await loadAudit();
  };

  const onExport = async () => {
    if (!canExport) return;

    setExporting(true);
    setError(null);
    setExportResult(null);

    try {
      const response = await client.exportConfigAudit({
        filters: {
          resource_type: filters.resourceType || undefined,
          action: filters.action || undefined,
          actor_user_id: filters.actorUserId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined
        },
        limit: 2000
      });
      setExportResult(response);
    } catch (exportError) {
      if (exportError instanceof ApiError) {
        setError(`No se pudo exportar auditoria: ${exportError.message}`);
      } else {
        setError((exportError as Error).message);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Auditoria de Configuracion"
        subtitle="Operacion CLARO-039: trazabilidad de cambios con filtros y export CSV sanitizado por rol."
      />

      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      {!canExport ? (
        <Alert type="info" showIcon title="Tu rol es de solo lectura para export de auditoria." style={{ marginBottom: 16 }} />
      ) : null}

      <Card title="Filtros" style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="resource_type">
                <Input
                  value={filters.resourceType}
                  onChange={(event) => setFilters((current) => ({ ...current, resourceType: event.target.value }))}
                  placeholder="OwnedAccount"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="action">
                <Input
                  value={filters.action}
                  onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
                  placeholder="owned_account_updated"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="actor_user_id">
                <Input
                  value={filters.actorUserId}
                  onChange={(event) => setFilters((current) => ({ ...current, actorUserId: event.target.value }))}
                  placeholder="uuid"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="from">
                <Input
                  type="datetime-local"
                  value={filters.from}
                  onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="to">
                <Input
                  type="datetime-local"
                  value={filters.to}
                  onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" icon={<FilterOutlined />} onClick={() => void onApplyFilters()} loading={loading}>
              Aplicar filtros
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadAudit()} disabled={loading}>
              Limpiar
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => void onExport()}
              disabled={!canExport || exporting}
              loading={exporting}
            >
              Exportar CSV
            </Button>
          </Space>
        </Form>
      </Card>

      {exportResult ? (
        <Card title="Export generado" style={{ marginBottom: 16 }} extra={<span>{exportResult.row_count} filas</span>}>
          <p>Descarga temporal:</p>
          <AntLink href={exportResult.download_url} target="_blank">
            Abrir CSV
          </AntLink>
        </Card>
      ) : null}

      <Card
        title="Eventos"
        extra={
          hasNext ? (
            <Button onClick={() => void loadAudit(cursor ?? undefined)} disabled={loading}>
              Siguiente pagina
            </Button>
          ) : null
        }
      >
        <Spin spinning={loading}>
          {!loading && items.length === 0 ? (
            <Empty description="No hay eventos de auditoria para los filtros actuales." />
          ) : (
            <Table<AuditItem>
              dataSource={items}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          )}
        </Spin>
      </Card>
    </section>
  );
};
