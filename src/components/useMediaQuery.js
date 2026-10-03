import { shallowRef, onMounted, onBeforeUnmount } from 'vue';

/**
 * Where the app switches from the stacked phone layout to the wide one:
 * music beside a practice sidebar, and tabs across the top. The same 900px
 * is written into the media queries in App.vue and SessionLayout.vue --
 * CSS can't read a JS constant -- so change all three together.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 900px)';

/**
 * Whether a media query currently matches, kept up to date.
 * @param {string} query
 * @returns {import('vue').ShallowRef<boolean>}
 */
export function useMediaQuery(query) {
  const matches = shallowRef(false);
  let list = null;
  const update = () => { matches.value = list.matches; };

  onMounted(() => {
    if (typeof window.matchMedia !== 'function') return;
    list = window.matchMedia(query);
    update();
    list.addEventListener('change', update);
  });

  onBeforeUnmount(() => list?.removeEventListener('change', update));

  return matches;
}
