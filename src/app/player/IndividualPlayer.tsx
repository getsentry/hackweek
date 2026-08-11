import {useEffect, useRef, useState} from 'react';

import type {PlaybackResponse} from '../../shared/videos';
import {attachMp4} from './media';

export function IndividualPlayer({
  playback,
  title,
}: {
  playback: PlaybackResponse;
  title: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video.current || playback.source.kind !== 'mp4') return;
    setError(null);
    const attachment = attachMp4(video.current, playback.source.url, undefined, setError);
    return () => attachment.destroy();
  }, [playback.source]);

  return (
    <div className="individualPlayer">
      <video ref={video} controls playsInline aria-label={`${title} video`} />
      {error && (
        <p className="formError" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
