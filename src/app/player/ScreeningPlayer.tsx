import {useCallback, useEffect, useRef, useState} from 'react';

import type {PlaylistItem, PlaybackResponse} from '../../shared/videos';
import {createPlayerAudioGraph} from './audio';
import {
  createScreeningController,
  type PlayerState,
  type ScreeningController,
} from './controller';

const INITIAL_STATE: PlayerState = {phase: 'idle', index: 0, error: null};

export function ScreeningPlayer({
  playlist,
  getPlayback,
}: {
  playlist: PlaylistItem[];
  getPlayback: (videoId: string) => Promise<PlaybackResponse>;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const videos = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
  ] as const;
  const controller = useRef<ScreeningController | null>(null);
  const [state, setState] = useState(INITIAL_STATE);
  const clip = playlist[state.index];

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
      onState: setState,
    });
    return controller.current;
  }, [getPlayback, playlist, videos]);

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
        <p>uploading, processing, measuring, and failed videos stay out of the reel.</p>
      </section>
    );
  }

  const activeSlot = state.index % 2;
  const showingTitle = state.phase === 'title';
  const team = clip.teamMembers.join(' · ') || 'Hackweek team';

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
          <span>{team}</span>
        </div>
        {['playing', 'paused'].includes(state.phase) && (
          <div className="clipOverlay" aria-live="polite">
            <strong>{clip.projectName}</strong>
            <span>{team}</span>
          </div>
        )}
        {state.phase === 'idle' && (
          <div className="startCard">
            <span className="screeningMark">#H</span>
            <h2>the Hackweek reel</h2>
            <p>{playlist.length} ready project videos · private progressive MP4</p>
            <button
              className="screeningStart"
              onClick={() => void buildController()?.start()}
            >
              play all
            </button>
            <small>sound starts only after you press play</small>
          </div>
        )}
        {state.phase === 'complete' && (
          <div className="startCard" aria-live="polite">
            <span className="screeningMark">✓</span>
            <h2>that’s the reel</h2>
            <p>all {playlist.length} ready videos played.</p>
          </div>
        )}
        {state.phase === 'error' && (
          <div className="playerError" role="alert">
            <strong>playback stopped</strong>
            <p>{state.error}</p>
            <button
              className="screeningStart"
              onClick={() => void controller.current?.skip()}
            >
              {state.index < playlist.length - 1 ? 'skip to next project' : 'finish reel'}
            </button>
          </div>
        )}
      </div>
      <div className="screeningControls" aria-label="Playback controls">
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
