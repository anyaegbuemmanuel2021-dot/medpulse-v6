import React from 'react';

interface PostCardProps {
  id: string;
  author: {
    name: string;
    image?: string;
    verified?: boolean;
  };
  title: string;
  description: string;
  image?: string;
  video?: string;
  engagement: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  timestamp: string;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onSave?: () => void;
  isLiked?: boolean;
  isSaved?: boolean;
}

export function PostCard({
  id,
  author,
  title,
  description,
  image,
  video,
  engagement,
  timestamp,
  onLike,
  onComment,
  onShare,
  onSave,
  isLiked = false,
  isSaved = false,
}: PostCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {author.image && (
            <img
              src={author.image}
              alt={author.name}
              className="w-10 h-10 rounded-full"
            />
          )}
          <div>
            <div className="flex items-center gap-1">
              <p className="font-semibold text-slate-900">{author.name}</p>
              {author.verified && (
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-slate-500">{timestamp}</p>
          </div>
        </div>
        <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-4 line-clamp-3">{description}</p>

        {/* Media */}
        {(image || video) && (
          <div className="mb-4 rounded-lg overflow-hidden bg-slate-100 aspect-video">
            {image && (
              <img
                src={image}
                alt={title}
                className="w-full h-full object-cover"
              />
            )}
            {video && (
              <video
                src={video}
                className="w-full h-full object-cover"
                controls
              />
            )}
          </div>
        )}
      </div>

      {/* Engagement Stats */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>{engagement.views.toLocaleString()} views</span>
          <div className="flex gap-4">
            <span>{engagement.likes} likes</span>
            <span>{engagement.comments} comments</span>
            <span>{engagement.shares} shares</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
        <button
          onClick={onLike}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors flex-1 ${
            isLiked
              ? 'text-red-600 bg-red-50'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="text-sm font-medium">Like</span>
        </button>

        <button
          onClick={onComment}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span className="text-sm font-medium">Comment</span>
        </button>

        <button
          onClick={onShare}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C9.589 12.438 10.604 12 11.682 12h5.364c1.079 0 2.094.438 2.999 1.342m-9.122 0a3 3 0 00-4.242 0M9 3h3.5m0 0h3.5M12 3v15m9-9H3" />
          </svg>
          <span className="text-sm font-medium">Share</span>
        </button>

        <button
          onClick={onSave}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors flex-1 ${
            isSaved
              ? 'text-blue-600 bg-blue-50'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <svg className="w-5 h-5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z" />
          </svg>
          <span className="text-sm font-medium">Save</span>
        </button>
      </div>
    </div>
  );
}
