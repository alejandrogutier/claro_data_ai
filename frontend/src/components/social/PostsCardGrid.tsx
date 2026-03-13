import React from "react";
import { Row, Col } from "antd";
import type { PostRow } from "./postsTypes";
import PostCard from "./PostCard";

type Props = {
  posts: PostRow[];
  onSelectPost: (post: PostRow) => void;
};

const PostsCardGrid: React.FC<Props> = ({ posts, onSelectPost }) => (
  <Row gutter={[16, 20]}>
    {posts.map((post) => (
      <Col key={post.id} xs={24} sm={12} lg={8} xl={6}>
        <PostCard post={post} onSelect={onSelectPost} />
      </Col>
    ))}
  </Row>
);

export default PostsCardGrid;
