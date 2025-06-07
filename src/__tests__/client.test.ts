import { DaebusClient } from '../client';
import { DaebusHttpClient } from '../http/client';
import { DaebusWebSocketClient } from '../websocket/client';
import { DaebusConnectionError } from '../types';
import { defineSchema, action, channel, httpRoute } from '../utils/schema';
import { z } from 'zod';

// Mock the HTTP and WebSocket clients
jest.mock('../http/client');
jest.mock('../websocket/client');

const MockDaebusHttpClient = DaebusHttpClient as jest.MockedClass<typeof DaebusHttpClient>;
const MockDaebusWebSocketClient = DaebusWebSocketClient as jest.MockedClass<typeof DaebusWebSocketClient>;

// Create a test schema
const testSchema = defineSchema({
  actions: {
    test_action: action(
      z.object({ input: z.string() }),
      z.object({ output: z.string() })
    ),
  },
  channels: {
    test_channel: channel(z.object({ message: z.string() })),
  },
  routes: {
    '/test': httpRoute({
      method: 'GET',
      output: z.object({ data: z.string() }),
    }),
    '/test/<id>': httpRoute({
      method: 'GET',
      output: z.object({ id: z.string(), data: z.string() }),
      params: { id: z.string() },
    }),
  },
});

describe('DaebusClient', () => {
  let client: DaebusClient<typeof testSchema>;
  let mockHttpClient: jest.Mocked<DaebusHttpClient>;
  let mockWsClient: jest.Mocked<DaebusWebSocketClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      request: jest.fn(),
      updateConfig: jest.fn(),
    } as any;

    mockWsClient = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      sendAction: jest.fn(),
      subscribeToChannel: jest.fn(),
      unsubscribeFromChannel: jest.fn(),
      broadcast: jest.fn(),
      isConnected: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
    } as any;

    // Mock constructors to return our mock instances
    MockDaebusHttpClient.mockImplementation(() => mockHttpClient);
    MockDaebusWebSocketClient.mockImplementation(() => mockWsClient);

    client = new DaebusClient({
      serviceName: 'test-service',
      httpBaseUrl: 'http://localhost:8080',
      wsUrl: 'ws://localhost:8081',
      schema: testSchema,
      autoConnect: false, // Disable auto-connect for testing
    });
  });

  describe('constructor', () => {
    it('should initialize with HTTP and WebSocket clients', () => {
      expect(MockDaebusHttpClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:8080',
        timeout: undefined,
        retryAttempts: undefined,
        retryDelay: undefined,
        headers: undefined,
      });

      expect(MockDaebusWebSocketClient).toHaveBeenCalledWith({
        url: 'ws://localhost:8081',
        timeout: undefined,
        maxReconnectAttempts: 5,
        reconnectInterval: 5000,
      });

      expect(client.serviceName).toBe('test-service');
    });

    it('should initialize with only HTTP client', () => {
      jest.clearAllMocks(); // Clear previous mocks
      
      const _httpOnlyClient = new DaebusClient({
        serviceName: 'test-service',
        httpBaseUrl: 'http://localhost:8080',
        schema: testSchema,
      });

      expect(MockDaebusHttpClient).toHaveBeenCalled();
      expect(MockDaebusWebSocketClient).not.toHaveBeenCalled();
    });

    it('should initialize with only WebSocket client', () => {
      jest.clearAllMocks();
      
      const _wsOnlyClient = new DaebusClient({
        serviceName: 'test-service',
        wsUrl: 'ws://localhost:8081',
        schema: testSchema,
        autoConnect: false,
      });

      expect(MockDaebusHttpClient).not.toHaveBeenCalled();
      expect(MockDaebusWebSocketClient).toHaveBeenCalled();
    });
  });

  describe('HTTP methods', () => {
    it('should delegate GET requests to HTTP client', async () => {
      const mockResponse = { data: 'test', status: 200 };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await client.get('/test');

      expect(mockHttpClient.get).toHaveBeenCalledWith('/test', {});
      expect(result).toBe(mockResponse);
    });

    it('should delegate POST requests to HTTP client', async () => {
      const requestData = { input: 'test' };
      const mockResponse = { data: 'response', status: 200 };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await client.post('/test', requestData);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/test', requestData, {});
      expect(result).toBe(mockResponse);
    });

    it('should handle GET requests with parameters', async () => {
      const mockResponse = { data: { id: 'test-123', data: 'test' }, status: 200 };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      await client.get('/test/<id>', { params: { id: 'test-123' } });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/test/<id>', {
        params: { id: 'test-123' },
      });
    });

    it('should throw error when HTTP client not configured', async () => {
      const wsOnlyClient = new DaebusClient({
        serviceName: 'test-service',
        wsUrl: 'ws://localhost:8081',
        autoConnect: false,
      });

      await expect(wsOnlyClient.get('/test')).rejects.toThrow(DaebusConnectionError);
      await expect(wsOnlyClient.post('/test', {})).rejects.toThrow(DaebusConnectionError);
      await expect(wsOnlyClient.request('/test')).rejects.toThrow(DaebusConnectionError);
    });
  });

  describe('WebSocket methods', () => {
    it('should delegate connection to WebSocket client', async () => {
      mockWsClient.connect.mockResolvedValue(undefined);

      await client.connect();

      expect(mockWsClient.connect).toHaveBeenCalled();
    });

    it('should delegate disconnection to WebSocket client', () => {
      client.disconnect();

      expect(mockWsClient.disconnect).toHaveBeenCalled();
    });

    it('should delegate sendAction to WebSocket client', async () => {
      const mockResult = { output: 'test' };
      mockWsClient.sendAction.mockResolvedValue(mockResult);

      const result = await client.sendAction('test_action', { input: 'test' });

      expect(mockWsClient.sendAction).toHaveBeenCalledWith(
        'test-service',
        'test_action',
        { input: 'test' },
        undefined
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate subscribe to WebSocket client', async () => {
      const handler = jest.fn();
      mockWsClient.subscribeToChannel.mockResolvedValue(undefined);

      await client.subscribe('test_channel', handler);

      expect(mockWsClient.subscribeToChannel).toHaveBeenCalledWith('test_channel', handler);
    });

    it('should delegate unsubscribe to WebSocket client', async () => {
      mockWsClient.unsubscribeFromChannel.mockResolvedValue(undefined);

      await client.unsubscribe('test_channel');

      expect(mockWsClient.unsubscribeFromChannel).toHaveBeenCalledWith('test_channel');
    });

    it('should delegate broadcast to WebSocket client', () => {
      const data = { message: 'test' };

      client.broadcast('test_channel', data);

      expect(mockWsClient.broadcast).toHaveBeenCalledWith('test_channel', data);
    });

    it('should delegate isConnected to WebSocket client', () => {
      mockWsClient.isConnected.mockReturnValue(true);

      const result = client.isConnected();

      expect(mockWsClient.isConnected).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should throw error when WebSocket client not configured', async () => {
      const httpOnlyClient = new DaebusClient({
        serviceName: 'test-service',
        httpBaseUrl: 'http://localhost:8080',
      });

      await expect(httpOnlyClient.connect()).rejects.toThrow(DaebusConnectionError);
      await expect(httpOnlyClient.sendAction('test', {})).rejects.toThrow(DaebusConnectionError);
      await expect(httpOnlyClient.subscribe('test', jest.fn())).rejects.toThrow(DaebusConnectionError);
      await expect(httpOnlyClient.unsubscribe('test')).rejects.toThrow(DaebusConnectionError);
      expect(() => httpOnlyClient.broadcast('test', {})).toThrow(DaebusConnectionError);
      expect(httpOnlyClient.isConnected()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should update client configuration', () => {
      const newConfig = {
        httpBaseUrl: 'http://newhost:8080',
        timeout: 15000,
        headers: { 'Authorization': 'Bearer token' },
      };

      client.updateConfig(newConfig);

      expect(mockHttpClient.updateConfig).toHaveBeenCalledWith({
        baseUrl: 'http://newhost:8080',
        timeout: 15000,
        retryAttempts: undefined,
        retryDelay: undefined,
        headers: { 'Authorization': 'Bearer token' },
      });
    });

    it('should create client for different service', () => {
      const newClient = client.forService('other-service');

      expect(newClient).toBeInstanceOf(DaebusClient);
      expect(newClient.serviceName).toBe('other-service');
    });
  });

  describe('connection utilities', () => {
    it('should wait for connection', async () => {
      mockWsClient.isConnected.mockReturnValue(true);

      await expect(client.waitForConnection()).resolves.toBeUndefined();
    });

    it('should timeout when waiting for connection', async () => {
      mockWsClient.isConnected.mockReturnValue(false);
      
      // Mock the event handling - simulate timeout
      const waitPromise = client.waitForConnection(100);
      
      await expect(waitPromise).rejects.toThrow(DaebusConnectionError);
    });

    it('should ensure connection when not connected', async () => {
      mockWsClient.isConnected.mockReturnValue(false);
      mockWsClient.connect.mockResolvedValue(undefined);

      await client.ensureConnection();

      expect(mockWsClient.connect).toHaveBeenCalled();
    });

    it('should not connect when already connected', async () => {
      mockWsClient.isConnected.mockReturnValue(true);

      await client.ensureConnection();

      expect(mockWsClient.connect).not.toHaveBeenCalled();
    });
  });

  describe('event proxying', () => {
    it('should proxy WebSocket events', () => {
      // Verify that event listeners are set up
      expect(mockWsClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockWsClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockWsClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWsClient.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });
}); 