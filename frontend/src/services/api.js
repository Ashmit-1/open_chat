/**
 * API Service
 * 
 * Handles communication with the backend.
 * Backend URL is configured via settings store.
 * 
 * Endpoints:
 * - POST /chat/stream - Streamed chat responses (SSE)
 * - POST /models/validate - Validate API keys
 */

import { BACKEND_URL } from '../lib/backend';

// Default headers for JSON requests
const getHeaders = () => ({
  'Content-Type': 'application/json',
});

/**
 * Validate a model configuration
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
    throw new Error(`Validation failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Send chat request and stream response
 * @param {Object} payload - Chat request payload
 * @param {Object} options - Additional options
 * @param {AbortSignal} options.signal - Abort signal for cancellation
 * @param {Function} options.onToken - Callback for token events
 * @param {Function} options.onMetadata - Callback for metadata events
 * @param {Function} options.onError - Callback for error events
 * @param {Function} options.onDone - Callback for done events
 * @returns {Promise<void>}
 */
export async function streamChat(payload, options = {}) {
  const { signal, onToken, onMetadata, onError, onDone } = options;

  const response = await fetch(`${BACKEND_URL}/chat/stream`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error?.message || 'Chat request failed');
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
        await processEvent(eventData, { onToken, onMetadata, onError, onDone });
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    await processEvent(buffer, { onToken, onMetadata, onError, onDone });
  }
}

/**
 * Process a single SSE event
 * @param {string} eventData - Raw event data
 * @param {Object} callbacks - Event callbacks
 */
async function processEvent(eventData, callbacks) {
  const { onToken, onMetadata, onError, onDone } = callbacks;

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

  if (!eventType || !data) return;

  try {
    const payload = JSON.parse(data);

    switch (eventType) {
      case 'token':
        if (onToken) await onToken(payload);
        break;
      case 'metadata':
        if (onMetadata) await onMetadata(payload);
        break;
      case 'error':
        if (onError) await onError(payload);
        break;
      case 'cancelled':
      case 'done':
        if (onDone) await onDone(payload);
        break;
      default:
        console.warn(`Unknown event type: ${eventType}`);
    }
  } catch (error) {
    console.error('Failed to parse event data:', error);
  }
}

export default {
  validateModel,
  streamChat,
};
