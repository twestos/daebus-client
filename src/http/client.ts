import {
  DaebusError,
  DaebusTimeoutError,
  DaebusConnectionError,
  HttpResponse,
  ServiceSchema,
  ServiceRoutes,
  RouteInput,
  RouteOutput,
  RouteParams,
} from '@/types';

export interface HttpClientOptions {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export class DaebusHttpClient<T extends ServiceSchema = ServiceSchema> {
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private defaultHeaders: Record<string, string>;

  constructor(private options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options.timeout ?? 30000;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Make a typed HTTP request to a service route
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
    const { params = {}, data, headers = {}, timeout = this.timeout } = options;
    
    // Build URL with parameters
    let url = `${this.baseUrl}${String(route)}`;
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`<${key}>`, encodeURIComponent(String(value)));
    }

    const requestHeaders = { ...this.defaultHeaders, ...headers };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.makeRequestWithRetry(url, {
        method: 'POST', // Default to POST for now, can be enhanced to use schema method
        headers: requestHeaders,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new DaebusError(
          `HTTP ${response.status}: ${errorText}`,
          'HTTP_ERROR',
          { status: response.status, response: errorText }
        );
      }

      const responseData = await response.json();
      
      return {
        data: responseData,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DaebusTimeoutError(`Request to ${String(route)} timed out`);
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new DaebusConnectionError(`Failed to connect to ${url}`);
      }
      
      throw error;
    }
  }

  /**
   * Make a GET request
   */
  async get<R extends ServiceRoutes<T>>(
    route: R,
    options: {
      params?: RouteParams<T, R>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<HttpResponse<RouteOutput<T, R>>> {
    const { params = {}, headers = {}, timeout = this.timeout } = options;
    
    let url = `${this.baseUrl}${String(route)}`;
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`<${key}>`, encodeURIComponent(String(value)));
    }

    const requestHeaders = { ...this.defaultHeaders, ...headers };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.makeRequestWithRetry(url, {
        method: 'GET',
        headers: requestHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new DaebusError(
          `HTTP ${response.status}: ${errorText}`,
          'HTTP_ERROR',
          { status: response.status, response: errorText }
        );
      }

      const responseData = await response.json();
      
      return {
        data: responseData,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DaebusTimeoutError(`GET request to ${String(route)} timed out`);
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new DaebusConnectionError(`Failed to connect to ${url}`);
      }
      
      throw error;
    }
  }

  /**
   * Make a POST request
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
    return this.request(route, { ...options, data });
  }

  /**
   * Make request with retry logic
   */
  private async makeRequestWithRetry(
    url: string,
    init: RequestInit,
    attempt: number = 1
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        await this.delay(this.retryDelay * attempt);
        return this.makeRequestWithRetry(url, init, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Delay utility for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update client configuration
   */
  updateConfig(options: Partial<HttpClientOptions>): void {
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/$/, '');
    }
    if (options.timeout !== undefined) {
      this.timeout = options.timeout;
    }
    if (options.retryAttempts !== undefined) {
      this.retryAttempts = options.retryAttempts;
    }
    if (options.retryDelay !== undefined) {
      this.retryDelay = options.retryDelay;
    }
    if (options.headers) {
      this.defaultHeaders = { ...this.defaultHeaders, ...options.headers };
    }
  }
} 