import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  DaebusMessage,
  DaebusError,
  DaebusTimeoutError,
  DaebusConnectionError,
  ServiceSchema,
  ServiceActions,
  ServiceChannels,
  ActionInput,
  ActionOutput,
  ChannelData,
} from '@/types';

export interface WebSocketClientOptions {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  timeout?: number;
  protocols?: string[];
}

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class DaebusWebSocketClient<T extends ServiceSchema = ServiceSchema> extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private isReconnecting = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private subscribedChannels = new Set<string>();

  constructor(private options: WebSocketClientOptions) {
    super();
    this.setMaxListeners(0); // Remove listener limit
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url, this.options.protocols);

        this.ws.on('open', () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit('connect');
          
          // Resubscribe to channels after reconnection
          if (this.isReconnecting) {
            this.resubscribeToChannels();
            this.isReconnecting = false;
          }
          
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.isConnecting = false;
          this.emit('disconnect', code, reason.toString());
          
          if (code !== 1000 && !this.isReconnecting) { // Not a normal closure
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error: Error) => {
          this.isConnecting = false;
          this.emit('error', error);
          reject(new DaebusConnectionError(`WebSocket connection failed: ${error.message}`));
        });

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    // Clear all pending requests
    for (const [_id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new DaebusConnectionError('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Send an action request to a service
   */
  async sendAction<A extends ServiceActions<T>>(
    serviceName: string,
    action: A,
    payload: ActionInput<T, A>,
    timeout: number = this.options.timeout ?? 30000
  ): Promise<ActionOutput<T, A>> {
    if (!this.isConnected()) {
      throw new DaebusConnectionError('WebSocket is not connected');
    }

    const requestId = this.generateRequestId();
    const replyChannel = `reply_${requestId}`;

    const message: DaebusMessage = {
      action: String(action),
      payload: payload as Record<string, unknown>,
      reply_channel: replyChannel,
      request_id: requestId,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new DaebusTimeoutError(`Action ${String(action)} timed out`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeoutHandle);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        },
        timeout: timeoutHandle,
      });

      // Send to service's main channel
      this.sendToChannel(serviceName, message);
    });
  }

  /**
   * Subscribe to a broadcast channel
   */
  async subscribeToChannel<C extends ServiceChannels<T>>(
    channel: C,
    handler: (data: ChannelData<T, C>) => void
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new DaebusConnectionError('WebSocket is not connected');
    }

    const channelName = String(channel);
    this.subscribedChannels.add(channelName);
    
    // Add event listener for this channel
    this.on(`channel:${channelName}`, handler);

    // Send subscription message
    const subscribeMessage = {
      type: 'subscribe',
      channel: channelName,
    };

    this.ws!.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Unsubscribe from a broadcast channel
   */
  async unsubscribeFromChannel<C extends ServiceChannels<T>>(channel: C): Promise<void> {
    const channelName = String(channel);
    this.subscribedChannels.delete(channelName);
    
    // Remove all listeners for this channel
    this.removeAllListeners(`channel:${channelName}`);

    if (this.isConnected()) {
      // Send unsubscription message
      const unsubscribeMessage = {
        type: 'unsubscribe',
        channel: channelName,
      };

      this.ws!.send(JSON.stringify(unsubscribeMessage));
    }
  }

  /**
   * Send a message to a specific channel
   */
  sendToChannel(channel: string, message: DaebusMessage): void {
    if (!this.isConnected()) {
      throw new DaebusConnectionError('WebSocket is not connected');
    }

    const channelMessage = {
      type: 'publish',
      channel,
      data: message,
    };

    this.ws!.send(JSON.stringify(channelMessage));
  }

  /**
   * Send a broadcast message to a channel
   */
  broadcast<C extends ServiceChannels<T>>(
    channel: C,
    data: ChannelData<T, C>
  ): void {
    if (!this.isConnected()) {
      throw new DaebusConnectionError('WebSocket is not connected');
    }

    const broadcastMessage = {
      type: 'broadcast',
      channel: String(channel),
      data,
    };

    this.ws!.send(JSON.stringify(broadcastMessage));
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle different message types
      if (message.type === 'response') {
        this.handleResponse(message);
      } else if (message.type === 'channel_message') {
        this.handleChannelMessage(message);
      } else if (message.channel && message.data) {
        // Direct channel message
        this.emit(`channel:${message.channel}`, message.data);
      } else if (message.request_id && this.pendingRequests.has(message.request_id)) {
        // Response to a request
        this.handleResponse(message);
      } else {
        // Generic message event
        this.emit('message', message);
      }
    } catch (error) {
      this.emit('error', new DaebusError(`Failed to parse message: ${error}`));
    }
  }

  /**
   * Handle response messages
   */
  private handleResponse(response: any): void {
    const requestId = response.request_id;
    const pendingRequest = this.pendingRequests.get(requestId);

    if (pendingRequest) {
      this.pendingRequests.delete(requestId);

      if (response.success === false) {
        pendingRequest.reject(new DaebusError(response.error || 'Unknown error'));
      } else {
        pendingRequest.resolve(response.data);
      }
    }
  }

  /**
   * Handle channel messages
   */
  private handleChannelMessage(message: any): void {
    const { channel, data } = message;
    this.emit(`channel:${channel}`, data);
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts ?? 5)) {
      this.emit('error', new DaebusConnectionError('Max reconnection attempts exceeded'));
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.options.reconnectInterval ?? 5000;
    setTimeout(() => {
      if (this.isReconnecting) {
        this.connect().catch((error) => {
          this.emit('error', error);
          this.scheduleReconnect();
        });
      }
    }, delay);
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private resubscribeToChannels(): void {
    for (const channel of this.subscribedChannels) {
      const subscribeMessage = {
        type: 'subscribe',
        channel,
      };
      this.ws!.send(JSON.stringify(subscribeMessage));
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }
} 