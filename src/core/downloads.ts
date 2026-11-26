import JSZip from 'jszip';

export type Output = { blob: Blob; name: string };
export const imageAccept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
export function fileStem(name: string) {
  const extension = name.lastIndexOf('.');
  return (extension > 0 ? name.slice(0, extension) : name) || 'image';
}

export function download({ blob, name }: Output) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

export async function buildZip(outputs: Output[], signal?: AbortSignal) {
  const zip = new JSZip();
  const entries = outputs.map(output => ({
    ...output,
    name: output.name.replace(/[\/\\:\x00-\x1f]/g, '_'),
  }));
  const reserved = new Set(entries.map(entry => entry.name.toLowerCase()));
  const used = new Set<string>();
  for (const output of entries) {
    signal?.throwIfAborted();
    let candidate = output.name;
    if (used.has(candidate.toLowerCase())) {
      const extension = candidate.lastIndexOf('.');
      const stem = extension > 0 ? candidate.slice(0, extension) : candidate;
      const suffix = candidate.slice(stem.length);
      let copy = 1;
      do {
        candidate = stem + '-' + ++copy + suffix;
      } while (reserved.has(candidate.toLowerCase()) || used.has(candidate.toLowerCase()));
    }
    used.add(candidate.toLowerCase());
    const bytes = await output.blob.arrayBuffer();
    signal?.throwIfAborted();
    zip.file(candidate, bytes);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

export async function zipOutputs(outputs: Output[], name: string, signal?: AbortSignal) {
  const bytes = await buildZip(outputs, signal);
  signal?.throwIfAborted();
  download({ name, blob: new Blob([bytes], { type: 'application/zip' }) });
}
