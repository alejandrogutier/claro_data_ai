import { useEffect, useMemo, useState } from "react";
import type { MonitorSocialSettings, PatchMonitorSocialSettingsRequest } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

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
      <header className="page-header">
        <h2>Configuracion Social</h2>
        <p>Metas y umbrales de alertas sociales (SHS/SOV interno no oficiales) con auditoria por cambios.</p>
      </header>

      {loading ? <div className="alert info">loading: consultando configuracion social...</div> : null}
      {error ? <div className="alert error">{error}</div> : null}
      {!canManage ? <div className="alert info">Tu rol tiene acceso de lectura. Solo Admin puede editar.</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Metas y alertas</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={loading || saving}>
              Refrescar
            </button>
            {canManage ? (
              <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving || !draft}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            ) : null}
          </div>
        </div>

        {draft ? (
          <div className="form-grid">
            <label>
              Cuenta foco SOV interno
              <input
                value={draft.focus_account}
                onChange={(event) => setDraft((current) => (current ? { ...current, focus_account: event.target.value } : current))}
                disabled={!canManage}
              />
            </label>
            <label>
              Meta SOV trimestral (pp)
              <input
                value={draft.target_quarterly_sov_pp}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, target_quarterly_sov_pp: event.target.value } : current))
                }
                disabled={!canManage}
              />
            </label>
            <label>
              Meta SHS
              <input
                value={draft.target_shs}
                onChange={(event) => setDraft((current) => (current ? { ...current, target_shs: event.target.value } : current))}
                disabled={!canManage}
              />
            </label>
            <label>
              Umbral riesgo activo
              <input
                value={draft.risk_threshold}
                onChange={(event) => setDraft((current) => (current ? { ...current, risk_threshold: event.target.value } : current))}
                disabled={!canManage}
              />
            </label>
            <label>
              Umbral caida sentimiento neto
              <input
                value={draft.sentiment_drop_threshold}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, sentiment_drop_threshold: event.target.value } : current))
                }
                disabled={!canManage}
              />
            </label>
            <label>
              Umbral caida ER
              <input
                value={draft.er_drop_threshold}
                onChange={(event) => setDraft((current) => (current ? { ...current, er_drop_threshold: event.target.value } : current))}
                disabled={!canManage}
              />
            </label>
            <label>
              Cooldown alertas (min)
              <input
                value={draft.alert_cooldown_minutes}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, alert_cooldown_minutes: event.target.value } : current))
                }
                disabled={!canManage}
              />
            </label>
          </div>
        ) : (
          <p className="kpi-caption">Sin configuracion cargada.</p>
        )}

        {settings ? (
          <p className="kpi-caption" style={{ marginTop: 10 }}>
            Ultima actualizacion: {settings.updated_at}
          </p>
        ) : null}
      </section>
    </section>
  );
};
