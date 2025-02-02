// NOTE: debugging localStorage for extensions STILL isn't nativity supported,
//  so use this 3rd party extension:
//  https://chrome.google.com/webstore/detail/storage-area-explorer/ocfjjjjhkpapocigimmppepjgfdecjkb
const SETTINGS_STORAGE_KEY = 'settings';
const OLD_TOGGLE_ZOOM_BEHAVIOR = 'use_toggle_zoom_behavior';
const DEFAULT_OLD_TOGGLE_ZOOM_BEHAVIOR = false;
const VERSION_ELEMENT_ID = 'version';

const getManifestVersion = async () => {
  try {
    const cssFilePath = chrome?.runtime?.getURL('manifest.json');
    if (cssFilePath !== '') {
      const response = await fetch(cssFilePath);
      const json = await response.json();
      return json?.version;
    }
  } catch (err) {
  }
  return '';
};

// we only have ONE feature, so this logic needs to be generalized to multiple settings
/**
 *
 * @return {Promise<boolean>}
 */
const getFeatureToogleZoom = async () => {
  try {
    const result = await chrome?.storage?.local?.get(SETTINGS_STORAGE_KEY) || {};
    const settings = result[SETTINGS_STORAGE_KEY] || {};
    return settings[OLD_TOGGLE_ZOOM_BEHAVIOR] || DEFAULT_OLD_TOGGLE_ZOOM_BEHAVIOR;
  } catch (err) {
    console.error(err);
    return DEFAULT_OLD_TOGGLE_ZOOM_BEHAVIOR;
  }
};

/**
 *
 * @param value {boolean}
 * @return {Promise<>}
 */
const setFeatureToogleZoom = async (value) => {
  try {
    const currSettings = await chrome?.storage?.local?.get(SETTINGS_STORAGE_KEY);
    currSettings[SETTINGS_STORAGE_KEY][OLD_TOGGLE_ZOOM_BEHAVIOR]= value;
    await chrome.storage.local.set(currSettings);
  } catch (err) {
    console.error(err);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const currSettings = await chrome?.storage?.local?.get(SETTINGS_STORAGE_KEY);
    if (!currSettings[SETTINGS_STORAGE_KEY]) {
      currSettings[SETTINGS_STORAGE_KEY] = {}
      await chrome.storage.local.set(currSettings);
    }
  } catch (err) {
    console.error(err);
  }
  try {
    document.addEventListener('change', async (_e) => {
      // save options
      const checked = document.getElementById(OLD_TOGGLE_ZOOM_BEHAVIOR)?.checked;
      await setFeatureToogleZoom(checked);
    });

    // load settings
    document.getElementById(OLD_TOGGLE_ZOOM_BEHAVIOR).checked = await getFeatureToogleZoom();

    // show debug info
    const settings = await chrome?.storage?.local?.get(SETTINGS_STORAGE_KEY) || {};
    const settingStr = JSON.stringify(settings, null, 2);
    const manifestVersion = await getManifestVersion() || '[missing manifest version]';
    const userAgent = JSON.stringify(navigator?.userAgentData, null, 2);

    document.getElementById(VERSION_ELEMENT_ID).innerHTML = `
    <b>Extension Version:</b> v${manifestVersion}<br/>
    <b>Extension Settings:</b></br/>
    <pre>${settingStr}</pre><br/>
    <b>Browser Version:</b><br/>
    <pre>${userAgent}</pre>
    `;
  } catch (err) {
    console.error(err);
  }
});
