import React from "react";

type Props = {
  positive: number;
  neutral: number;
  negative: number;
  unknown: number;
  compact?: boolean;
  label?: string;
};

const SentimentBalanceBar: React.FC<Props> = ({ positive, neutral, negative, unknown, compact = false, label }) => {
  const total = positive + neutral + negative + unknown;
  if (total === 0) {
    return compact ? null : <p className="text-xs text-slate-400 italic">Sin datos de sentimiento</p>;
  }

  const balancePercent = ((positive + neutral) / total) * 100;
  const posPercent = (positive / total) * 100;
  const neuPercent = (neutral / total) * 100;
  const negPercent = (negative / total) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`sentiment-balance-bar compact flex-1`}>
          {posPercent > 0 && <div className="sentiment-balance-segment bg-emerald-500" style={{ width: `${posPercent}%` }} />}
          {neuPercent > 0 && <div className="sentiment-balance-segment bg-sky-400" style={{ width: `${neuPercent}%` }} />}
          {negPercent > 0 && <div className="sentiment-balance-segment bg-rose-500" style={{ width: `${negPercent}%` }} />}
        </div>
        <span className="text-xs font-semibold text-slate-700" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {balancePercent.toFixed(0)}%
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Balance de sentimiento</span>
        <span className="text-sm font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "var(--claro-red, #e30613)" }}>
          {balancePercent.toFixed(1)}%
        </span>
      </div>
      <div className="sentiment-balance-bar">
        {posPercent > 0 && <div className="sentiment-balance-segment bg-emerald-500" style={{ width: `${posPercent}%` }} title={`Positivo: ${positive}`} />}
        {neuPercent > 0 && <div className="sentiment-balance-segment bg-sky-400" style={{ width: `${neuPercent}%` }} title={`Neutro: ${neutral}`} />}
        {negPercent > 0 && <div className="sentiment-balance-segment bg-rose-500" style={{ width: `${negPercent}%` }} title={`Negativo: ${negative}`} />}
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Positivo ({positive})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> Neutro ({neutral})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> Negativo ({negative})</span>
      </div>
      {label && <p className="mt-0.5 text-[10px] text-slate-400 italic">{label}</p>}
    </div>
  );
};

export default SentimentBalanceBar;
