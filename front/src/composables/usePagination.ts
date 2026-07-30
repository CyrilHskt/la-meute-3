import { computed, ref, watch, type Ref } from "vue";

/** Simple client-side pagination over a reactive list. If the list shrinks
 *  (new data loaded, or a filter changed) and the current page no longer
 *  exists, falls back to the last valid page rather than showing an empty
 *  page. */
export function usePagination<T>(items: Ref<T[]>, pageSize: number) {
  const page = ref(1);

  const totalPages = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize)));
  watch(totalPages, (max) => {
    if (page.value > max) page.value = max;
  });

  const pageItems = computed(() => {
    const start = (page.value - 1) * pageSize;
    return items.value.slice(start, start + pageSize);
  });

  function reset() {
    page.value = 1;
  }

  return { page, totalPages, pageItems, reset };
}
