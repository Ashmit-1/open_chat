import { useState, useEffect, useCallback } from 'react';
import localforage from '../lib/localforage';

/**
 * Custom hook for localForage operations
 * 
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {Object} - State and methods for localForage
 */
export function useLocalForage(key, defaultValue = null) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load value from localForage on mount
  useEffect(() => {
    async function load() {
      try {
        const storedValue = await localforage.getItem(key);
        setValue(storedValue ?? defaultValue);
      } catch (err) {
        setError(err);
        setValue(defaultValue);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [key, defaultValue]);

  // Save value to localForage
  const save = useCallback(
    async (newValue) => {
      try {
        await localforage.setItem(key, newValue);
        setValue(newValue);
        return true;
      } catch (err) {
        setError(err);
        return false;
      }
    },
    [key]
  );

  // Remove value from localForage
  const remove = useCallback(async () => {
    try {
      await localforage.removeItem(key);
      setValue(defaultValue);
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  }, [key, defaultValue]);

  return {
    value,
    setValue,
    loading,
    error,
    save,
    remove,
    clearError: () => setError(null),
  };
}

export default useLocalForage;
