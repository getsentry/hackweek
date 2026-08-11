import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

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
    initialVideoId?: string | null;
    onActiveVideoChange?: (videoId: string) => void;
  }
>(function ScreeningPlayer(
  {playlist, getPlayback, initialVideoId, onActiveVideoChange},
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
  const clip = playlist[state.index];

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

  const activeSlot = state.index % 2;
  const showingTitle = state.phase === 'title';
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
          className={activeSlot === 0 && !showingTitle ? 'active' : ''}
          playsInline
          aria-label="screening video one"
        />
        <video
          ref={videos[1]}
          className={activeSlot === 1 && !showingTitle ? 'active' : ''}
          playsInline
          aria-label="screening video two"
        />
        <div className={`titleCard ${showingTitle ? 'visible' : ''}`} aria-live="polite">
          <p>#{String(state.index + 1).padStart(2, '0')} / Hackweek</p>
          <h2>{clip.projectName}</h2>
          {clip.groupName && <strong>{clip.groupName}</strong>}
          <span>{team}</span>
          {state.countdownSeconds && (
            <b
              className="titleCountdown"
              aria-label={`${state.countdownSeconds} seconds until video`}
            >
              {state.countdownSeconds}
            </b>
          )}
        </div>
        {['playing', 'paused'].includes(state.phase) && (
          <div className="clipOverlay" aria-live="polite" key={clip.videoId}>
            <strong>{clip.projectName}</strong>
            <span>{projectMeta}</span>
          </div>
        )}
        {state.phase === 'idle' && (
          <div className="startCard">
            <span className="screeningMark">#H</span>
            <h2>the Hackweek reel</h2>
            <p>{playlist.length} ready project videos</p>
            <button
              className="screeningStart"
              onClick={() => void buildController()?.start(state.index)}
            >
              {state.index === 0 ? 'play all' : `play from ${clip.projectName}`}
            </button>
            <small>sound starts only after you press play</small>
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
              {state.index < playlist.length - 1 ? 'skip now' : 'finish reel'}
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
        <div aria-live="polite">
          <strong>{clip.projectName}</strong>
          <span>
            {state.index + 1} of {playlist.length}
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
