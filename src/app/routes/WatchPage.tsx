import {useQuery} from '@tanstack/react-query';
import {Link, useParams} from 'wouter';

import {IndividualPlayer} from '../player/IndividualPlayer';
import {ScreeningPlayer} from '../player/ScreeningPlayer';
import {getPlayback, usePlaylist, useProjectVideo} from '../queries/videos';
import {PageState, QueryState} from '../components/AppLayout';

export function WatchPage() {
  const {yearId} = useParams<{yearId: string}>();
  const playlist = usePlaylist(yearId);
  return (
    <QueryState loading={playlist.isLoading} error={playlist.error}>
      {playlist.data && (
        <main className="watchPage">
          <header className="watchHeader">
            <div>
              <Link className="backLink" href={`/years/${yearId}/projects`}>
                ← {yearId} projects
              </Link>
              <p className="kicker">Hackweek {yearId} / screening</p>
              <h1>play the reel</h1>
            </div>
            <p>private progressive MP4 playback in the curated screening order.</p>
          </header>
          <ScreeningPlayer playlist={playlist.data.videos} getPlayback={getPlayback} />
          {playlist.data.videos.length > 0 && (
            <section className="reelIndex" aria-labelledby="reel-index-heading">
              <p className="kicker">on demand</p>
              <h2 id="reel-index-heading">watch one project</h2>
              <ol>
                {playlist.data.videos.map((clip) => (
                  <li key={clip.videoId}>
                    <span>{String(clip.position + 1).padStart(2, '0')}</span>
                    <Link href={`/years/${yearId}/watch/${clip.videoId}`}>
                      <strong>{clip.projectName}</strong>
                      <small>{formatDuration(clip.durationSeconds)}</small>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </main>
      )}
    </QueryState>
  );
}

export function ProjectVideoWatchPage() {
  const {yearId, projectId} = useParams<{yearId: string; projectId: string}>();
  const video = useProjectVideo(projectId);
  const playback = useQuery({
    queryKey: ['video-playback', video.data?.video?.id],
    queryFn: () => getPlayback(video.data!.video!.id),
    enabled: video.data?.video?.status === 'ready',
  });
  const error = video.error ?? playback.error;

  return (
    <QueryState loading={video.isLoading || playback.isLoading} error={error}>
      {video.data?.video?.status !== 'ready' ? (
        <PageState
          title="video unavailable"
          detail="only a ready project video can be played. processing and failed videos remain visible to their team."
          tone="error"
        />
      ) : playback.data ? (
        <main className="watchPage watchPage--single">
          <header className="watchHeader pageHeader">
            <div>
              <Link className="backLink" href={`/years/${yearId}/projects/${projectId}`}>
                ← project details
              </Link>
              <p className="kicker">project video / {yearId}</p>
              <h1>demo video</h1>
            </div>
          </header>
          <IndividualPlayer playback={playback.data} title="project demo" />
        </main>
      ) : null}
    </QueryState>
  );
}

export function VideoWatchPage() {
  const {yearId, videoId} = useParams<{yearId: string; videoId: string}>();
  const playlist = usePlaylist(yearId);
  const clip = playlist.data?.videos.find((item) => item.videoId === videoId);
  const playback = useQuery({
    queryKey: ['video-playback', videoId],
    queryFn: () => getPlayback(videoId),
    enabled: Boolean(clip),
  });
  const error = playlist.error ?? playback.error;

  return (
    <QueryState
      loading={playlist.isLoading || (Boolean(clip) && playback.isLoading)}
      error={error}
    >
      {!clip ? (
        <PageState
          title="video unavailable"
          detail="this ready video is not in the screening archive."
          tone="error"
        />
      ) : playback.data ? (
        <main className="watchPage watchPage--single">
          <header className="watchHeader pageHeader">
            <div>
              <Link className="backLink" href={`/years/${yearId}/watch`}>
                ← screening reel
              </Link>
              <p className="kicker">project video / {yearId}</p>
              <h1>{clip.projectName}</h1>
            </div>
            <Link
              className="textAction"
              href={`/years/${yearId}/projects/${clip.projectId}`}
            >
              project details
            </Link>
          </header>
          <IndividualPlayer playback={playback.data} title={clip.projectName} />
        </main>
      ) : null}
    </QueryState>
  );
}

function formatDuration(value: number) {
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
}
