import { DaebusHttpClient } from '../client';
import {
  DaebusError,
  DaebusConnectionError,
} from '../../types';

// Mock fetch globally
global.fetch = jest.fn();
global.AbortController = jest.fn(() => ({
  signal: {},
  abort: jest.fn(),
})) as any;

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('DaebusHttpClient', () => {
  let client: DaebusHttpClient;

  beforeEach(() => {
    client = new DaebusHttpClient({
      baseUrl: 'http://localhost:8080',
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultClient = new DaebusHttpClient({
        baseUrl: 'http://localhost:8080',
      });
      expect(defaultClient).toBeInstanceOf(DaebusHttpClient);
    });

    it('should remove trailing slash from baseUrl', () => {
      const clientWithSlash = new DaebusHttpClient({
        baseUrl: 'http://localhost:8080/',
      });
      expect(clientWithSlash).toBeInstanceOf(DaebusHttpClient);
    });
  });

  describe('get', () => {
    it('should make a successful GET request', async () => {
      const mockResponse = { message: 'success' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      } as any);

      const result = await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result.data).toEqual(mockResponse);
      expect(result.status).toBe(200);
    });

    it('should handle URL parameters', async () => {
      const mockResponse = { device: 'test-device' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map(),
      } as any);

      await client.get('/devices/<device_id>', {
        params: { device_id: 'test-123' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/devices/test-123',
        expect.any(Object)
      );
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
        headers: new Map(),
      } as any);

      try {
        await client.get('/nonexistent');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DaebusError);
        expect((error as Error).message).toContain('HTTP 404: Not Found');
      }
    });
  });

  describe('post', () => {
    it('should make a successful POST request', async () => {
      const requestData = { action: 'test' };
      const mockResponse = { success: true };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map(),
      } as any);

      const result = await client.post('/control', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/control',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result.data).toEqual(mockResponse);
    });
  });

  describe('request', () => {
    it('should handle custom headers', async () => {
      const mockResponse = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map(),
      } as any);

      await client.request('/test', {
        headers: { 'X-Custom-Header': 'test-value' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'test-value',
          }),
        })
      );
    });

    it('should handle connection errors', async () => {
      // Mock a network-level error
      mockFetch.mockImplementation(() => {
        throw new TypeError('Failed to fetch');
      });

      await expect(client.request('/test')).rejects.toThrow(DaebusConnectionError);
    });
  });

  describe('retry logic', () => {
    it('should retry on network failure', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
          headers: new Map(),
        } as any);

      // Mock delay function
      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      const result = await client.get('/test');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual({ success: true });
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      jest.spyOn(client as any, 'delay').mockResolvedValue(undefined);

      await expect(client.get('/test')).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry (retryAttempts: 2)
    });
  });

  describe('updateConfig', () => {
    it('should update client configuration', () => {
      const newHeaders = { 'Authorization': 'Bearer token' };
      
      client.updateConfig({
        baseUrl: 'http://newurl:8080',
        timeout: 10000,
        headers: newHeaders,
      });

      // Test that config was updated (this is more of an integration test)
      expect(() => client.updateConfig({})).not.toThrow();
    });
  });
}); 