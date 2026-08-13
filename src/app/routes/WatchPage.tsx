import {useCallback, useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link, useParams, useSearchParams} from 'wouter';

import {ProjectListItem} from '../components/ProjectCard';
import {IndividualPlayer} from '../player/IndividualPlayer';
import {ScreeningPlayer, type ScreeningPlayerHandle} from '../player/ScreeningPlayer';
import {getPlayback, usePlaylist, useProjectVideo} from '../queries/videos';
import {PageState, QueryState} from '../components/AppLayout';
import type {PlaylistItem} from '../../shared/videos';

const UNGROUPED_PLAYLIST_ID = '__ungrouped__';

export function WatchPage() {
  const {yearId} = useParams<{yearId: string}>();
  const playlist = usePlaylist(yearId);
  const player = useRef<ScreeningPlayerHandle>(null);
  const [search, setSearch] = useSearchParams();
  const initialVideoId = search.get('from');
  const videos = playlist.data?.videos ?? [];
  const groups = playlistGroups(videos);
  const selectedGroupId = search.get('group');
  const selectedGroup = groups.find(({id}) => id === selectedGroupId) ?? null;
  const selectedVideos = selectedGroup
    ? videos.filter((video) => playlistGroupId(video) === selectedGroup.id)
    : videos;
  const selectGroup = useCallback(
    (groupId: string | null) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          if (groupId) next.set('group', groupId);
          else next.delete('group');
          next.delete('from');
          return next;
        },
        {replace: true},
      );
    },
    [setSearch],
  );
  const trackActiveVideo = useCallback(
    (videoId: string) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('from', videoId);
          return next;
        },
        {replace: true},
      );
    },
    [setSearch],
  );
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
          </header>
          {groups.length > 0 && (
            <section className="reelGroups" aria-labelledby="reel-groups-heading">
              <header>
                <div>
                  <p className="kicker">watch party playlists</p>
                  <h2 id="reel-groups-heading">choose a group</h2>
                </div>
                <p>{selectedVideos.length} ready videos in this playlist</p>
              </header>
              <div className="reelGroupGrid" role="group" aria-label="Playlist group">
                <button
                  type="button"
                  aria-pressed={!selectedGroup}
                  onClick={() => selectGroup(null)}
                >
                  <strong>all groups</strong>
                  <span>{videoCountLabel(videos.length)}</span>
                </button>
                {groups.map((group) => (
                  <button
                    type="button"
                    aria-pressed={selectedGroup?.id === group.id}
                    key={group.id}
                    onClick={() => selectGroup(group.id)}
                  >
                    <strong>{group.name}</strong>
                    <span>{videoCountLabel(group.videoCount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <ScreeningPlayer
            key={selectedVideos.map(({videoId}) => videoId).join(':')}
            ref={player}
            playlist={selectedVideos}
            getPlayback={getPlayback}
            yearId={yearId}
            initialVideoId={initialVideoId}
            onActiveVideoChange={trackActiveVideo}
          />
          {selectedVideos.length > 0 && (
            <section className="reelIndex" aria-labelledby="reel-index-heading">
              <p className="kicker">screening order</p>
              <h2 id="reel-index-heading">
                {selectedGroup ? `${selectedGroup.name} playlist` : 'playlist'}
              </h2>
              <div className="projectList reelPlaylist">
                {selectedVideos.map((clip, index) => (
                  <ProjectListItem
                    key={clip.videoId}
                    name={clip.projectName}
                    groupName={clip.groupName ?? 'ungrouped'}
                    detail={`${String(index + 1).padStart(2, '0')} · ${formatDuration(clip.durationSeconds)}`}
                    members={clip.teamMembers}
                    emptyMemberLabel="Hackweek team"
                    actionLabel={`start reel from ${clip.projectName}`}
                    onSelect={() => player.current?.playFrom(clip.videoId)}
                  />
                ))}
              </div>
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

function playlistGroups(videos: PlaylistItem[]) {
  const groups = new Map<string, {id: string; name: string; videoCount: number}>();
  for (const video of videos) {
    const id = playlistGroupId(video);
    const group = groups.get(id);
    if (group) group.videoCount += 1;
    else groups.set(id, {id, name: video.groupName ?? 'ungrouped', videoCount: 1});
  }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function playlistGroupId(video: PlaylistItem) {
  return video.groupId ?? UNGROUPED_PLAYLIST_ID;
}

function videoCountLabel(count: number) {
  return `${count} ${count === 1 ? 'video' : 'videos'}`;
}

function formatDuration(value: number) {
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
}
