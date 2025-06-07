import { z } from 'zod';
import { ServiceSchema } from '@/types';

/**
 * Create a type-safe service schema definition
 */
export function defineSchema<T extends ServiceSchema>(schema: T): T {
  return schema;
}

/**
 * Validate data against a Zod schema
 */
export function validateSchema<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

/**
 * Safely validate data against a Zod schema
 */
export function safeValidateSchema<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  return result;
}

/**
 * Simple schema builder for building service schemas
 */
export function createSchema(): {
  actions: Record<string, { input: z.ZodSchema; output: z.ZodSchema }>;
  channels: Record<string, { schema: z.ZodSchema }>;
  routes: Record<string, {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    input?: z.ZodSchema;
    output: z.ZodSchema;
    params?: Record<string, z.ZodSchema>;
  }>;
} {
  return {
    actions: {},
    channels: {},
    routes: {},
  };
}

/**
 * Helper to create an action definition
 */
export function action<I extends z.ZodSchema, O extends z.ZodSchema>(
  input: I,
  output: O
): { input: I; output: O } {
  return { input, output };
}

/**
 * Helper to create a channel definition
 */
export function channel<S extends z.ZodSchema>(
  schema: S
): { schema: S } {
  return { schema };
}

/**
 * Helper to create a route definition
 */
export function httpRoute<
  M extends 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  I extends z.ZodSchema | undefined,
  O extends z.ZodSchema,
  P extends Record<string, z.ZodSchema> | undefined = undefined
>(config: {
  method: M;
  output: O;
  input?: I;
  params?: P;
}): {
  method: M;
  input: I;
  output: O;
  params: P;
} {
  return {
    method: config.method,
    input: config.input as I,
    output: config.output,
    params: config.params as P,
  };
}

/**
 * Common Zod schemas for daebus services
 */
export const CommonSchemas = {
  // Basic types
  id: z.string().uuid(),
  timestamp: z.number().int().positive(),
  
  // Service status
  serviceStatus: z.object({
    status: z.enum(['healthy', 'unhealthy', 'starting', 'stopping']),
    uptime: z.number().int().nonnegative(),
    version: z.string().optional(),
    timestamp: z.number().int().positive(),
  }),

  // Error response
  errorResponse: z.object({
    error: z.string(),
    code: z.string().optional(),
    details: z.unknown().optional(),
    timestamp: z.number().int().positive(),
  }),

  // Success response
  successResponse: <T extends z.ZodSchema>(dataSchema: T) => z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: z.number().int().positive(),
  }),

  // Pagination
  paginationQuery: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(10),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
  }),

  paginatedResponse: <T extends z.ZodSchema>(itemSchema: T) => z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),

  // Device/hardware related
  deviceInfo: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.enum(['online', 'offline', 'error']),
    lastSeen: z.number().int().positive().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),

  // Notification/alert
  notification: z.object({
    id: z.string().uuid(),
    type: z.enum(['info', 'warning', 'error', 'success']),
    title: z.string(),
    message: z.string(),
    timestamp: z.number().int().positive(),
    read: z.boolean().default(false),
    data: z.unknown().optional(),
  }),

  // Log entry
  logEntry: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
    timestamp: z.number().int().positive(),
    service: z.string(),
    data: z.unknown().optional(),
  }),
};

/**
 * Utility to create parameterized routes
 */
export function route<P extends Record<string, z.ZodSchema>>(
  path: string,
  params: P
): {
  path: string;
  params: P;
} {
  return { path, params };
}

/**
 * Validate route parameters
 */
export function validateRouteParams<P extends Record<string, z.ZodSchema>>(
  params: P,
  values: Record<string, unknown>
): { [K in keyof P]: z.infer<P[K]> } {
  const result = {} as { [K in keyof P]: z.infer<P[K]> };
  
  for (const [key, schema] of Object.entries(params)) {
    (result as Record<string, unknown>)[key] = schema.parse(values[key]);
  }
  
  return result;
} 