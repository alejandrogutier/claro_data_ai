import { useEffect, useMemo, useState } from "react";
import { Card, Alert, Button, Form, Input, Row, Col, Spin, Flex, Typography } from "antd";
import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import type { MonitorSocialSettings, PatchMonitorSocialSettingsRequest } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";

const { Text } = Typography;

type SettingsDraft = {
  focus_account: string;
  target_quarterly_sov_pp: string;
  target_shs: string;
  risk_threshold: string;
  sentiment_drop_threshold: string;
  er_drop_threshold: string;
  alert_cooldown_minutes: string;
};

const toSettingsDraft = (settings: MonitorSocialSettings): SettingsDraft => ({
  focus_account: settings.focus_account ?? "",
  target_quarterly_sov_pp: String(settings.target_quarterly_sov_pp),
  target_shs: String(settings.target_shs),
  risk_threshold: String(settings.risk_threshold),
  sentiment_drop_threshold: String(settings.sentiment_drop_threshold),
  er_drop_threshold: String(settings.er_drop_threshold),
  alert_cooldown_minutes: String(settings.alert_cooldown_minutes)
});

const parseNumberInput = (value: string): number | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseIntInput = (value: string): number | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const SocialSettingsPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const canManage = useMemo(() => session?.role === "Admin", [session?.role]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<MonitorSocialSettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getMonitorSocialSettings();
      setSettings(response);
      setDraft(toSettingsDraft(response));
    } catch (loadError) {
      setError((loadError as Error).message);
      setSettings(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!canManage || !draft) return;

    const targetQuarterly = parseNumberInput(draft.target_quarterly_sov_pp);
    const targetShs = parseNumberInput(draft.target_shs);
    const riskThreshold = parseNumberInput(draft.risk_threshold);
    const sentimentDrop = parseNumberInput(draft.sentiment_drop_threshold);
    const erDrop = parseNumberInput(draft.er_drop_threshold);
    const cooldown = parseIntInput(draft.alert_cooldown_minutes);

    if (
      targetQuarterly === null ||
      targetShs === null ||
      riskThreshold === null ||
      sentimentDrop === null ||
      erDrop === null ||
      cooldown === null
    ) {
      setError("Valores invalidos. Revisa que todos los campos numericos tengan formato correcto.");
      return;
    }

    const payload: PatchMonitorSocialSettingsRequest = {
      focus_account: draft.focus_account.trim() || null,
      target_quarterly_sov_pp: targetQuarterly,
      target_shs: targetShs,
      risk_threshold: riskThreshold,
      sentiment_drop_threshold: sentimentDrop,
      er_drop_threshold: erDrop,
      alert_cooldown_minutes: cooldown
    };

    setSaving(true);
    setError(null);
    try {
      const updated = await client.patchMonitorSocialSettings(payload);
      setSettings(updated);
      setDraft(toSettingsDraft(updated));
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Configuracion Social"
        subtitle="Metas y umbrales de alertas sociales (SHS/SOV interno no oficiales) con auditoria por cambios."
      />

      {loading ? <Spin tip="Consultando configuracion social..." style={{ display: "block", marginBottom: 16 }} /> : null}
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      {!canManage ? (
        <Alert type="info" showIcon title="Tu rol tiene acceso de lectura. Solo Admin puede editar." style={{ marginBottom: 16 }} />
      ) : null}

      <Card
        title="Metas y alertas"
        extra={
          <Flex gap={8}>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={loading || saving}>
              Refrescar
            </Button>
            {canManage ? (
              <Button type="primary" icon={<SaveOutlined />} onClick={() => void save()} disabled={saving || !draft} loading={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            ) : null}
          </Flex>
        }
      >
        {draft ? (
          <Form layout="vertical">
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Cuenta foco SOV interno">
                  <Input
                    value={draft.focus_account}
                    onChange={(event) => setDraft((current) => (current ? { ...current, focus_account: event.target.value } : current))}
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Meta SOV trimestral (pp)">
                  <Input
                    value={draft.target_quarterly_sov_pp}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, target_quarterly_sov_pp: event.target.value } : current))
                    }
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Meta SHS">
                  <Input
                    value={draft.target_shs}
                    onChange={(event) => setDraft((current) => (current ? { ...current, target_shs: event.target.value } : current))}
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Umbral riesgo activo">
                  <Input
                    value={draft.risk_threshold}
                    onChange={(event) => setDraft((current) => (current ? { ...current, risk_threshold: event.target.value } : current))}
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Umbral caida sentimiento neto">
                  <Input
                    value={draft.sentiment_drop_threshold}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, sentiment_drop_threshold: event.target.value } : current))
                    }
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Umbral caida ER">
                  <Input
                    value={draft.er_drop_threshold}
                    onChange={(event) => setDraft((current) => (current ? { ...current, er_drop_threshold: event.target.value } : current))}
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Cooldown alertas (min)">
                  <Input
                    value={draft.alert_cooldown_minutes}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, alert_cooldown_minutes: event.target.value } : current))
                    }
                    disabled={!canManage}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        ) : (
          <Text type="secondary">Sin configuracion cargada.</Text>
        )}

        {settings ? (
          <Text type="secondary" style={{ display: "block", marginTop: 10 }}>
            Ultima actualizacion: {settings.updated_at}
          </Text>
        ) : null}
      </Card>
    </section>
  );
};
