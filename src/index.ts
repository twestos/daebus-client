// Main client
export { DaebusClient } from './client';
export type { DaebusClientOptions } from './client';

// HTTP client
export { DaebusHttpClient } from './http/client';
export type { HttpClientOptions } from './http/client';

// WebSocket client
export { DaebusWebSocketClient } from './websocket/client';
export type { WebSocketClientOptions, PendingRequest } from './websocket/client';

// Types
export * from './types';

// React hooks
export * from './react/hooks';

// Utilities
export * from './utils/schema';

// Re-export zod for convenience
export { z } from 'zod'; 