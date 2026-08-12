import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import year2026Banner from '../../assets/images/banner/year-2026.png';
import year2026Intro from '../../assets/videos/reel/year-2026-intro.mp4';
import type {PlaylistItem, PlaybackResponse} from '../../shared/videos';
import {createPlayerAudioGraph} from './audio';
import {
  createScreeningController,
  type PlayerState,
  type ScreeningController,
} from './controller';

export interface ScreeningPlayerHandle {
  playFrom(videoId: string): void;
}

const initialState = (index: number, durationSeconds: number): PlayerState => ({
  phase: 'idle',
  index,
  error: null,
  countdownSeconds: null,
  currentTime: 0,
  durationSeconds,
});

export const ScreeningPlayer = forwardRef<
  ScreeningPlayerHandle,
  {
    playlist: PlaylistItem[];
    getPlayback: (videoId: string) => Promise<PlaybackResponse>;
    yearId: string;
    initialVideoId?: string | null;
    onActiveVideoChange?: (videoId: string) => void;
  }
>(function ScreeningPlayer(
  {playlist, getPlayback, yearId, initialVideoId, onActiveVideoChange},
  ref,
) {
  const shell = useRef<HTMLDivElement>(null);
  const videos = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
  ] as const;
  const controller = useRef<ScreeningController | null>(null);
  const announcedVideoId = useRef<string | null>(null);
  const requestedIndex = playlist.findIndex((clip) => clip.videoId === initialVideoId);
  const initialIndex = Math.max(0, requestedIndex);
  const [state, setState] = useState(
    initialState(initialIndex, playlist[initialIndex]?.durationSeconds ?? 0),
  );

  const publishState = useCallback(
    (next: PlayerState) => {
      setState(next);
      const videoId = playlist[next.index]?.videoId;
      if (next.phase === 'title' && videoId && announcedVideoId.current !== videoId) {
        announcedVideoId.current = videoId;
        onActiveVideoChange?.(videoId);
      }
    },
    [onActiveVideoChange, playlist],
  );

  const buildController = useCallback(() => {
    if (controller.current) return controller.current;
    const first = videos[0].current;
    const second = videos[1].current;
    if (!first || !second) return null;
    const audio = createPlayerAudioGraph([first, second]);
    controller.current = createScreeningController({
      playlist,
      elements: [first, second],
      audio,
      getPlayback,
      onState: publishState,
    });
    return controller.current;
  }, [getPlayback, playlist, publishState, videos]);

  useImperativeHandle(
    ref,
    () => ({
      playFrom(videoId) {
        const index = playlist.findIndex((item) => item.videoId === videoId);
        if (index >= 0) void buildController()?.jumpTo(index);
      },
    }),
    [buildController, playlist],
  );

  useEffect(() => () => controller.current?.destroy(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handleScreeningShortcut(event, {
        togglePause: () => void controller.current?.togglePause(),
        skip: () => void controller.current?.skip(),
        fullscreen: () => void shell.current?.requestFullscreen().catch(() => undefined),
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!playlist.length) {
    return (
      <section className="screeningEmpty">
        <span>∅</span>
        <h2>no videos are ready</h2>
        <p>uploading, processing, and failed videos stay out of the reel.</p>
      </section>
    );
  }

  const activeIndex = playlist[state.index] ? state.index : 0;
  const clip = playlist[activeIndex];
  const activeSlot = activeIndex % 2;
  const showingTitle = state.phase === 'title';
  const hasYear2026Artwork = yearId === '2026';
  const team =
    clip.teamMembers.map(({displayName}) => displayName).join(' · ') || 'Hackweek team';
  const projectMeta = [clip.groupName, team].filter(Boolean).join(' · ');
  const canSeek = ['playing', 'paused'].includes(state.phase);
  const timelineDuration = state.durationSeconds || clip.durationSeconds;

  return (
    <div className="screeningPlayer" ref={shell} tabIndex={-1}>
      <div className="screeningStage" aria-label="Hackweek screening player">
        <video
          ref={videos[0]}
          className={`screeningClip ${activeSlot === 0 && !showingTitle ? 'active' : ''}`}
          playsInline
          aria-label="screening video one"
        />
        <video
          ref={videos[1]}
          className={`screeningClip ${activeSlot === 1 && !showingTitle ? 'active' : ''}`}
          playsInline
          aria-label="screening video two"
        />
        <div
          className={`titleCard ${hasYear2026Artwork ? 'titleCard--artwork' : ''} ${showingTitle ? 'visible' : ''}`}
          aria-live="polite"
        >
          {hasYear2026Artwork && showingTitle && (
            <video
              className="titleCardBackdrop"
              src={year2026Intro}
              poster={year2026Banner}
              preload="auto"
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
            />
          )}
          <div className="titleCardFrame">
            <div className="titleCardTopline">
              <span>
                project {String(activeIndex + 1).padStart(2, '0')} /{' '}
                {String(playlist.length).padStart(2, '0')}
              </span>
              <span>Hackweek {yearId}</span>
            </div>
            <div className="titleCardCopy">
              <p>
                {clip.groupName && <strong>{clip.groupName}</strong>}
                up next
              </p>
              <h2>{clip.projectName}</h2>
              <div className="titleCardTeam">
                <small>built by</small>
                <span>{team}</span>
              </div>
            </div>
            {state.countdownSeconds && (
              <div
                className="titleCountdown"
                aria-label={`${state.countdownSeconds} seconds until video`}
              >
                <small>playing in</small>
                <b>{state.countdownSeconds}</b>
              </div>
            )}
          </div>
        </div>
        {['playing', 'paused'].includes(state.phase) && (
          <div className="clipOverlay" aria-live="polite" key={clip.videoId}>
            <strong>{clip.projectName}</strong>
            <span>{projectMeta}</span>
          </div>
        )}
        {state.phase === 'idle' && (
          <div className={`startCard ${hasYear2026Artwork ? 'startCard--artwork' : ''}`}>
            {hasYear2026Artwork && (
              <img
                className="startCardArtwork"
                src={year2026Banner}
                alt="Hackweek 2026"
              />
            )}
            <div className="startCardContent">
              {!hasYear2026Artwork && <span className="screeningMark">#H</span>}
              <p className="startCardKicker">Hackweek {yearId} screening</p>
              <h2>the project reel</h2>
              <p>{playlist.length} ready project videos</p>
              <button
                className="screeningStart"
                onClick={() => void buildController()?.start(activeIndex)}
              >
                {activeIndex === 0 ? 'play all' : `play from ${clip.projectName}`}
              </button>
              <small>sound starts only after you press play</small>
            </div>
          </div>
        )}
        {state.phase === 'complete' && (
          <div className="startCard" aria-live="polite">
            <span className="screeningMark">✓</span>
            <h2>that’s the reel</h2>
            <p>all remaining ready videos played.</p>
          </div>
        )}
        {state.phase === 'error' && (
          <div className="playerError" role="alert">
            <strong>{clip.projectName} could not be played</strong>
            <p>{state.error}</p>
            <small>continuing automatically…</small>
            <button
              className="screeningStart"
              onClick={() => void controller.current?.skip()}
            >
              {activeIndex < playlist.length - 1 ? 'skip now' : 'finish reel'}
            </button>
          </div>
        )}
      </div>
      <div className="screeningControls" aria-label="Playback controls">
        <div className="screeningTimeline">
          <span>{formatPlaybackTime(state.currentTime)}</span>
          <input
            type="range"
            aria-label="video position"
            min={0}
            max={Math.max(timelineDuration, 0.1)}
            step={0.1}
            value={Math.min(state.currentTime, timelineDuration)}
            disabled={!canSeek}
            onChange={(event) =>
              controller.current?.seek(event.currentTarget.valueAsNumber)
            }
          />
          <span>{formatPlaybackTime(timelineDuration)}</span>
        </div>
        <button
          disabled={!['playing', 'paused'].includes(state.phase)}
          onClick={() => void controller.current?.togglePause()}
        >
          {state.phase === 'paused' ? '▶ resume' : 'Ⅱ pause'} <kbd>space</kbd>
        </button>
        <div className="screeningNowPlaying" aria-live="polite">
          <strong>{clip.projectName}</strong>
          <span>
            {activeIndex + 1} of {playlist.length}
          </span>
        </div>
        <button
          disabled={state.phase === 'idle' || state.phase === 'complete'}
          onClick={() => void controller.current?.skip()}
        >
          skip → <kbd>→</kbd>
        </button>
        <button
          onClick={() => void shell.current?.requestFullscreen().catch(() => undefined)}
        >
          fullscreen <kbd>f</kbd>
        </button>
      </div>
    </div>
  );
});

function formatPlaybackTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function handleScreeningShortcut(
  event: Pick<KeyboardEvent, 'code' | 'key' | 'target' | 'preventDefault'>,
  actions: {togglePause(): void; skip(): void; fullscreen(): void},
) {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
  if (event.code === 'Space') actions.togglePause();
  else if (event.code === 'ArrowRight') actions.skip();
  else if (event.key.toLowerCase() === 'f') actions.fullscreen();
  else return;
  event.preventDefault();
}
