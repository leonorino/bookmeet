const storagePrefix = "meeting-booking:management-key:";

function storageKey(organizerId: string): string {
  return `${storagePrefix}${organizerId}`;
}

export function getManagementKey(organizerId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(organizerId));
  } catch {
    return null;
  }
}

export function saveManagementKey(organizerId: string, managementKey: string): void {
  window.localStorage.setItem(storageKey(organizerId), managementKey);
}

export function forgetManagementKey(organizerId: string): void {
  try {
    window.localStorage.removeItem(storageKey(organizerId));
  } catch {
    // Storage may be unavailable in a private browsing context.
  }
}
