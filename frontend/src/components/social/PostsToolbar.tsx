import React from "react";
import type { PostsViewMode, SocialPostSort } from "./postsTypes";
import { POST_SORT_OPTIONS, toPostSortLabel } from "./postsUtils";

type Props = {
  totalVisible: number;
  viewMode: PostsViewMode;
  onViewModeChange: (mode: PostsViewMode) => void;
  sort: SocialPostSort;
  onSortChange: (sort: SocialPostSort) => void;
  loading?: boolean;
};

const PostsToolbar: React.FC<Props> = ({ totalVisible, viewMode, onViewModeChange, sort, onSortChange, loading }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500">{totalVisible} post{totalVisible !== 1 ? "s" : ""}</span>
      {loading && <span className="text-xs text-slate-400">Actualizando...</span>}
    </div>

    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold text-slate-600">
        Orden
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SocialPostSort)}
          className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
        >
          {POST_SORT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {toPostSortLabel(opt)}
            </option>
          ))}
        </select>
      </label>

      <div className="monitor-feed-view-toggle">
        <button
          type="button"
          className={`btn btn-sm ${viewMode === "table" ? "is-active" : ""}`}
          onClick={() => onViewModeChange("table")}
        >
          Tabla
        </button>
        <button
          type="button"
          className={`btn btn-sm ${viewMode === "cards" ? "is-active" : ""}`}
          onClick={() => onViewModeChange("cards")}
        >
          Cards
        </button>
      </div>
    </div>
  </div>
);

export default PostsToolbar;
