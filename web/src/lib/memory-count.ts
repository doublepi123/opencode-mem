export function getDisplayedMemoryCount(
  isSearching: boolean,
  searchTotal: number,
  storeTotal: number,
  tagFilterActive = false
): number {
  return isSearching || tagFilterActive ? searchTotal : storeTotal;
}
