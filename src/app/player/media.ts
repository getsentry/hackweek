export interface MediaAttachment {
  destroy(): void;
}

export function attachMp4(
  element: HTMLVideoElement,
  url: string,
  onReady?: () => void,
  onError?: (message: string) => void,
): MediaAttachment {
  const ready = () => onReady?.();
  const error = () => onError?.('private video could not be loaded');

  element.preload = 'auto';
  element.addEventListener('loadeddata', ready, {once: true});
  element.addEventListener('error', error);
  element.src = url;
  element.load();

  return {
    destroy() {
      element.removeEventListener('loadeddata', ready);
      element.removeEventListener('error', error);
      element.pause();
      element.removeAttribute('src');
      element.load();
    },
  };
}
