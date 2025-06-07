import { z } from 'zod';
import {
  defineSchema,
  validateSchema,
  safeValidateSchema,
  createSchema,
  action,
  channel,
  httpRoute,
  CommonSchemas,
  route,
  validateRouteParams,
} from '../schema';

describe('Schema Utilities', () => {
  describe('defineSchema', () => {
    it('should return the schema as-is for type safety', () => {
      const testSchema = {
        actions: {
          test: { input: z.string(), output: z.number() }
        },
        channels: {
          test: { schema: z.string() }
        },
        routes: {
          '/test': { method: 'GET' as const, output: z.string() }
        }
      };

      const result = defineSchema(testSchema);
      expect(result).toBe(testSchema);
    });
  });

  describe('validateSchema', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    it('should validate valid data', () => {
      const validData = { name: 'John', age: 30 };
      const result = validateSchema(testSchema, validData);
      expect(result).toEqual(validData);
    });

    it('should throw error for invalid data', () => {
      const invalidData = { name: 'John', age: 'thirty' };
      expect(() => validateSchema(testSchema, invalidData)).toThrow();
    });
  });

  describe('safeValidateSchema', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    it('should return success result for valid data', () => {
      const validData = { name: 'John', age: 30 };
      const result = safeValidateSchema(testSchema, validData);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should return error result for invalid data', () => {
      const invalidData = { name: 'John', age: 'thirty' };
      const result = safeValidateSchema(testSchema, invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(z.ZodError);
      }
    });
  });

  describe('createSchema', () => {
    it('should create empty schema structure', () => {
      const schema = createSchema();
      
      expect(schema).toEqual({
        actions: {},
        channels: {},
        routes: {},
      });
    });
  });

  describe('action', () => {
    it('should create action definition', () => {
      const inputSchema = z.object({ input: z.string() });
      const outputSchema = z.object({ output: z.number() });
      
      const actionDef = action(inputSchema, outputSchema);
      
      expect(actionDef).toEqual({
        input: inputSchema,
        output: outputSchema,
      });
    });
  });

  describe('channel', () => {
    it('should create channel definition', () => {
      const dataSchema = z.object({ message: z.string() });
      
      const channelDef = channel(dataSchema);
      
      expect(channelDef).toEqual({
        schema: dataSchema,
      });
    });
  });

  describe('httpRoute', () => {
    it('should create route definition with input and output', () => {
      const inputSchema = z.object({ data: z.string() });
      const outputSchema = z.object({ result: z.number() });
      const paramsSchema = { id: z.string() };
      
      const routeDef = httpRoute({
        method: 'POST',
        input: inputSchema,
        output: outputSchema,
        params: paramsSchema,
      });
      
      expect(routeDef).toEqual({
        method: 'POST',
        input: inputSchema,
        output: outputSchema,
        params: paramsSchema,
      });
    });

    it('should create route definition without input', () => {
      const outputSchema = z.object({ result: z.number() });
      
      const routeDef = httpRoute({
        method: 'GET',
        output: outputSchema,
      });
      
      expect(routeDef).toEqual({
        method: 'GET',
        input: undefined,
        output: outputSchema,
        params: undefined,
      });
    });
  });

  describe('CommonSchemas', () => {
    it('should validate service status', () => {
      const validStatus = {
        status: 'healthy',
        uptime: 3600,
        version: '1.0.0',
        timestamp: Date.now(),
      };

      const result = CommonSchemas.serviceStatus.parse(validStatus);
      expect(result).toEqual(validStatus);
    });

    it('should validate device info', () => {
      const validDevice = {
        id: 'device-123',
        name: 'Test Device',
        type: 'sensor',
        status: 'online',
        lastSeen: Date.now(),
        metadata: { location: 'office' },
      };

      const result = CommonSchemas.deviceInfo.parse(validDevice);
      expect(result).toEqual(validDevice);
    });

    it('should validate notification', () => {
      const validNotification = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'info',
        title: 'Test Notification',
        message: 'This is a test',
        timestamp: Date.now(),
        read: false,
        data: { extra: 'info' },
      };

      const result = CommonSchemas.notification.parse(validNotification);
      expect(result).toEqual(validNotification);
    });

    it('should validate pagination query', () => {
      const validQuery = {
        page: 2,
        limit: 20,
        sort: 'name',
        order: 'desc',
      };

      const result = CommonSchemas.paginationQuery.parse(validQuery);
      expect(result).toEqual(validQuery);
    });

    it('should use defaults for pagination query', () => {
      const minimalQuery = {};

      const result = CommonSchemas.paginationQuery.parse(minimalQuery);
      expect(result).toEqual({
        page: 1,
        limit: 10,
        order: 'asc',
      });
    });

    it('should create success response', () => {
      const dataSchema = z.object({ value: z.number() });
      const successSchema = CommonSchemas.successResponse(dataSchema);

      const validResponse = {
        success: true,
        data: { value: 42 },
        timestamp: Date.now(),
      };

      const result = successSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });

    it('should create paginated response', () => {
      const itemSchema = z.object({ id: z.string() });
      const paginatedSchema = CommonSchemas.paginatedResponse(itemSchema);

      const validResponse = {
        items: [{ id: '1' }, { id: '2' }],
        total: 10,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      const result = paginatedSchema.parse(validResponse);
      expect(result).toEqual(validResponse);
    });
  });

  describe('route', () => {
    it('should create route with parameters', () => {
      const params = { id: z.string(), type: z.number() };
      const routeInfo = route('/test/<id>/<type>', params);
      
      expect(routeInfo).toEqual({
        path: '/test/<id>/<type>',
        params,
      });
    });
  });

  describe('validateRouteParams', () => {
    it('should validate route parameters', () => {
      const params = {
        id: z.string(),
        count: z.number(),
      };

      const values = {
        id: 'test-123',
        count: 42,
      };

      const result = validateRouteParams(params, values);
      expect(result).toEqual({
        id: 'test-123',
        count: 42,
      });
    });

    it('should throw error for invalid parameters', () => {
      const params = {
        id: z.string(),
        count: z.number(),
      };

      const values = {
        id: 123, // Should be string
        count: '42', // Should be number
      };

      expect(() => validateRouteParams(params, values)).toThrow();
    });

    it('should handle missing parameters', () => {
      const params = {
        id: z.string(),
        count: z.number(),
      };

      const values = {
        id: 'test-123',
        // count is missing
      };

      expect(() => validateRouteParams(params, values)).toThrow();
    });
  });
}); 