import { create } from 'zustand';
import {
  createConversation,
  createMessage,
  MESSAGE_STATUS,
  createMetadata,
  calculateContextUsage,
  getMessagesInContext,
  getSystemMessage,
  getLastAssistantMessage,
  isConversationStreaming,
  validateConversationForSend,
} from './schemas';
import { saveConversations } from '../services/persistence';

/**
 * Conversation Store
 * 
 * Manages:
 * - Current active conversation (memory only, unsaved)
 * - All saved conversations (loaded from persistence)
 * - Conversation lifecycle: create, rename, delete, save
 * - Message operations: add, update, regenerate
 * - Trim boundary tracking
 * - Streaming state
 * 
 * RULES:
 * - Only ONE active conversation at a time
 * - Unsaved conversations live ONLY in Zustand memory
 * - Saved conversations are cached in store after loading from localForage
 * - Auto-creates empty conversation on startup
 * - Never physically remove messages - track accumulatedTrimBoundary only
 */

const CONVERSATION_STORAGE_KEY = 'saved_conversations';

/* ================================================================
   Snapshot helper — deep-freeze the parts that matter for "dirty"
   detection, so we can detect whether anything has actually changed
   since the conversation was loaded or last saved.
   ================================================================ */
function snapshotConversation(conversation) {
  if (!conversation) return null;
  return JSON.stringify({
    title: conversation.title,
    messagesLen: conversation.messages.length,
    messagesContent: conversation.messages.map((m) => m.content).join(''),
    modelId: conversation.modelId,
    systemMessage: conversation.systemMessage,
  });
}

const conversationStore = create((set, get) => ({
  // ============================================
  // STATE
  // ============================================

  /** @type {Object} */
  currentConversation: null,

  /** @type {string|null} — Snapshot of the conversation at its last load/save point */
  savedAtLoadSnapshot: null,

  /** @type {Object[]} - Saved conversations loaded from localForage */
  savedConversations: [],

  /** @type {boolean} - Whether saved conversations have been loaded */
  savedConversationsLoaded: false,

  /** @type {boolean} - Whether a load operation is in progress */
  loading: false,

  /** @type {Error|null} - Current error */
  error: null,

  // ============================================
  // SELECTORS
  // ============================================

  getCurrentConversation: () => get().currentConversation,

  getSavedConversations: () => get().savedConversations,

  /**
   * Check if the current conversation has unsaved changes compared to
   * when it was last loaded from the saved list or last persisted.
   */
  hasUnsavedChanges: () => {
    const { currentConversation, savedAtLoadSnapshot } = get();
    if (!currentConversation) return false;
    // Freshly created (never loaded from saved) AND has messages → unsaved
    if (savedAtLoadSnapshot === null) {
      return currentConversation.messages.length > 0;
    }
    // Loaded from saved — compare to the snapshot
    return snapshotConversation(currentConversation) !== savedAtLoadSnapshot;
  },

  getConversationById: (id) => {
    const { savedConversations } = get();
    return savedConversations.find(c => c.id === id) || null;
  },

  getIsSavedConversation: (id) => {
    const { savedConversations } = get();
    return savedConversations.some(c => c.id === id);
  },

  /**
   * Get context usage information for current conversation
   * @returns {Object} - Context usage info
   */
  getCurrentContextUsage: () => {
    const current = get().currentConversation;
    if (!current) return null;
    return calculateContextUsage(current);
  },

  /**
   * Check if current conversation is streaming
   * @returns {boolean}
   */
  isCurrentConversationStreaming: () => {
    const current = get().currentConversation;
    if (!current) return false;
    return isConversationStreaming(current);
  },

  /**
   * Get last assistant message from current conversation
   * @returns {Object|null}
   */
  getCurrentLastAssistantMessage: () => {
    const current = get().currentConversation;
    if (!current) return null;
    return getLastAssistantMessage(current.messages);
  },

  /**
   * Get system message from current conversation
   * @returns {Object|null}
   */
  getCurrentSystemMessage: () => {
    const current = get().currentConversation;
    if (!current) return null;
    return getSystemMessage(current.messages);
  },

  /**
   * Get messages in context (excluding trimmed) for request payload
   * @returns {Object[]}
   */
  getCurrentMessagesForContext: () => {
    const current = get().currentConversation;
    if (!current) return [];
    return getMessagesInContext(current);
  },

  // ============================================
  // ACTIONS
  // ============================================

  actions: {
    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the store with a new empty conversation
     * Called on app startup
     */
    initialize: () => {
      const newConversation = createConversation();
      set({
        currentConversation: newConversation,
        savedConversations: [],
        savedConversationsLoaded: false,
        loading: false,
        error: null,
      });
    },

    /**
     * Load saved conversations from storage
     * @param {Object[]} conversations - Saved conversations from localForage
     */
    loadSavedConversations: (conversations) => {
      set({
        savedConversations: conversations,
        savedConversationsLoaded: true,
        loading: false,
      });
    },

    /**
     * Set current conversation directly
     * @param {Object} conversation
     */
    setCurrentConversation: (conversation) => {
      set({ currentConversation: conversation });
    },

    /**
     * Set loading state
     * @param {boolean} loading
     */
    setLoading: (loading) => {
      set({ loading });
    },

    /**
     * Set error
     * @param {Error|null} error
     */
    setError: (error) => {
      set({ error });
    },

    /**
     * Clear error
     */
    clearError: () => {
      set({ error: null });
    },

    // ============================================
    // CONVERSATION LIFECYCLE
    // ============================================

    /**
     * Create a new empty conversation
     * Replaces current conversation with new one
     * @param {Object} options - Creation options
     * @param {string} options.title - Initial title
     * @param {number} options.contextWindow - Context window size
     */
    createConversation: (options = {}) => {
      const newConversation = createConversation({
        title: options.title || 'Untitled Conversation',
        contextWindow: options.contextWindow || 8000,
      });
      set({ currentConversation: newConversation, savedAtLoadSnapshot: null });
      return newConversation;
    },

    /**
     * Clear current conversation and create new empty one
     */
    clearCurrentConversation: () => {
      const newConversation = createConversation();
      set({ currentConversation: newConversation, savedAtLoadSnapshot: null });
      return newConversation;
    },

    /**
     * Load a saved conversation into current
     * @param {string} id - Saved conversation ID
     */
    loadConversation: (id) => {
      const { savedConversations } = get();
      const savedConversation = savedConversations.find(c => c.id === id);
      
      if (!savedConversation) {
        get().actions.setError(new Error(`Conversation ${id} not found`));
        return null;
      }

      // Create a working copy in memory
      const workingCopy = {
        ...savedConversation,
        saved: false, // Track dirty state via savedAtLoadSnapshot instead
        updatedAt: Date.now(),
      };

      set({
        currentConversation: workingCopy,
        savedAtLoadSnapshot: snapshotConversation(workingCopy),
      });
      return workingCopy;
    },

    /**
     * Rename current conversation
     * @param {string} title - New title
     */
    renameCurrentConversation: (title) => {
      set((state) => ({
        currentConversation: {
          ...state.currentConversation,
          title,
          updatedAt: Date.now(),
          saved: false,
        },
      }));
    },

    /**
     * Mark current conversation as saved
     * @param {string} [savedId] - Optional ID used for persistence
     */
    markCurrentAsSaved: (savedId) => {
      set((state) => ({
        currentConversation: {
          ...state.currentConversation,
          saved: true,
          savedId: savedId || state.currentConversation.id,
          updatedAt: Date.now(),
        },
      }));
    },

    /**
     * Save current conversation to saved conversations and persist to storage.
     *
     * @param {Object} options - Save options
     * @param {string} [options.title] - Title to save as
     * @returns {Promise<Object>} - The saved conversation
     */
    saveCurrentConversation: async (options = {}) => {
      const { currentConversation, savedConversations } = get();

      if (!currentConversation) {
        get().actions.setError(new Error('No conversation to save'));
        return null;
      }

      const savedConversation = {
        ...currentConversation,
        saved: true,
        title: options.title || currentConversation.title,
        updatedAt: Date.now(),
      };

      // Check if already exists in saved
      const existingIndex = savedConversations.findIndex(c => c.id === savedConversation.id);

      let newSavedConversations;
      if (existingIndex >= 0) {
        newSavedConversations = [...savedConversations];
        newSavedConversations[existingIndex] = savedConversation;
      } else {
        newSavedConversations = [savedConversation, ...savedConversations];
      }

      // Persist to localForage
      await saveConversations(newSavedConversations);

      // Mark current as saved and update the snapshot so future edits are tracked
      set({
        currentConversation: { ...savedConversation },
        savedConversations: newSavedConversations,
        savedAtLoadSnapshot: snapshotConversation(savedConversation),
      });

      return savedConversation;
    },

    /**
     * Delete a saved conversation and persist the change.
     *
     * @param {string} id - Conversation ID to delete
     */
    deleteSavedConversation: async (id) => {
      const { currentConversation } = get();

      // If deleting current conversation, clear it
      if (currentConversation?.id === id) {
        get().actions.clearCurrentConversation();
      }

      const newSavedConversations = get().savedConversations.filter(c => c.id !== id);

      // Persist to localForage
      await saveConversations(newSavedConversations);

      set({
        savedConversations: newSavedConversations,
      });
    },

    // ============================================
    // MESSAGE OPERATIONS
    // ============================================

    /**
     * Add a message to current conversation
     * @param {Object} params - Message parameters
     * @param {'system'|'user'|'assistant'} params.role
     * @param {string} params.content
     * @param {string} [params.modelId]
     * @param {string} [params.modelName]
     * @returns {Object} - The created message
     */
    addMessage: (params) => {
      const { currentConversation } = get();
      
      if (!currentConversation) {
        get().actions.setError(new Error('No conversation to add message to'));
        return null;
      }

      const message = createMessage({
        role: params.role,
        content: params.content,
        modelId: params.modelId,
        modelName: params.modelName,
      });

      set((state) => ({
        currentConversation: {
          ...state.currentConversation,
          messages: [...state.currentConversation.messages, message],
          updatedAt: Date.now(),
          saved: false,
        },
      }));

      return message;
    },

    /**
     * Add a system message to current conversation
     * @param {string} content - System message content
     * @returns {Object} - The created message
     */
    addSystemMessage: (content) => {
      return get().actions.addMessage({
        role: 'system',
        content,
      });
    },

    /**
     * Add a user message to current conversation
     * @param {string} content - User message content
     * @param {string} [modelId] - Model ID
     * @param {string} [modelName] - Model name
     * @returns {Object} - The created message
     */
    addUserMessage: (content, modelId, modelName) => {
      return get().actions.addMessage({
        role: 'user',
        content,
        modelId,
        modelName,
      });
    },

    /**
     * Add an assistant message (for streaming start)
     * @param {string} content - Initial content (empty for streaming start)
     * @param {string} modelId - Model ID
     * @param {string} modelName - Model name
     * @returns {Object} - The created message
     */
    addAssistantMessage: (content = '', modelId, modelName) => {
      return get().actions.addMessage({
        role: 'assistant',
        content,
        modelId,
        modelName,
        status: MESSAGE_STATUS.STREAMING,
      });
    },

    /**
     * Update a message by ID
     * @param {string} messageId - Message ID to update
     * @param {Object} updates - Updates to apply
     * @returns {Object|null} - The updated message or null
     */
    updateMessage: (messageId, updates) => {
      const { currentConversation } = get();
      
      if (!currentConversation) {
        get().actions.setError(new Error('No conversation to update message in'));
        return null;
      }

      const updatedMessages = currentConversation.messages.map(message => {
        if (message.id !== messageId) return message;
        return { ...message, ...updates };
      });

      set((state) => ({
        currentConversation: {
          ...state.currentConversation,
          messages: updatedMessages,
          updatedAt: Date.now(),
          saved: false,
        },
      }));

      return updatedMessages.find(m => m.id === messageId) || null;
    },

    /**
     * Update the last message (for streaming)
     * @param {string} content - New content to append
     * @param {Object} [metadata] - Optional metadata updates
     */
    updateLastMessage: (content, metadata) => {
      const { currentConversation } = get();
      
      if (!currentConversation || currentConversation.messages.length === 0) {
        return;
      }

      const lastIndex = currentConversation.messages.length - 1;
      const lastMessage = currentConversation.messages[lastIndex];

      // Append content for streaming
      const newContent = lastMessage.content + content;

      const updates = {
        content: newContent,
        status: MESSAGE_STATUS.STREAMING,
        updatedAt: Date.now(),
      };

      if (metadata) {
        updates.metadata = { ...lastMessage.metadata, ...metadata };
      }

      get().actions.updateMessage(lastMessage.id, updates);
    },

    /**
     * Complete the last message (end of streaming)
     * @param {Object} metadata - Final metadata from backend
     */
    completeLastMessage: (metadata) => {
      const { currentConversation } = get();

      if (!currentConversation || currentConversation.messages.length === 0) {
        return;
      }

      const lastMessage = currentConversation.messages[currentConversation.messages.length - 1];
      const updates = { status: MESSAGE_STATUS.COMPLETED };
      if (metadata) {
        updates.metadata = createMetadata(metadata);
      }

      get().actions.updateMessage(lastMessage.id, updates);
    },

    /**
     * Stop the last message (user cancelled streaming)
     */
    stopLastMessage: () => {
      const { currentConversation } = get();
      
      if (!currentConversation || currentConversation.messages.length === 0) {
        return;
      }

      const lastMessage = currentConversation.messages[currentConversation.messages.length - 1];

      get().actions.updateMessage(lastMessage.id, {
        status: MESSAGE_STATUS.STOPPED,
      });
    },

    /**
     * Set error on the last message
     * @param {string} error - Error message
     */
    errorLastMessage: (error) => {
      const { currentConversation } = get();
      
      if (!currentConversation || currentConversation.messages.length === 0) {
        return;
      }

      const lastMessage = currentConversation.messages[currentConversation.messages.length - 1];

      get().actions.updateMessage(lastMessage.id, {
        status: MESSAGE_STATUS.ERROR,
        metadata: createMetadata({ error }),
      });
    },

    // ============================================
    // TRIM BOUNDARY MANAGEMENT
    // ============================================

    /**
     * Update trim boundary from backend metadata
     * Never removes messages - only accumulates the boundary
     * @param {number} trimBoundary - Trim boundary from backend response
     */
    updateTrimBoundary: (trimBoundary) => {
      set((state) => ({
        currentConversation: {
          ...state.currentConversation,
          accumulatedTrimBoundary: state.currentConversation.accumulatedTrimBoundary + trimBoundary,
          updatedAt: Date.now(),
        },
      }));
    },

    /**
     * Get the trim boundary offset for request payload
     * @returns {number} - Number of messages to skip
     */
    getTrimOffset: () => {
      const { currentConversation } = get();
      return currentConversation?.accumulatedTrimBoundary || 0;
    },

    // ============================================
    // REGENERATION SUPPORT
    // ============================================

    /**
     * Get messages for regeneration (removes last assistant message)
     * @returns {Object[]} - Messages ready for regeneration
     */
    getMessagesForRegeneration: () => {
      const { currentConversation } = get();
      
      if (!currentConversation) return [];

      const { messages } = currentConversation;
      
      // Remove last assistant message (if exists and completed)
      const messagesWithoutLastAssistant = messages.filter((m, index) => {
        if (m.role === 'assistant' && index === messages.length - 1) {
          return false;
        }
        return true;
      });

      return messagesWithoutLastAssistant;
    },

    /**
     * Regenerate the last assistant response
     * Removes the last assistant message and prepares for new response
     * @returns {Object} - The removed message or null
     */
    prepareForRegeneration: () => {
      const { currentConversation } = get();
      
      if (!currentConversation) return null;

      const { messages } = currentConversation;
      const lastMessage = messages[messages.length - 1];

      // Only remove if it's an assistant message
      if (lastMessage?.role !== 'assistant') {
        return null;
      }

      const removedMessage = { ...lastMessage };

      // Remove the last message
      set((state) => ({
        currentConversation: {
          ...state.currentConversation,
          messages: state.currentConversation.messages.slice(0, -1),
          updatedAt: Date.now(),
          saved: false,
        },
      }));

      return removedMessage;
    },

    // ============================================
    // VALIDATION
    // ============================================

    /**
     * Validate current conversation for sending to backend
     * @returns {Object} - { valid: boolean, errors: string[] }
     */
    validateCurrentForSend: () => {
      const { currentConversation } = get();
      if (!currentConversation) {
        return { valid: false, errors: ['No conversation'] };
      }
      return validateConversationForSend(currentConversation);
    },

    // ============================================
    // EXPORT / SERIALIZATION
    // ============================================

    /**
     * Get current conversation as plain object for persistence
     * @returns {Object|null}
     */
    getCurrentForPersistence: () => {
      const { currentConversation } = get();
      if (!currentConversation) return null;
      return { ...currentConversation };
    },

    /**
     * Get all saved conversations for persistence
     * @returns {Object[]}
     */
    getAllSavedForPersistence: () => {
      const { savedConversations } = get();
      return savedConversations.map(c => ({ ...c }));
    },

    // ============================================
    // PAYLOAD BUILDING
    // ============================================

    /**
     * Build chat payload for sending to backend
     * Uses effective model config with global overrides
     * @param {string} userMessage - The new user message
     * @param {Object} settings - Global settings
     * @param {Object|null} selectedModel - Selected model
     * @returns {Object} - Backend-ready payload
     */
    buildChatPayload: (userMessage, settings, selectedModel) => {
      const { currentConversation } = get();
      if (!currentConversation) {
        throw new Error('No conversation');
      }
      
      const { buildChatPayload } = require('../lib/chatPayloadBuilder');
      return buildChatPayload(currentConversation, userMessage, settings, selectedModel);
    },

    /**
     * Build regeneration payload
     * @param {Object} settings - Global settings
     * @param {Object|null} selectedModel - Selected model
     * @returns {Object} - Backend-ready payload
     */
    buildRegeneratePayload: (settings, selectedModel) => {
      const { currentConversation } = get();
      if (!currentConversation) {
        throw new Error('No conversation');
      }
      
      const { buildRegeneratePayload } = require('../lib/chatPayloadBuilder');
      return buildRegeneratePayload(currentConversation, settings, selectedModel);
    },

    // ============================================
    // REGENERATION
    // ============================================

    /**
     * Prepare for regeneration - removes last assistant message
     * @returns {Object|null} - The removed message or null
     */
    prepareForRegenerationWithUtils: () => {
      const { currentConversation } = get();
      
      if (!currentConversation) return null;
      
      const { prepareForRegeneration, getMessagesForRegeneration } = require('../lib/chatPayloadBuilder');
      
      const removedMessage = prepareForRegeneration(currentConversation);
      
      if (removedMessage) {
        const messagesWithoutLastAssistant = getMessagesForRegeneration(currentConversation);
        
        set({
          currentConversation: {
            ...currentConversation,
            messages: messagesWithoutLastAssistant,
            updatedAt: Date.now(),
            saved: false,
          }
        });
      }
      
      return removedMessage;
    },

    /**
     * Check if current conversation can be regenerated
     * @returns {boolean}
     */
    canRegenerate: () => {
      const { currentConversation } = get();
      const { canRegenerate } = require('../lib/chatPayloadBuilder');
      return canRegenerate(currentConversation);
    },

    // ============================================
    // TITLE MANAGEMENT
    // ============================================

    /**
     * Auto-generate title from first user message
     */
    autoGenerateTitle: () => {
      const { currentConversation } = get();
      if (!currentConversation) return;
      
      const { shouldAutoGenerateTitle, generateTitleFromFirstMessage } = require('../lib/chatPayloadBuilder');
      
      if (shouldAutoGenerateTitle(currentConversation)) {
        get().actions.renameCurrentConversation(
          generateTitleFromFirstMessage(currentConversation)
        );
      }
    },

    // ============================================
    // CONTEXT UTILITIES
    // ============================================

    /**
     * Get messages currently in context (after trim boundary)
     * @returns {Object[]}
     */
    getMessagesInContext: () => {
      const { currentConversation } = get();
      if (!currentConversation) return [];
      
      const { getMessagesInContext } = require('../lib/chatPayloadBuilder');
      return getMessagesInContext(currentConversation);
    },

    /**
     * Get context usage information
     * @param {Object} settings
     * @returns {Object}
     */
    getContextUsage: (settings) => {
      const { currentConversation } = get();
      if (!currentConversation) return null;
      
      const { calculateConversationContextTokens } = require('../lib/chatPayloadBuilder');
      return calculateConversationContextTokens(currentConversation, settings);
    },

    /**
     * Get context usage display string (e.g., "5231 / 8000")
     * @param {Object} settings
     * @returns {string}
     */
    getContextUsageDisplay: (settings) => {
      const { currentConversation } = get();
      if (!currentConversation) return '? / 8000';
      
      const { getContextUsageDisplay } = require('../lib/chatPayloadBuilder');
      return getContextUsageDisplay(currentConversation, settings);
    },
  },
}));

export { conversationStore };
export const useConversationStore = conversationStore;
