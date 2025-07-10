import { useState, useEffect, useCallback } from 'react';

// Overload signatures
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>];
function useLocalStorage<T>(key: string, initialValue: T, isUsage?: boolean): [T, React.Dispatch<React.SetStateAction<T>>, () => void];

function useLocalStorage<T>(key: string, initialValue: T, isUsage: boolean = false): [T, React.Dispatch<React.SetStateAction<T>>, (() => void)?] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;

      const parsedItem = JSON.parse(item);

      if (isUsage && 'lastResetDate' in parsedItem && 'questionsAnswered' in parsedItem) {
        const today = new Date().toISOString().split('T')[0];
        if (parsedItem.lastResetDate !== today) {
          return { ...initialValue, lastResetDate: today };
        }
      }
      return parsedItem;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  // This effect re-reads from localStorage ONLY when the key changes.
  // This is crucial for handling login/logout where the storage key is dynamic.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const item = window.localStorage.getItem(key);
      // When key changes, if new key has no value, fall back to initialValue.
      const value = item ? JSON.parse(item) : initialValue;
      setStoredValue(value);
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      setStoredValue(initialValue);
    }
    // We only want this to run when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const incrementUsage = useCallback(() => {
    if (isUsage) {
      setStoredValue(prev => {
        if (typeof prev === 'object' && prev !== null && 'questionsAnswered' in prev) {
          const current = prev as { questionsAnswered: number };
          return { ...prev, questionsAnswered: current.questionsAnswered + 1 };
        }
        return prev;
      });
    }
  }, [isUsage]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const serializedState = JSON.stringify(storedValue);
        window.localStorage.setItem(key, serializedState);
      } catch (error) {
        console.error(`Error saving to localStorage for key "${key}":`, error);
      }
    }
  }, [key, storedValue]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        if (e.newValue) {
          try {
            setStoredValue(JSON.parse(e.newValue));
          } catch (error) {
            console.error(`Error parsing storage change for key "${key}":`, error);
          }
        } else {
          setStoredValue(initialValue);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);
  
  if (isUsage) {
    return [storedValue, setStoredValue, incrementUsage];
  }
  
  return [storedValue, setStoredValue];
}

export default useLocalStorage;
