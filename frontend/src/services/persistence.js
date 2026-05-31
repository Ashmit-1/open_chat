/**
 * Persistence Service
 * 
 * Handles loading and saving application state to localForage
 * with automatic encryption for sensitive fields.
 */

import localforage from '../lib/localforage';
import { encryptArrayFields, decryptArrayFields } from '../lib/encryption';
import { STORAGE_KEYS } from '../utils/constants';

// Fields that need encryption
const ENCRYPTED_FIELDS = {
  [STORAGE_KEYS.SAVED_CONVERSATIONS]: [],
  [STORAGE_KEYS.MODELS]: ['api_key'],
  [STORAGE_KEYS.SETTINGS]: [],
};

/**
 * Load all application state from localForage
 * @returns {Promise<Object>} - { conversations, models, settings }
 */
export async function loadAllState() {
  try {
    // Get raw values from localForage
    let conversations = await localforage.getItem(STORAGE_KEYS.SAVED_CONVERSATIONS);
    let models = await localforage.getItem(STORAGE_KEYS.MODELS);
    let settings = await localforage.getItem(STORAGE_KEYS.SETTINGS);

    // Ensure conversations is an array (default to empty array if not array or null)
    if (!Array.isArray(conversations)) {
      conversations = [];
    }
    
    // Ensure models is an array (default to empty array if not array or null)
    if (!Array.isArray(models)) {
      models = [];
    }
    
    // Settings should be null or a non-array object
    if (settings !== null && (typeof settings !== 'object' || Array.isArray(settings))) {
      settings = null;
    }

    // Decrypt sensitive fields in models
    const decryptedModels = await decryptArrayFields(models, ENCRYPTED_FIELDS[STORAGE_KEYS.MODELS] || []);

    return {
      conversations,
      models: decryptedModels,
      settings,
    };
  } catch (error) {
    console.error('Failed to load state:', error);
    // Don't swallow on error - at least try to return empty fallbacks
    return {
      conversations: [],
      models: [],
      settings: null,
    };
  }
}

/**
 * Save conversations to localForage
 * @param {Object[]} conversations - Conversations to save
 * @returns {Promise<boolean>}
 */
export async function saveConversations(conversations) {
  try {
    await localforage.setItem(STORAGE_KEYS.SAVED_CONVERSATIONS, conversations);
    return true;
  } catch (error) {
    console.error('Failed to save conversations:', error);
    return false;
  }
}

/**
 * Save models to localForage with encryption
 * @param {Object[]} models - Models to save
 * @returns {Promise<boolean>}
 */
export async function saveModels(models) {
  try {
    const encryptedModels = await encryptArrayFields(models, ENCRYPTED_FIELDS[STORAGE_KEYS.MODELS] || []);
    await localforage.setItem(STORAGE_KEYS.MODELS, encryptedModels);
    return true;
  } catch (error) {
    console.error('Failed to save models:', error);
    return false;
  }
}

/**
 * Save settings to localForage
 * @param {Object} settings - Settings to save
 * @returns {Promise<boolean>}
 */
export async function saveSettings(settings) {
  try {
    await localforage.setItem(STORAGE_KEYS.SETTINGS, settings);
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}

/**
 * Save all application state
 * @param {Object} state - Full application state
 * @param {Object[]} state.conversations - Saved conversations
 * @param {Object[]} state.models - Models
 * @param {Object} state.settings - Settings
 * @returns {Promise<Object>} - Save results
 */
export async function saveAllState({ conversations, models, settings }) {
  const [conversationsSaved, modelsSaved, settingsSaved] = await Promise.all([
    saveConversations(conversations),
    saveModels(models),
    saveSettings(settings),
  ]);

  return { conversationsSaved, modelsSaved, settingsSaved };
}

/**
 * Clear a specific storage key
 * @param {string} key - Storage key to clear
 * @returns {Promise<boolean>}
 */
export async function clearStorageKey(key) {
  try {
    await localforage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to clear ${key}:`, error);
    return false;
  }
}

/**
 * Clear all application state
 * @returns {Promise<boolean>}
 */
export async function clearAllState() {
  try {
    await Promise.all([
      localforage.removeItem(STORAGE_KEYS.SAVED_CONVERSATIONS),
      localforage.removeItem(STORAGE_KEYS.MODELS),
      localforage.removeItem(STORAGE_KEYS.SETTINGS),
    ]);
    return true;
  } catch (error) {
    console.error('Failed to clear all state:', error);
    return false;
  }
}

export default {
  loadAllState,
  saveConversations,
  saveModels,
  saveSettings,
  saveAllState,
  clearStorageKey,
  clearAllState,
};