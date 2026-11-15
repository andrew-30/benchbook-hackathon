// First-run guided-tour flag. Kept in a driver.js-free module so callers can
// cheaply check "has this been seen?" without pulling the tour bundle into the
// main chunk — only starting the tour loads driver.js.
export const TOUR_SEEN_KEY = 'bb-guided-tour-seen-v1';

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  } catch {
    // Storage disabled/blocked — treat as seen so we never loop the auto-start.
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    /* storage disabled — nothing to persist */
  }
}
