import React, { useMemo, useState } from "react";
import { Card, Empty, Button, Typography, Flex, Spin } from "antd";
import type { PostRow, PostsViewMode, SocialChannel, SocialPostSort } from "./postsTypes";
import PostsFilters from "./PostsFilters";
import PostsToolbar from "./PostsToolbar";
import PostsTableView from "./PostsTableView";
import PostsCardGrid from "./PostsCardGrid";
import PostDetailModal from "./PostDetailModal";
import type { ApiClient } from "../../api/client";

const { Title, Text } = Typography;

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
    <Card>
      <div style={{ marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>Posts</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Navegador de posts con m&eacute;tricas, sentimiento y comentarios.
        </Text>
      </div>

      {/* Filters */}
      <PostsFilters
        textSearch={textSearch}
        onTextSearchChange={setTextSearch}
        activeChannels={activeChannels}
        onToggleChannel={onToggleChannel}
      />

      {/* Toolbar */}
      <div style={{ marginTop: 8, marginBottom: 12 }}>
        <PostsToolbar
          totalVisible={filteredPosts.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sort={postsSort}
          onSortChange={onSortChange}
          loading={loadingPosts}
        />
      </div>

      {/* Loading state */}
      {loadingPosts && filteredPosts.length === 0 && (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin size="large" />
        </Flex>
      )}

      {/* Empty state */}
      {!loadingPosts && filteredPosts.length === 0 && (
        <Empty
          description={textSearch ? "Ning\u00fan post coincide con la b\u00fasqueda." : "Sin posts para estos filtros."}
          style={{ padding: "24px 0" }}
        />
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
        <Flex justify="center" style={{ marginTop: 12 }}>
          <Button
            onClick={onLoadMore}
            loading={loadingMorePosts}
          >
            {loadingMorePosts ? "Cargando..." : "Cargar m\u00e1s posts"}
          </Button>
        </Flex>
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
    </Card>
  );
};

export default PostsTab;
