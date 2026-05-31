/**
 * Chat Stream Service
 * 
 * Handles SSE streaming communication with the backend.
 * Responsibilities:
 * - Send chat requests
 * - Manage AbortController for cancellation
 * - Parse SSE events manually
 * - Emit structured events to callbacks
 */

import { BACKEND_URL } from '../lib/backend';

// Default headers for JSON requests
const getHeaders = () => ({
  'Content-Type': 'application/json',
});

/**
 * Current AbortController instance for active stream
 * @type {AbortController|null}
 */
let currentController = null;

/**
 * Get the current abort controller
 * @returns {AbortController|null}
 */
export function getCurrentController() {
  return currentController;
}

/**
 * Abort the current stream
 * @returns {void}
 */
export function abortCurrentStream() {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
}

/**
 * Check if a stream is currently active
 * @returns {boolean}
 */
export function isStreaming() {
  return currentController !== null;
}

/**
 * Send a chat request and stream the response
 * 
 * @param {Object} payload - Chat request payload
 * @param {Object} options - Streaming options
 * @param {Function} options.onToken - Callback for token events
 * @param {Function} options.onMetadata - Callback for metadata events
 * @param {Function} options.onError - Callback for error events
 * @param {Function} options.onCancelled - Callback for cancelled events
 * @param {Function} options.onDone - Callback for done events
 * @returns {Promise<void>}
 */
export async function sendChatStream(payload, options = {}) {
  const {
    onToken,
    onMetadata,
    onError,
    onCancelled,
    onDone,
  } = options;

  // Cancel any existing stream
  abortCurrentStream();

  // Create new AbortController
  currentController = new AbortController();
  const { signal } = currentController;

  try {
    const response = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMessage = error?.error?.message || error?.message || 'Chat request failed';
      throw new Error(errorMessage);
    }

    // Parse SSE stream manually
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete events separated by \n\n
      let eventEnd;
      while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
        const eventData = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd + 2);

        if (eventData.trim()) {
          await processSSEEvent(eventData, {
            onToken,
            onMetadata,
            onError,
            onCancelled,
            onDone,
          });
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      await processSSEEvent(buffer, {
        onToken,
        onMetadata,
        onError,
        onCancelled,
        onDone,
      });
    }

  } catch (error) {
    // Don't throw if aborted - that's expected
    if (error.name !== 'AbortError') {
      // Call error callback if provided
      if (onError) {
        onError({
          code: 'NETWORK_ERROR',
          message: error.message || 'Network error occurred',
        });
      }
    } else {
      // Stream was aborted - call cancelled callback
      if (onCancelled) {
        onCancelled();
      }
    }
  } finally {
    // Clean up controller
    currentController = null;
  }
}

/**
 * Process a single SSE event
 * 
 * Parses event type and data, then calls appropriate callback.
 * Handles malformed data gracefully.
 * 
 * @param {string} eventData - Raw SSE event data
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onToken - Token callback
 * @param {Function} callbacks.onMetadata - Metadata callback
 * @param {Function} callbacks.onError - Error callback
 * @param {Function} callbacks.onCancelled - Cancelled callback
 * @param {Function} callbacks.onDone - Done callback
 */
async function processSSEEvent(eventData, callbacks) {
  const { onToken, onMetadata, onError, onCancelled, onDone } = callbacks;

  const lines = eventData.split('\n');
  let eventType = null;
  let data = null;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim();
    }
  }

  if (!eventType || !data) {
    // Malformed event, skip
    return;
  }

  try {
    const payload = JSON.parse(data);

    switch (eventType) {
      case 'token':
        if (onToken) {
          onToken(payload);
        }
        break;

      case 'metadata':
        if (onMetadata) {
          onMetadata(payload);
        }
        break;

      case 'error':
        if (onError) {
          onError(payload);
        }
        break;

      case 'cancelled':
        if (onCancelled) {
          onCancelled();
        }
        break;

      case 'done':
        if (onDone) {
          onDone(payload);
        }
        break;

      default:
        console.warn(`Unknown SSE event type: ${eventType}`);
    }
  } catch (error) {
    console.error('Failed to parse SSE event data:', error);
    // If it's a done event with empty data, that's okay
    if (eventType === 'done') {
      if (onDone) {
        onDone({});
      }
    }
  }
}

/**
 * Validate a model configuration with the backend
 * 
 * @param {Object} modelConfig - Model configuration to validate
 * @returns {Promise<Object>} - Validation result
 */
export async function validateModel(modelConfig) {
  const response = await fetch(`${BACKEND_URL}/models/validate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(modelConfig),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || error?.message || 'Validation failed');
  }

  return response.json();
}

export default {
  BACKEND_URL,
  getCurrentController,
  abortCurrentStream,
  isStreaming,
  sendChatStream,
  validateModel,
};
