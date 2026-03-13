import React, { useCallback, useEffect, useState } from "react";
import type { PostRow, AwarioCommentRow, CommentSentimentFilter, CommentSpamFilter, CommentRelatedFilter } from "./postsTypes";
import { formatNumber } from "./postsUtils";
import CommentCard from "./CommentCard";
import SentimentBalanceBar from "./SentimentBalanceBar";
import type { ApiClient } from "../../api/client";

type Props = {
  post: PostRow;
  client: ApiClient;
  canOverride: boolean;
  onError: (error: unknown) => void;
  onSentimentCounts?: (counts: { positive: number; neutral: number; negative: number; unknown: number }) => void;
};

const PostDetailComments: React.FC<Props> = ({ post, client, canOverride, onError, onSentimentCounts }) => {
  const [comments, setComments] = useState<AwarioCommentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<CommentSentimentFilter>("all");
  const [spamFilter, setSpamFilter] = useState<CommentSpamFilter>("all");
  const [relatedFilter, setRelatedFilter] = useState<CommentRelatedFilter>("all");

  const buildQuery = useCallback(
    (c?: string) => ({
      limit: 25,
      cursor: c,
      sentiment: sentimentFilter === "all" ? undefined : sentimentFilter,
      is_spam: spamFilter === "all" ? undefined : spamFilter === "spam",
      related_to_post_text: relatedFilter === "all" ? undefined : relatedFilter === "related"
    }),
    [sentimentFilter, spamFilter, relatedFilter]
  );

  const load = useCallback(
    async (append = false, c?: string) => {
      setLoading(true);
      try {
        const response = await client.listMonitorSocialPostComments(post.id, buildQuery(c));
        const incoming = response.items ?? [];
        setComments((prev) => (append ? [...prev, ...incoming] : incoming));
        setCursor(response.page_info.next_cursor ?? null);
        setHasNext(Boolean(response.page_info.has_next));
      } catch (err) {
        onError(err);
        if (!append) {
          setComments([]);
          setCursor(null);
          setHasNext(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [client, post.id, buildQuery, onError]
  );

  useEffect(() => {
    void load();
  }, [sentimentFilter, spamFilter, relatedFilter, post.id]);

  // Emit sentiment counts to parent
  useEffect(() => {
    if (!onSentimentCounts || comments.length === 0) return;
    const counts = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
    for (const c of comments) {
      if (c.sentiment === "positive") counts.positive++;
      else if (c.sentiment === "negative") counts.negative++;
      else if (c.sentiment === "neutral") counts.neutral++;
      else counts.unknown++;
    }
    onSentimentCounts(counts);
  }, [comments, onSentimentCounts]);

  const patchComment = async (
    commentId: string,
    payload: { is_spam?: boolean; related_to_post_text?: boolean; sentiment?: "positive" | "negative" | "neutral" | "unknown" }
  ) => {
    if (!canOverride || updatingId) return;
    setUpdatingId(commentId);
    try {
      const updated = await client.patchMonitorSocialComment(commentId, payload);
      setComments((prev) => prev.map((item) => (item.id === commentId ? updated : item)));
    } catch (err) {
      onError(err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Compute sentiment balance from loaded comments
  const sentimentCounts = comments.reduce(
    (acc, c) => {
      if (c.sentiment === "positive") acc.positive++;
      else if (c.sentiment === "negative") acc.negative++;
      else if (c.sentiment === "neutral") acc.neutral++;
      else acc.unknown++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0, unknown: 0 }
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">Comentarios</h4>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Plataforma: <strong className="text-slate-700">{formatNumber(post.comments)}</strong></span>
          <span>Capturados: <strong className="text-slate-700">{formatNumber(post.awario_comments_count)}</strong></span>
        </div>
      </div>

      {/* Sentiment Balance */}
      {comments.length > 0 && (
        <div className="mb-3">
          <SentimentBalanceBar
            {...sentimentCounts}
            label={`Basado en ${comments.length} comentario${comments.length !== 1 ? "s" : ""} cargado${comments.length !== 1 ? "s" : ""}`}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        <label className="text-xs font-semibold text-slate-600">
          Sentimiento
          <select
            className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as CommentSentimentFilter)}
          >
            <option value="all">Todos</option>
            <option value="positive">Positivo</option>
            <option value="negative">Negativo</option>
            <option value="neutral">Neutro</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Spam
          <select
            className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
            value={spamFilter}
            onChange={(e) => setSpamFilter(e.target.value as CommentSpamFilter)}
          >
            <option value="all">Todos</option>
            <option value="not_spam">No spam</option>
            <option value="spam">Spam</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Relaci\u00f3n
          <select
            className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
            value={relatedFilter}
            onChange={(e) => setRelatedFilter(e.target.value as CommentRelatedFilter)}
          >
            <option value="all">Todos</option>
            <option value="related">Relacionados</option>
            <option value="not_related">No relacionados</option>
          </select>
        </label>
      </div>

      {/* List */}
      {loading && comments.length === 0 && <p className="text-sm text-slate-600">Cargando comentarios...</p>}
      {!loading && comments.length === 0 && <p className="text-sm text-slate-600">No hay comentarios para estos filtros.</p>}

      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              canOverride={canOverride}
              updating={updatingId === comment.id}
              onPatch={patchComment}
            />
          ))}

          {hasNext && (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void load(true, cursor ?? undefined)}
              disabled={loading}
            >
              {loading ? "Cargando..." : "Cargar m\u00e1s comentarios"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PostDetailComments;
