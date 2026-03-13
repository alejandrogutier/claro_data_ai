import React, { useMemo, useState } from "react";
import type { PostRow, PostsViewMode, SocialChannel, SocialPostSort } from "./postsTypes";
import PostsFilters from "./PostsFilters";
import PostsToolbar from "./PostsToolbar";
import PostsTableView from "./PostsTableView";
import PostsCardGrid from "./PostsCardGrid";
import PostDetailModal from "./PostDetailModal";
import type { ApiClient } from "../../api/client";

type Props = {
  posts: PostRow[];
  loadingPosts: boolean;
  postsHasNext: boolean;
  loadingMorePosts: boolean;
  postsSort: SocialPostSort;
  onSortChange: (sort: SocialPostSort) => void;
  onLoadMore: () => void;
  canOverrideComments: boolean;
  client: ApiClient;
  onError: (error: unknown) => void;
  /** Current globally active channels (from URL params) */
  activeChannels: SocialChannel[];
  /** Toggle channel filter in the global query */
  onToggleChannel: (channel: SocialChannel) => void;
};

const PostsTab: React.FC<Props> = ({
  posts,
  loadingPosts,
  postsHasNext,
  loadingMorePosts,
  postsSort,
  onSortChange,
  onLoadMore,
  canOverrideComments,
  client,
  onError,
  activeChannels,
  onToggleChannel
}) => {
  const [viewMode, setViewMode] = useState<PostsViewMode>("table");
  const [selectedPost, setSelectedPost] = useState<PostRow | null>(null);
  const [textSearch, setTextSearch] = useState("");

  // Client-side text filter
  const filteredPosts = useMemo(() => {
    if (!textSearch.trim()) return posts;
    const q = textSearch.toLowerCase().trim();
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.text ?? "").toLowerCase().includes(q) ||
        p.account_name.toLowerCase().includes(q) ||
        (p.campaign ?? "").toLowerCase().includes(q)
    );
  }, [posts, textSearch]);

  const handleSelectPost = (post: PostRow) => setSelectedPost(post);
  const handleCloseModal = () => setSelectedPost(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-900">Posts</h3>
        <span className="text-xs text-slate-500">
          Navegador de posts con m\u00e9tricas, sentimiento y comentarios.
        </span>
      </div>

      {/* Filters */}
      <PostsFilters
        textSearch={textSearch}
        onTextSearchChange={setTextSearch}
        activeChannels={activeChannels}
        onToggleChannel={onToggleChannel}
      />

      {/* Toolbar */}
      <div className="mt-2 mb-3">
        <PostsToolbar
          totalVisible={filteredPosts.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sort={postsSort}
          onSortChange={onSortChange}
          loading={loadingPosts}
        />
      </div>

      {/* Empty state */}
      {!loadingPosts && filteredPosts.length === 0 && (
        <p className="text-sm text-slate-600 py-6 text-center">
          {textSearch ? "Ning\u00fan post coincide con la b\u00fasqueda." : "Sin posts para estos filtros."}
        </p>
      )}

      {/* Views */}
      {filteredPosts.length > 0 && viewMode === "table" && (
        <PostsTableView posts={filteredPosts} onSelectPost={handleSelectPost} />
      )}

      {filteredPosts.length > 0 && viewMode === "cards" && (
        <PostsCardGrid posts={filteredPosts} onSelectPost={handleSelectPost} />
      )}

      {/* Load more */}
      {postsHasNext && (
        <div className="mt-3 text-center">
          <button
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={onLoadMore}
            disabled={loadingMorePosts}
          >
            {loadingMorePosts ? "Cargando..." : "Cargar m\u00e1s posts"}
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={handleCloseModal}
          client={client}
          canOverrideComments={canOverrideComments}
          onError={onError}
        />
      )}
    </section>
  );
};

export default PostsTab;
