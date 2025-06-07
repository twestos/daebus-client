import { z } from 'zod';

// Core Daebus message structure
export const DaebusMessageSchema = z.object({
  action: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  reply_channel: z.string().optional(),
  request_id: z.string().optional(),
  timestamp: z.number().optional(),
});

export const DaebusResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  request_id: z.string().optional(),
});

export type DaebusMessage = z.infer<typeof DaebusMessageSchema>;
export type DaebusResponse = z.infer<typeof DaebusResponseSchema>;

// HTTP Response structure
export const HttpResponseSchema = z.object({
  data: z.unknown(),
  status: z.number(),
  headers: z.record(z.string()).optional(),
});

export type HttpResponse<T = unknown> = {
  data: T;
  status: number;
  headers?: Record<string, string>;
};

// WebSocket Event types
export interface WebSocketEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  message: (channel: string, data: unknown) => void;
}

// Client configuration
export interface DaebusClientConfig {
  httpBaseUrl?: string;
  wsUrl?: string;
  defaultTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

// Service schema definition for type generation
export interface ServiceSchema {
  actions: Record<string, {
    input: z.ZodSchema;
    output: z.ZodSchema;
  }>;
  channels: Record<string, {
    schema: z.ZodSchema;
  }>;
  routes: Record<string, {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    input?: z.ZodSchema;
    output: z.ZodSchema;
    params?: Record<string, z.ZodSchema>;
  }>;
}

// Type helper for extracting types from schemas
export type InferInput<T> = T extends z.ZodSchema ? z.infer<T> : never;
export type InferOutput<T> = T extends z.ZodSchema ? z.infer<T> : never;

// Error types
export class DaebusError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'DaebusError';
  }
}

export class DaebusTimeoutError extends DaebusError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT');
    this.name = 'DaebusTimeoutError';
  }
}

export class DaebusConnectionError extends DaebusError {
  constructor(message: string = 'Connection error') {
    super(message, 'CONNECTION_ERROR');
    this.name = 'DaebusConnectionError';
  }
}

// Utility types for service definitions
export type ServiceActions<T extends ServiceSchema> = keyof T['actions'];
export type ServiceChannels<T extends ServiceSchema> = keyof T['channels'];
export type ServiceRoutes<T extends ServiceSchema> = keyof T['routes'];

// Type-safe action input/output
export type ActionInput<
  T extends ServiceSchema,
  A extends ServiceActions<T>
> = InferInput<T['actions'][A]['input']>;

export type ActionOutput<
  T extends ServiceSchema,
  A extends ServiceActions<T>
> = InferOutput<T['actions'][A]['output']>;

// Type-safe channel data
export type ChannelData<
  T extends ServiceSchema,
  C extends ServiceChannels<T>
> = InferInput<T['channels'][C]['schema']>;

// Type-safe route input/output
export type RouteInput<
  T extends ServiceSchema,
  R extends ServiceRoutes<T>
> = T['routes'][R]['input'] extends z.ZodSchema 
  ? InferInput<T['routes'][R]['input']>
  : never;

export type RouteOutput<
  T extends ServiceSchema,
  R extends ServiceRoutes<T>
> = InferOutput<T['routes'][R]['output']>;

export type RouteParams<
  T extends ServiceSchema,
  R extends ServiceRoutes<T>
> = T['routes'][R]['params'] extends Record<string, z.ZodSchema>
  ? { [K in keyof T['routes'][R]['params']]: InferInput<T['routes'][R]['params'][K]> }
  : Record<string, never>; 