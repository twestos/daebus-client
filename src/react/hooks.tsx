import { useEffect, useState, useCallback, useRef } from 'react';
import { DaebusClient, DaebusClientOptions } from '@/client';
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
} from '@/types';

// Hook state types
export interface UseActionState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseChannelState<T> {
  data: T | null;
  connected: boolean;
  error: Error | null;
}

export interface UseConnectionState {
  connected: boolean;
  connecting: boolean;
  error: Error | null;
}

/**
 * Hook for managing a daebus client instance
 */
export function useDaebusClient<T extends ServiceSchema = ServiceSchema>(
  options: DaebusClientOptions<T>
): DaebusClient<T> {
  const clientRef = useRef<DaebusClient<T> | null>(null);

  if (!clientRef.current) {
    clientRef.current = new DaebusClient<T>(options);
  }

  // Update client config when options change
  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.updateConfig(options);
    }
  }, [options]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  return clientRef.current;
}

/**
 * Hook for managing WebSocket connection state
 */
export function useConnection<T extends ServiceSchema = ServiceSchema>(
  client: DaebusClient<T>
): UseConnectionState {
  const [state, setState] = useState<UseConnectionState>({
    connected: client.isConnected(),
    connecting: false,
    error: null,
  });

  useEffect(() => {
    const handleConnect = () => {
      setState({ connected: true, connecting: false, error: null });
    };

    const handleDisconnect = () => {
      setState(prev => ({ ...prev, connected: false, connecting: false }));
    };

    const handleError = (error: Error) => {
      setState(prev => ({ ...prev, error, connecting: false }));
    };

    client.on('connect', handleConnect);
    client.on('disconnect', handleDisconnect);
    client.on('error', handleError);

    return () => {
      client.off('connect', handleConnect);
      client.off('disconnect', handleDisconnect);
      client.off('error', handleError);
    };
  }, [client]);

  return state;
}

/**
 * Hook for sending actions to daebus services
 */
export function useAction<
  T extends ServiceSchema,
  A extends ServiceActions<T>
>(
  client: DaebusClient<T>,
  action: A
): [
  (payload: ActionInput<T, A>, timeout?: number) => Promise<ActionOutput<T, A>>,
  UseActionState<ActionOutput<T, A>>
] {
  const [state, setState] = useState<UseActionState<ActionOutput<T, A>>>({
    data: null,
    loading: false,
    error: null,
  });

  const sendAction = useCallback(
    async (payload: ActionInput<T, A>, timeout?: number): Promise<ActionOutput<T, A>> => {
      setState({ data: null, loading: true, error: null });

      try {
        const result = await client.sendAction(action, payload, timeout);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: err });
        throw error;
      }
    },
    [client, action]
  );

  return [sendAction, state];
}

/**
 * Hook for subscribing to daebus channels
 */
export function useChannel<
  T extends ServiceSchema,
  C extends ServiceChannels<T>
>(
  client: DaebusClient<T>,
  channel: C,
  options: {
    autoSubscribe?: boolean;
    reconnectOnError?: boolean;
  } = {}
): [ChannelData<T, C> | null, UseChannelState<ChannelData<T, C>>] {
  const { autoSubscribe = true, reconnectOnError = true } = options;
  
  const [data, setData] = useState<ChannelData<T, C> | null>(null);
  const [state, setState] = useState<UseChannelState<ChannelData<T, C>>>({
    data: null,
    connected: false,
    error: null,
  });

  useEffect(() => {
    if (!autoSubscribe) return;

    let isSubscribed = false;

    const subscribe = async () => {
      try {
        await client.subscribe(channel, (channelData) => {
          setData(channelData);
          setState(prev => ({ ...prev, data: channelData, connected: true, error: null }));
        });
        isSubscribed = true;
        setState(prev => ({ ...prev, connected: true, error: null }));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState(prev => ({ ...prev, connected: false, error: err }));
        
        if (reconnectOnError) {
          // Retry after a delay
          setTimeout(() => {
            if (!isSubscribed) {
              subscribe();
            }
          }, 5000);
        }
      }
    };

    subscribe();

    return () => {
      if (isSubscribed) {
        client.unsubscribe(channel).catch(console.error);
      }
    };
  }, [client, channel, autoSubscribe, reconnectOnError]);

  return [data, state];
}

/**
 * Hook for making HTTP requests to daebus services
 */
export function useHttpRequest<
  T extends ServiceSchema,
  R extends ServiceRoutes<T>
>(
  client: DaebusClient<T>,
  route: R
): [
  (options: {
    method?: 'GET' | 'POST';
    params?: RouteParams<T, R>;
    data?: RouteInput<T, R>;
    headers?: Record<string, string>;
    timeout?: number;
  }) => Promise<HttpResponse<RouteOutput<T, R>>>,
  UseActionState<HttpResponse<RouteOutput<T, R>>>
] {
  const [state, setState] = useState<UseActionState<HttpResponse<RouteOutput<T, R>>>>({
    data: null,
    loading: false,
    error: null,
  });

  const makeRequest = useCallback(
    async (options: {
      method?: 'GET' | 'POST';
      params?: RouteParams<T, R>;
      data?: RouteInput<T, R>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}): Promise<HttpResponse<RouteOutput<T, R>>> => {
      const { method = 'GET', ...requestOptions } = options;
      
      setState({ data: null, loading: true, error: null });

      try {
        let result: HttpResponse<RouteOutput<T, R>>;
        
        if (method === 'POST' && requestOptions.data) {
          result = await client.post(route, requestOptions.data, requestOptions);
        } else {
          result = await client.get(route, requestOptions);
        }

        setState({ data: result, loading: false, error: null });
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: err });
        throw error;
      }
    },
    [client, route]
  );

  return [makeRequest, state];
}

/**
 * Hook for auto-fetching HTTP data on component mount
 */
export function useFetch<
  T extends ServiceSchema,
  R extends ServiceRoutes<T>
>(
  client: DaebusClient<T>,
  route: R,
  options: {
    params?: RouteParams<T, R>;
    headers?: Record<string, string>;
    timeout?: number;
    enabled?: boolean;
    refetchOnMount?: boolean;
  } = {}
): [RouteOutput<T, R> | null, UseActionState<RouteOutput<T, R>>, () => void] {
  const { enabled = true, refetchOnMount = true, ...requestOptions } = options;
  
  const [state, setState] = useState<UseActionState<RouteOutput<T, R>>>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setState({ data: null, loading: true, error: null });

    try {
      const result = await client.get(route, requestOptions);
      setState({ data: result.data, loading: false, error: null });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState({ data: null, loading: false, error: err });
    }
  }, [client, route, enabled, requestOptions]);

  useEffect(() => {
    if (refetchOnMount) {
      fetchData();
    }
  }, [fetchData, refetchOnMount]);

  return [state.data, state, fetchData];
}

/**
 * Hook for broadcasting messages to daebus channels
 */
export function useBroadcast<
  T extends ServiceSchema,
  C extends ServiceChannels<T>
>(
  client: DaebusClient<T>
): (channel: C, data: ChannelData<T, C>) => void {
  return useCallback(
    (channel: C, data: ChannelData<T, C>) => {
      try {
        client.broadcast(channel, data);
      } catch (error) {
        console.error('Failed to broadcast message:', error);
      }
    },
    [client]
  );
}

/**
 * Higher-order hook that combines multiple daebus functionalities
 */
export function useDaebus<T extends ServiceSchema = ServiceSchema>(
  options: DaebusClientOptions<T>
) {
  const client = useDaebusClient(options);
  const connection = useConnection(client);
  const broadcast = useBroadcast(client);

  const createActionHook = useCallback(
    <A extends ServiceActions<T>>(action: A) => useAction(client, action),
    [client]
  );

  const createChannelHook = useCallback(
    <C extends ServiceChannels<T>>(channel: C, hookOptions?: { autoSubscribe?: boolean; reconnectOnError?: boolean }) =>
      useChannel(client, channel, hookOptions),
    [client]
  );

  const createHttpHook = useCallback(
    <R extends ServiceRoutes<T>>(route: R) => useHttpRequest(client, route),
    [client]
  );

  const createFetchHook = useCallback(
    <R extends ServiceRoutes<T>>(route: R, hookOptions?: {
      params?: RouteParams<T, R>;
      headers?: Record<string, string>;
      timeout?: number;
      enabled?: boolean;
      refetchOnMount?: boolean;
    }) => useFetch(client, route, hookOptions),
    [client]
  );

  return {
    client,
    connection,
    broadcast,
    useAction: createActionHook,
    useChannel: createChannelHook,
    useHttp: createHttpHook,
    useFetch: createFetchHook,
  };
} 