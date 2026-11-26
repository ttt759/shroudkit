import { useEffect, useRef, useState } from 'react';

export function useTask<State>() {
  const [busy, setBusy] = useState<State>();
  const running = useRef<AbortController>(undefined);

  async function run(state: State, task: (signal: AbortSignal) => Promise<void>) {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(state);
    try {
      await task(controller.signal);
    } finally {
      if (running.current === controller) {
        running.current = undefined;
        setBusy(undefined);
      }
    }
  }

  function cancel() {
    running.current?.abort();
    running.current = undefined;
    setBusy(undefined);
  }

  return { busy, run, cancel };
}

export function useImagePaste(active: boolean, onFiles: (files: File[]) => void) {
  useEffect(() => {
    if (!active) return;
    function paste(event: ClipboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest('textarea,input,[contenteditable]')) return;
      const images = Array.from(event.clipboardData?.files ?? []).filter(file => /^image\/(png|jpeg|webp)$/i.test(file.type));
      if (!images.length) return;
      event.preventDefault();
      onFiles(images);
    }
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [active, onFiles]);
}
