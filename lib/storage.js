export async function storageGet(area, keys) {
  return chrome.storage[area].get(keys);
}

export async function storageSet(area, values) {
  await chrome.storage[area].set(values);
}

export async function storageRemove(area, keys) {
  await chrome.storage[area].remove(keys);
}
