import {
  DaebusMessageSchema,
  DaebusResponseSchema,
  HttpResponseSchema,
  DaebusError,
  DaebusTimeoutError,
  DaebusConnectionError,
} from '../index';

describe('Core Types', () => {
  describe('DaebusMessageSchema', () => {
    it('should validate a valid daebus message', () => {
      const validMessage = {
        action: 'test_action',
        payload: { key: 'value' },
        reply_channel: 'reply_123',
        request_id: 'req_123',
        timestamp: Date.now(),
      };

      const result = DaebusMessageSchema.parse(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should validate a minimal daebus message', () => {
      const minimalMessage = {};
      const result = DaebusMessageSchema.parse(minimalMessage);
      expect(result).toEqual({});
    });

    it('should reject invalid payload type', () => {
      const invalidMessage = {
        payload: 'invalid_string_payload',
      };

      expect(() => DaebusMessageSchema.parse(invalidMessage)).toThrow();
    });
  });

  describe('DaebusResponseSchema', () => {
    it('should validate a success response', () => {
      const successResponse = {
        success: true,
        data: { result: 'test' },
        request_id: 'req_123',
      };

      const result = DaebusResponseSchema.parse(successResponse);
      expect(result).toEqual(successResponse);
    });

    it('should validate an error response', () => {
      const errorResponse = {
        success: false,
        error: 'Something went wrong',
        request_id: 'req_123',
      };

      const result = DaebusResponseSchema.parse(errorResponse);
      expect(result).toEqual(errorResponse);
    });
  });

  describe('HttpResponseSchema', () => {
    it('should validate an HTTP response', () => {
      const httpResponse = {
        data: { message: 'Hello' },
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      const result = HttpResponseSchema.parse(httpResponse);
      expect(result).toEqual(httpResponse);
    });

    it('should validate response without headers', () => {
      const httpResponse = {
        data: { message: 'Hello' },
        status: 200,
      };

      const result = HttpResponseSchema.parse(httpResponse);
      expect(result).toEqual(httpResponse);
    });
  });
});

describe('Error Classes', () => {
  describe('DaebusError', () => {
    it('should create error with message only', () => {
      const error = new DaebusError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('DaebusError');
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it('should create error with code and details', () => {
      const error = new DaebusError('Test error', 'TEST_CODE', { extra: 'info' });
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ extra: 'info' });
    });
  });

  describe('DaebusTimeoutError', () => {
    it('should create timeout error with default message', () => {
      const error = new DaebusTimeoutError();
      expect(error.message).toBe('Request timed out');
      expect(error.name).toBe('DaebusTimeoutError');
      expect(error.code).toBe('TIMEOUT');
    });

    it('should create timeout error with custom message', () => {
      const error = new DaebusTimeoutError('Custom timeout message');
      expect(error.message).toBe('Custom timeout message');
      expect(error.code).toBe('TIMEOUT');
    });
  });

  describe('DaebusConnectionError', () => {
    it('should create connection error with default message', () => {
      const error = new DaebusConnectionError();
      expect(error.message).toBe('Connection error');
      expect(error.name).toBe('DaebusConnectionError');
      expect(error.code).toBe('CONNECTION_ERROR');
    });

    it('should create connection error with custom message', () => {
      const error = new DaebusConnectionError('Custom connection message');
      expect(error.message).toBe('Custom connection message');
      expect(error.code).toBe('CONNECTION_ERROR');
    });
  });
}); 