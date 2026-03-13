import React from "react";
import type { AwarioCommentRow } from "./postsTypes";
import { formatDateTime, formatScore } from "./postsUtils";

type Props = {
  comment: AwarioCommentRow;
  canOverride: boolean;
  updating: boolean;
  onPatch: (commentId: string, payload: { is_spam?: boolean; related_to_post_text?: boolean; sentiment?: "positive" | "negative" | "neutral" | "unknown" }) => void;
};

const CommentCard: React.FC<Props> = ({ comment, canOverride, updating, onPatch }) => {
  const sentimentClass =
    comment.sentiment === "positive" ? "bg-emerald-50 text-emerald-700"
      : comment.sentiment === "negative" ? "bg-rose-50 text-rose-700"
        : comment.sentiment === "neutral" ? "bg-sky-50 text-sky-700"
          : "bg-slate-100 text-slate-700";

  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <strong>{comment.author_name ?? "Autor desconocido"}</strong>
        <span>{formatDateTime(comment.published_at)}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${sentimentClass}`}>{comment.sentiment}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${comment.is_spam ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
          {comment.is_spam ? "spam" : "no spam"}
        </span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${comment.related_to_post_text ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {comment.related_to_post_text ? "relacionado" : "no relacionado"}
        </span>
        {comment.needs_review && <span className="rounded-full bg-amber-200 px-2 py-0.5 font-semibold text-amber-900">needs_review</span>}
      </div>

      <p className="text-sm text-slate-800">{comment.text || "(sin texto)"}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {comment.comment_url && (
          <a href={comment.comment_url} target="_blank" rel="noreferrer" className="text-red-700 underline">
            Ver comentario original
          </a>
        )}
        <span className="text-slate-500">confianza: {comment.confidence === null ? "n/a" : formatScore(comment.confidence)}</span>
      </div>

      {canOverride && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={updating}
            onClick={() => onPatch(comment.id, { is_spam: !comment.is_spam })}
          >
            Marcar {comment.is_spam ? "no spam" : "spam"}
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={updating}
            onClick={() => onPatch(comment.id, { related_to_post_text: !comment.related_to_post_text })}
          >
            Marcar {comment.related_to_post_text ? "no relacionado" : "relacionado"}
          </button>
          <label className="text-slate-600">
            Sentimiento
            <select
              className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
              value={comment.sentiment}
              disabled={updating}
              onChange={(e) => onPatch(comment.id, { sentiment: e.target.value as "positive" | "negative" | "neutral" | "unknown" })}
            >
              <option value="positive">positive</option>
              <option value="negative">negative</option>
              <option value="neutral">neutral</option>
              <option value="unknown">unknown</option>
            </select>
          </label>
        </div>
      )}
    </article>
  );
};

export default CommentCard;
