import { ref, computed } from 'vue'

export function useBatchSelection<T extends { id: string }>() {
  const selectedIds = ref<Set<string>>(new Set())

  const selectedCount = computed(() => selectedIds.value.size)

  const isAllSelected = computed(() => false) // set externally

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedIds.value = next
  }

  function selectAll(items: T[]) {
    selectedIds.value = new Set(items.map(i => i.id))
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function isSelected(id: string) {
    return selectedIds.value.has(id)
  }

  return {
    selectedIds,
    selectedCount,
    isAllSelected,
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
  }
}
