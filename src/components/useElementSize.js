import { shallowRef, onMounted, onBeforeUnmount } from 'vue';

/**
 * The content-box size of an element, kept current with a ResizeObserver.
 *
 * Updates are coalesced to one per animation frame: the staff components
 * redraw their whole SVG whenever the size changes, and dragging a window
 * edge fires far more resize notifications than there are frames.
 *
 * A detached element (a KeepAlive'd view that is switched away) reports
 * 0x0, so callers should treat a zero width as "not on screen" and keep
 * what they last drew.
 *
 * @param {import('vue').Ref<HTMLElement|null>} target
 * @returns {{ width: import('vue').ShallowRef<number>, height: import('vue').ShallowRef<number> }}
 */
export function useElementSize(target) {
  const width = shallowRef(0);
  const height = shallowRef(0);
  let observer = null;
  let frame = 0;
  let latest = null;

  onMounted(() => {
    if (typeof ResizeObserver === 'undefined' || !target.value) return;
    observer = new ResizeObserver((entries) => {
      latest = entries[entries.length - 1].contentRect;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        width.value = Math.round(latest.width);
        height.value = Math.round(latest.height);
      });
    });
    observer.observe(target.value);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
  });

  return { width, height };
}
