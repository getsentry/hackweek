import {useReducer} from 'react';

// Module-level caches shared by every Avatar instance for the life of the
// page. The same user often appears in many places at once (member stacks,
// team panels, admin lists), so once we know a URL loads or is broken we
// never want to re-request it or flash a fallback again.
const loadedAvatarUrls = new Set<string>();
const failedAvatarUrls = new Set<string>();

export interface AvatarProps {
  displayName: string;
  avatarUrl?: string | null;
  className?: string;
}

export function Avatar({displayName, avatarUrl, className}: AvatarProps) {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const failed = Boolean(avatarUrl) && failedAvatarUrls.has(avatarUrl!);
  const showImage = Boolean(avatarUrl) && !failed;

  return (
    <span className={className ? `avatar ${className}` : 'avatar'} title={displayName}>
      {showImage ? (
        <img
          key={avatarUrl}
          src={avatarUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => loadedAvatarUrls.add(avatarUrl!)}
          onError={() => {
            failedAvatarUrls.add(avatarUrl!);
            forceRender();
          }}
        />
      ) : (
        initials(displayName)
      )}
    </span>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
