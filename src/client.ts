import { EventEmitter } from 'events';
import { DaebusHttpClient } from '@/http/client';
import { DaebusWebSocketClient } from '@/websocket/client';
import {
  ServiceSchema,
  ServiceActions,
  ServiceChannels,
  ServiceRoutes,
  ActionInput,
  ActionOutput,
  ChannelData,
  RouteInput,
  RouteOutput,
  RouteParams,
  HttpResponse,
  DaebusConnectionError,
} from '@/types';

export interface DaebusClientOptions<T extends ServiceSchema = ServiceSchema> {
  serviceName: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  autoConnect?: boolean;
  schema?: T;
}

export class DaebusClient<T extends ServiceSchema = ServiceSchema> extends EventEmitter {
  private httpClient?: DaebusHttpClient<T>;
  private wsClient?: DaebusWebSocketClient<T>;
  public readonly serviceName: string;

  constructor(private options: DaebusClientOptions<T>) {
    super();
    this.serviceName = options.serviceName;

    // Initialize HTTP client if URL provided
    if (options.httpBaseUrl) {
      this.httpClient = new DaebusHttpClient<T>({
        baseUrl: options.httpBaseUrl,
        timeout: options.timeout,
        retryAttempts: options.retryAttempts,
        retryDelay: options.retryDelay,
        headers: options.headers,
      });
    }

    // Initialize WebSocket client if URL provided
    if (options.wsUrl) {
      this.wsClient = new DaebusWebSocketClient<T>({
        url: options.wsUrl,
        timeout: options.timeout,
        maxReconnectAttempts: options.retryAttempts ?? 5,
        reconnectInterval: options.retryDelay ?? 5000,
      });

      // Proxy WebSocket events
      this.wsClient.on('connect', () => this.emit('connect'));
      this.wsClient.on('disconnect', (code, reason) => this.emit('disconnect', code, reason));
      this.wsClient.on('error', (error) => this.emit('error', error));
      this.wsClient.on('message', (data) => this.emit('message', data));

      // Auto-connect if enabled
      if (options.autoConnect !== false) {
        this.wsClient.connect().catch((error) => {
          this.emit('error', error);
        });
      }
    }
  }

  /**
   * HTTP Methods
   */

  /**
   * Make an HTTP GET request to a service route
   */
  async get<R extends ServiceRoutes<T>>(
    route: R,
    options: {
      params?: RouteParams<T, R>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<HttpResponse<RouteOutput<T, R>>> {
    if (!this.httpClient) {
      throw new DaebusConnectionError('HTTP client not configured. Provide httpBaseUrl in options.');
    }
    return this.httpClient.get(route, options);
  }

  /**
   * Make an HTTP POST request to a service route
   */
  async post<R extends ServiceRoutes<T>>(
    route: R,
    data: RouteInput<T, R>,
    options: {
      params?: RouteParams<T, R>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<HttpResponse<RouteOutput<T, R>>> {
    if (!this.httpClient) {
      throw new DaebusConnectionError('HTTP client not configured. Provide httpBaseUrl in options.');
    }
    return this.httpClient.post(route, data, options);
  }

  /**
   * Make a general HTTP request to a service route
   */
  async request<R extends ServiceRoutes<T>>(
    route: R,
    options: {
      params?: RouteParams<T, R>;
      data?: RouteInput<T, R>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<HttpResponse<RouteOutput<T, R>>> {
    if (!this.httpClient) {
      throw new DaebusConnectionError('HTTP client not configured. Provide httpBaseUrl in options.');
    }
    return this.httpClient.request(route, options);
  }

  /**
   * WebSocket Methods
   */

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (!this.wsClient) {
      throw new DaebusConnectionError('WebSocket client not configured. Provide wsUrl in options.');
    }
    return this.wsClient.connect();
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }

  /**
   * Send an action request via WebSocket
   */
  async sendAction<A extends ServiceActions<T>>(
    action: A,
    payload: ActionInput<T, A>,
    timeout?: number
  ): Promise<ActionOutput<T, A>> {
    if (!this.wsClient) {
      throw new DaebusConnectionError('WebSocket client not configured. Provide wsUrl in options.');
    }
    return this.wsClient.sendAction(this.serviceName, action, payload, timeout);
  }

  /**
   * Subscribe to a broadcast channel
   */
  async subscribe<C extends ServiceChannels<T>>(
    channel: C,
    handler: (data: ChannelData<T, C>) => void
  ): Promise<void> {
    if (!this.wsClient) {
      throw new DaebusConnectionError('WebSocket client not configured. Provide wsUrl in options.');
    }
    return this.wsClient.subscribeToChannel(channel, handler);
  }

  /**
   * Unsubscribe from a broadcast channel
   */
  async unsubscribe<C extends ServiceChannels<T>>(channel: C): Promise<void> {
    if (!this.wsClient) {
      throw new DaebusConnectionError('WebSocket client not configured. Provide wsUrl in options.');
    }
    return this.wsClient.unsubscribeFromChannel(channel);
  }

  /**
   * Broadcast a message to a channel
   */
  broadcast<C extends ServiceChannels<T>>(
    channel: C,
    data: ChannelData<T, C>
  ): void {
    if (!this.wsClient) {
      throw new DaebusConnectionError('WebSocket client not configured. Provide wsUrl in options.');
    }
    this.wsClient.broadcast(channel, data);
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.wsClient?.isConnected() ?? false;
  }

  /**
   * Update client configuration
   */
  updateConfig(options: Partial<DaebusClientOptions<T>>): void {
    // Update HTTP client config
    if (this.httpClient && (options.httpBaseUrl || options.timeout || options.retryAttempts || options.retryDelay || options.headers)) {
      this.httpClient.updateConfig({
        baseUrl: options.httpBaseUrl || this.options.httpBaseUrl!,
        timeout: options.timeout,
        retryAttempts: options.retryAttempts,
        retryDelay: options.retryDelay,
        headers: options.headers,
      });
    }

    // Update internal options
    Object.assign(this.options, options);
  }

  /**
   * Create a new client for a different service using the same configuration
   */
  forService<U extends ServiceSchema = ServiceSchema>(
    serviceName: string,
    schema?: U
  ): DaebusClient<U> {
    return new DaebusClient<U>({
      ...this.options,
      serviceName,
      schema,
    });
  }

  /**
   * Utility method to wait for connection
   */
  async waitForConnection(timeout: number = 10000): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.off('connect', onConnect);
        reject(new DaebusConnectionError('Connection timeout'));
      }, timeout);

      const onConnect = () => {
        clearTimeout(timeoutHandle);
        resolve();
      };

      this.once('connect', onConnect);
    });
  }

  /**
   * Utility method to handle connection with retry
   */
  async ensureConnection(): Promise<void> {
    if (!this.isConnected() && this.wsClient) {
      await this.connect();
    }
  }
} 