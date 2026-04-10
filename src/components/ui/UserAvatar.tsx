import React from 'react';
import type { AvatarConfig } from '../../lib/avatarTypes';

interface UserAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ config, size = 48, className = '' }) => {
  if (!config) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={{ borderRadius: size * 0.3 }}>
        <rect width="100" height="100" rx="30" fill="#E8E8E8" />
        <circle cx="50" cy="40" r="16" fill="#C0C0C0" />
        <path d="M 25 100 C 25 75, 75 75, 75 100 Z" fill="#C0C0C0" />
      </svg>
    );
  }

  if (config.avatarType === 'ai' && config.aiUrl) {
    return (
      <div
        className={`overflow-hidden shadow-inner bg-gray-100 ${className}`}
        style={{ width: size, height: size, borderRadius: size * 0.3 }}
      >
        <img
          src={config.aiUrl}
          alt="Avatar IA"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=User`;
          }}
        />
      </div>
    );
  }

  const style = config.dicebearStyle || 'lorelei';
  const seed = config.seed || 'default';
  const backgroundColor = config.bgColor ? config.bgColor.replace('#', '') : 'D4E8FF';
  const dicebearUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&backgroundColor=${backgroundColor}`;

  return (
    <div
      className={`overflow-hidden shadow-inner bg-gray-50 ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
    >
      <img
        src={dicebearUrl}
        alt="Avatar"
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`;
        }}
      />
    </div>
  );
};

export default UserAvatar;
