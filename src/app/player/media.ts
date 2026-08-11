import Hls from 'hls.js';

export interface MediaAttachment {
  destroy(): void;
}

export function attachProtectedHls(
  element: HTMLVideoElement,
  manifestUrl: string,
  onReady?: () => void,
  onError?: (message: string) => void,
): MediaAttachment {
  element.crossOrigin = 'anonymous';
  element.preload = 'auto';

  if (Hls.isSupported()) {
    const hls = new Hls({enableWorker: true});
    hls.on(Hls.Events.MANIFEST_PARSED, () => onReady?.());
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) onError?.('protected video could not be loaded');
    });
    hls.loadSource(manifestUrl);
    hls.attachMedia(element);
    return {destroy: () => hls.destroy()};
  }

  if (element.canPlayType('application/vnd.apple.mpegurl')) {
    element.src = manifestUrl;
    element.load();
    onReady?.();
    return {
      destroy() {
        element.removeAttribute('src');
        element.load();
      },
    };
  }

  onError?.('this browser cannot play protected HLS with normalized audio');
  return {destroy() {}};
}
