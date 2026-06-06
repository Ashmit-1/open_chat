/**
 * useUnsavedChangesWarning Hook
 * 
 * Provides beforeunload protection for unsaved conversation changes.
 * Warns user when attempting to:
 * - Refresh the page
 * - Close the tab
 * - Navigate away
 * 
 * when they have unsaved conversation changes.
 */

import { useEffect, useCallback } from 'react';
import { useConversationStore } from '../store';
import { isConversationDirty } from '../lib/chatPayloadBuilder';

/**
 * Hook to warn user about unsaved changes
 * @returns {Object} - { hasUnsavedChanges: boolean }
 */
export function useUnsavedChangesWarning() {
  const currentConversation = useConversationStore(state => state.getCurrentConversation());
  const hasUnsavedChanges = isConversationDirty(currentConversation);

  // Set up beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  return { hasUnsavedChanges };
}

/**
 * Hook to check if navigation should be blocked
 * Used for in-app navigation (e.g., creating new chat)
 * @returns {Object} - { blockNavigation: boolean, confirmNavigation: Function }
 */
export function useNavigationProtection() {
  const currentConversation = useConversationStore(state => state.getCurrentConversation());
  const hasUnsavedChanges = isConversationDirty(currentConversation);

  const confirmNavigation = useCallback((onConfirm, onCancel) => {
    if (hasUnsavedChanges) {
      // Show modal or confirmation
      // This should be wired to the UI store's modal system
      const shouldProceed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );
      
      if (shouldProceed) {
        onConfirm?.();
      } else {
        onCancel?.();
      }
      
      return shouldProceed;
    }
    
    onConfirm?.();
    return true;
  }, [hasUnsavedChanges]);

  return { 
    hasUnsavedChanges, 
    blockNavigation: hasUnsavedChanges,
    confirmNavigation 
  };
}

export default useUnsavedChangesWarning;
