import {useEffect, useState} from 'react';

export function UserAvatar({
  user,
  className = '',
}: {
  user: {id: string; displayName: string; avatarUrl?: string | null};
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [user.id, user.avatarUrl]);

  const classes = `userAvatar${className ? ` ${className}` : ''}`;
  if (!user.avatarUrl || failed) {
    return (
      <span className={`${classes} userAvatar--fallback`} aria-hidden="true">
        {initials(user.displayName)}
      </span>
    );
  }

  return (
    <img
      className={classes}
      src={`/api/users/${encodeURIComponent(user.id)}/avatar`}
      alt=""
      loading="lazy"
      decoding="async"
      width={64}
      height={64}
      onError={() => setFailed(true)}
    />
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
