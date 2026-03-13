import React from "react";
import type { PostRow } from "./postsTypes";
import PostCard from "./PostCard";

type Props = {
  posts: PostRow[];
  onSelectPost: (post: PostRow) => void;
};

const PostsCardGrid: React.FC<Props> = ({ posts, onSelectPost }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {posts.map((post) => (
      <PostCard key={post.id} post={post} onSelect={onSelectPost} />
    ))}
  </div>
);

export default PostsCardGrid;
