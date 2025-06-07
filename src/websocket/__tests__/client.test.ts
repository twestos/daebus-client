import { EventEmitter } from 'events';
import {
  DaebusError,
  DaebusTimeoutError,
  DaebusConnectionError,
} from '../../types';

// Mock WebSocket - define at the top level
class MockWebSocket extends EventEmitter {
  public static CONNECTING = 0;
  public static OPEN = 1;
  public static CLOSING = 2;
  public static CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public url: string;
  public protocol: string;

  constructor(url: string, protocols?: string | string[]) {
    super();
    this.url = url;
    this.protocol = Array.isArray(protocols) ? protocols[0] : protocols || '';
    
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Echo back for testing
    setTimeout(() => {
      this.emit('message', data);
    }, 5);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code || 1000, Buffer.from(reason || ''));
  }
}

// Mock the ws module
jest.mock('ws', () => MockWebSocket);

// Import after mocking
import { DaebusWebSocketClient } from '../client';

describe('DaebusWebSocketClient', () => {
  let client: DaebusWebSocketClient;

  beforeEach(() => {
    client = new DaebusWebSocketClient({
      url: 'ws://localhost:8081',
      timeout: 1000,
      maxReconnectAttempts: 2,
      reconnectInterval: 100,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    client.disconnect();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize client with options', () => {
      expect(client).toBeInstanceOf(DaebusWebSocketClient);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      const connectPromise = client.connect();
      
      await expect(connectPromise).resolves.toBeUndefined();
      expect(client.isConnected()).toBe(true);
    });

    it('should emit connect event', async () => {
      const connectSpy = jest.fn();
      client.on('connect', connectSpy);

      await client.connect();

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should not connect twice if already connecting', async () => {
      const promise1 = client.connect();
      const promise2 = client.connect();

      await Promise.all([promise1, promise2]);
      expect(client.isConnected()).toBe(true);
    });

    it('should disconnect cleanly', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should emit disconnect event', async () => {
      const disconnectSpy = jest.fn();
      client.on('disconnect', disconnectSpy);

      await client.connect();
      client.disconnect();

      // Wait for event emission
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('sendAction', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should send action and return response', async () => {
      let requestId: string;
      
      // Capture the request ID from the message
      client['sendToChannel'] = jest.fn((channel, message) => {
        requestId = message.request_id!;
        // Simulate response after a short delay
        setTimeout(() => {
          client['handleResponse']({
            success: true,
            data: { result: 'test' },
            request_id: requestId,
          });
        }, 10);
      });

      const result = await client.sendAction('test-service', 'test_action', { param: 'value' });
      expect(result).toEqual({ result: 'test' });
    });

    it('should handle action timeout', async () => {
      // Don't send any response to trigger timeout
      await expect(
        client.sendAction('test-service', 'test_action', { param: 'value' }, 100)
      ).rejects.toThrow(DaebusTimeoutError);
    });

    it('should handle action error response', async () => {
      let requestId: string;
      
      // Capture the request ID and send error response
      client['sendToChannel'] = jest.fn((channel, message) => {
        requestId = message.request_id!;
        setTimeout(() => {
          client['handleResponse']({
            success: false,
            error: 'Action failed',
            request_id: requestId,
          });
        }, 10);
      });

      await expect(
        client.sendAction('test-service', 'test_action', { param: 'value' })
      ).rejects.toThrow(DaebusError);
    });

    it('should throw error if not connected', async () => {
      client.disconnect();

      await expect(
        client.sendAction('test-service', 'test_action', {})
      ).rejects.toThrow(DaebusConnectionError);
    });
  });

  describe('channel subscription', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should subscribe to channel', async () => {
      const handler = jest.fn();
      
      await client.subscribeToChannel('test-channel', handler);

      // Simulate channel message
      client['handleChannelMessage']({ channel: 'test-channel', data: { test: 'data' } });

      expect(handler).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should unsubscribe from channel', async () => {
      const handler = jest.fn();
      
      await client.subscribeToChannel('test-channel', handler);
      await client.unsubscribeFromChannel('test-channel');

      // Simulate channel message - should not call handler
      client['handleChannelMessage']({ channel: 'test-channel', data: { test: 'data' } });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should throw error when subscribing if not connected', async () => {
      client.disconnect();

      await expect(
        client.subscribeToChannel('test-channel', jest.fn())
      ).rejects.toThrow(DaebusConnectionError);
    });
  });

  describe('broadcasting', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should broadcast message to channel', () => {
      const testData = { message: 'test broadcast' };
      
      expect(() => {
        client.broadcast('test-channel', testData);
      }).not.toThrow();
    });

    it('should throw error when broadcasting if not connected', () => {
      client.disconnect();

      expect(() => {
        client.broadcast('test-channel', { test: 'data' });
      }).toThrow(DaebusConnectionError);
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should handle response messages', () => {
      const requestId = 'test-request-id';
      const mockRequest = {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      };

      client['pendingRequests'].set(requestId, mockRequest);

      client['handleResponse']({
        success: true,
        data: { result: 'success' },
        request_id: requestId,
      });

      expect(mockRequest.resolve).toHaveBeenCalledWith({ result: 'success' });
      expect(client['pendingRequests'].has(requestId)).toBe(false);
    });

    it('should handle error response messages', () => {
      const requestId = 'test-request-id';
      const mockRequest = {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      };

      client['pendingRequests'].set(requestId, mockRequest);

      client['handleResponse']({
        success: false,
        error: 'Test error',
        request_id: requestId,
      });

      expect(mockRequest.reject).toHaveBeenCalledWith(expect.any(DaebusError));
      expect(client['pendingRequests'].has(requestId)).toBe(false);
    });

    it('should handle invalid JSON messages', () => {
      const errorSpy = jest.fn();
      client.on('error', errorSpy);

      client['handleMessage']('invalid json');

      expect(errorSpy).toHaveBeenCalledWith(expect.any(DaebusError));
    });
  });

  describe('reconnection', () => {
    it('should attempt reconnection on unexpected close', async () => {
      const reconnectSpy = jest.spyOn(client as any, 'scheduleReconnect');
      
      await client.connect();
      
      // Simulate unexpected close (not normal 1000 code)
      const ws = client['ws'] as any;
      ws.readyState = MockWebSocket.CLOSED;
      ws.emit('close', 1006, Buffer.from('Connection lost'));

      expect(reconnectSpy).toHaveBeenCalled();
    });

    it('should not reconnect on normal close', async () => {
      const reconnectSpy = jest.spyOn(client as any, 'scheduleReconnect');
      
      await client.connect();
      client.disconnect(); // Normal close

      expect(reconnectSpy).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should generate unique request IDs', () => {
      const id1 = client['generateRequestId']();
      const id2 = client['generateRequestId']();

      expect(id1).toMatch(/^req_\d+_\d+$/);
      expect(id2).toMatch(/^req_\d+_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });
}); 