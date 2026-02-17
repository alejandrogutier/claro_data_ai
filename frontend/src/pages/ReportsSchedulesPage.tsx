import { useEffect, useMemo, useState } from "react";
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
      <header className="page-header">
        <h2>Programacion de Reportes</h2>
        <p>Schedules de ejecucion (`daily|weekly`) con trigger manual y destinatarios para correo SES verificado.</p>
      </header>

      {uiState === "loading" ? <div className="alert info">loading: consultando schedules...</div> : null}
      {uiState === "empty" ? <div className="alert info">empty: no hay schedules configurados.</div> : null}
      {uiState === "partial_data" ? <div className="alert warning">partial_data: hay schedules deshabilitados.</div> : null}
      {uiState === "permission_denied" ? <div className="alert error">permission_denied: solo Analyst/Admin puede operar schedules.</div> : null}
      {uiState === "error_retriable" ? <div className="alert error">error_retriable: {error ?? "intenta nuevamente"}</div> : null}
      {uiState === "error_non_retriable" ? <div className="alert error">error_non_retriable: {error ?? "revisa los datos"}</div> : null}

      {!canOperate ? <div className="alert info">Tu rol tiene lectura para schedules.</div> : null}

      <section className="panel">
        <div className="section-title-row">
          <h3>Listado</h3>
          <button className="btn btn-outline" type="button" onClick={() => void load()} disabled={saving || uiState === "loading"}>
            Refrescar
          </button>
        </div>

        {items.length > 0 ? (
          <ul className="simple-list simple-list--stacked">
            {items.map((schedule) => (
              <li key={schedule.id}>
                <div style={{ width: "100%", display: "grid", gap: 6 }}>
                  <div className="section-title-row">
                    <strong>{schedule.name}</strong>
                    <span>{schedule.enabled ? "enabled" : "disabled"}</span>
                  </div>
                  <span>
                    {schedule.template_name} | {schedule.frequency}
                    {typeof schedule.day_of_week === "number" ? ` (${weekdayLabels[schedule.day_of_week]})` : ""} | {schedule.time_local}
                  </span>
                  <span className="kpi-caption">next: {schedule.next_run_at}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-outline" type="button" onClick={() => setSelectedScheduleId(schedule.id)}>
                      Editar
                    </button>
                    <button className="btn btn-primary" type="button" disabled={!canOperate || saving} onClick={() => void triggerRun(schedule.id)}>
                      Run manual
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title-row">
          <h3>{selectedSchedule ? "Editar schedule" : "Crear schedule"}</h3>
          <span>{selectedSchedule ? selectedSchedule.id : "nuevo"}</span>
        </div>

        <div className="form-grid">
          <label>
            Plantilla
            <select value={templateIdDraft} onChange={(event) => setTemplateIdDraft(event.target.value)} disabled={Boolean(selectedSchedule)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nombre
            <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={120} />
          </label>

          <label>
            Frecuencia
            <select value={frequencyDraft} onChange={(event) => setFrequencyDraft(event.target.value as ReportScheduleFrequency)}>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
          </label>

          <label>
            Dia semana (0-6)
            <select value={dayOfWeekDraft} onChange={(event) => setDayOfWeekDraft(event.target.value === "" ? "" : Number.parseInt(event.target.value, 10))}>
              <option value="">n/a</option>
              {weekdayLabels.map((label, index) => (
                <option key={label} value={index}>
                  {index} - {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Hora local (HH:mm)
            <input value={timeDraft} onChange={(event) => setTimeDraft(event.target.value)} placeholder="08:00" />
          </label>

          <label>
            Zona horaria
            <input value={timezoneDraft} onChange={(event) => setTimezoneDraft(event.target.value)} />
          </label>

          <label>
            Estado
            <select value={enabledDraft ? "enabled" : "disabled"} onChange={(event) => setEnabledDraft(event.target.value === "enabled")}>
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Recipients (coma)
            <textarea value={recipientsDraft} onChange={(event) => setRecipientsDraft(event.target.value)} rows={3} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {!selectedSchedule ? (
            <button className="btn btn-primary" type="button" disabled={!canOperate || saving || !templateIdDraft} onClick={() => void saveCreate()}>
              {saving ? "Guardando..." : "Crear schedule"}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={!canOperate || saving} onClick={() => void saveUpdate()}>
              {saving ? "Guardando..." : "Actualizar schedule"}
            </button>
          )}
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              setSelectedScheduleId("");
              hydrateDraft(null);
            }}
          >
            Limpiar
          </button>
        </div>
      </section>
    </section>
  );
};
