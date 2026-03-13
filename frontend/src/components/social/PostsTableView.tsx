import React, { useState } from "react";
import type { PostRow } from "./postsTypes";
import { channelColors, channelIcon, toChannelLabel, truncate, formatDate, formatNumber, formatPercent, computeER, erLabel, sentimentPillClass } from "./postsUtils";

type Props = {
  posts: PostRow[];
  onSelectPost: (post: PostRow) => void;
};

const PostsTableView: React.FC<Props> = ({ posts, onSelectPost }) => {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const handleImgError = (postId: string) => {
    setImgErrors((prev) => new Set(prev).add(postId));
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-[1060px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2 w-[60px]"></th>
            <th className="px-2 py-2">Fecha</th>
            <th className="px-2 py-2">Canal</th>
            <th className="px-2 py-2">Cuenta</th>
            <th className="px-2 py-2">Post</th>
            <th className="px-2 py-2">Sentimiento</th>
            <th className="px-2 py-2">Reach</th>
            <th className="px-2 py-2">Engagement</th>
            <th className="px-2 py-2">ER</th>
            <th className="px-2 py-2">Comentarios</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const er = computeER(post);
            const colors = channelColors[post.channel] ?? channelColors.facebook;
            const showReach = post.reach > 0;
            const hasImage = post.image_url && !imgErrors.has(post.id);

            return (
              <tr
                key={post.id}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => onSelectPost(post)}
              >
                {/* Thumbnail */}
                <td className="px-2 py-2">
                  {hasImage ? (
                    <img
                      src={post.image_url!}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                      loading="lazy"
                      onError={() => handleImgError(post.id)}
                    />
                  ) : (
                    <div className={`h-12 w-12 rounded-lg flex items-center justify-center text-lg ${colors.bg}`}>
                      {channelIcon[post.channel] ?? "?"}
                    </div>
                  )}
                </td>
                {/* Date */}
                <td className="px-2 py-2 text-slate-600">{formatDate(post.published_at)}</td>
                {/* Channel */}
                <td className="px-2 py-2">
                  <span className={`inline-flex items-center gap-1 ${colors.text} font-medium`}>
                    <span>{channelIcon[post.channel]}</span>
                    <span>{toChannelLabel(post.channel)}</span>
                  </span>
                </td>
                {/* Account */}
                <td className="px-2 py-2 text-slate-700">{post.account_name}</td>
                {/* Post title */}
                <td className="px-2 py-2">
                  <div className="grid gap-0.5">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                      {truncate(post.title, 50)}
                      {post.post_type && <span className="post-type-badge">{post.post_type}</span>}
                    </span>
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-red-700 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ver post
                    </a>
                  </div>
                </td>
                {/* Sentiment */}
                <td className="px-2 py-2">
                  <span className={sentimentPillClass(post.sentiment)}>{post.sentiment}</span>
                </td>
                {/* Reach / Impressions */}
                <td className="px-2 py-2">
                  <div>
                    <span className="font-semibold">{formatNumber(showReach ? post.reach : post.impressions)}</span>
                    {!showReach && post.impressions > 0 && <span className="ml-1 text-[10px] text-slate-400">(imp)</span>}
                  </div>
                </td>
                {/* Engagement */}
                <td className="px-2 py-2 font-semibold">{formatNumber(post.engagement_total)}</td>
                {/* ER */}
                <td className="px-2 py-2">
                  <span className="font-semibold">{formatPercent(er)}</span>
                </td>
                {/* Comments */}
                <td className="px-2 py-2">
                  <span className="font-semibold">{formatNumber(post.comments)}</span>
                  {post.awario_comments_count > 0 && (
                    <span className="ml-1 text-[10px] text-slate-500">({formatNumber(post.awario_comments_count)} capt.)</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PostsTableView;
