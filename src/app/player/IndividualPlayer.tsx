import {useEffect, useRef, useState} from 'react';

import type {PlaybackResponse} from '../../shared/videos';
import {attachProtectedHls} from './media';

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
    if (!video.current || !playback.manifestUrl) return;
    const attachment = attachProtectedHls(
      video.current,
      playback.manifestUrl,
      undefined,
      setError,
    );
    return () => attachment.destroy();
  }, [playback.manifestUrl]);

  if (!playback.manifestUrl) {
    return (
      <p className="formError" role="alert">
        local fake Stream has no HLS manifest. protected playback must be validated in
        staging.
      </p>
    );
  }

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
