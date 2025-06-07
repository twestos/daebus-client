# @daebus/client

A high-quality, type-safe TypeScript React client for [Daebus](https://github.com/your-username/daebus) services. This library provides seamless integration with Daebus background services through both HTTP and WebSocket protocols, with full TypeScript support and React hooks for easy frontend integration.

## Features

- 🎯 **Type-Safe**: Full TypeScript support with schema-based type generation
- 🔌 **Dual Protocol**: HTTP REST API and WebSocket real-time communication
- ⚛️ **React Ready**: Built-in React hooks for easy integration
- 🔄 **Auto Reconnection**: Automatic WebSocket reconnection with exponential backoff
- 📡 **Real-time**: Subscribe to broadcast channels for live updates
- 🛡️ **Error Handling**: Comprehensive error handling with custom error types
- 🎛️ **Configurable**: Flexible configuration options for different environments
- 📋 **Schema Validation**: Built-in Zod schema validation for runtime type safety

## Installation

```bash
npm install @daebus/client
# or
yarn add @daebus/client
# or
pnpm add @daebus/client
```

### Peer Dependencies

This package requires React as a peer dependency:

```bash
npm install react react-dom
```

## Quick Start

### 1. Define Your Service Schema

```typescript
import { z } from 'zod';
import { defineSchema, action, channel, httpRoute, CommonSchemas } from '@daebus/client';

const MyServiceSchema = defineSchema({
  actions: {
    get_status: action(
      z.object({ detail_level: z.enum(['basic', 'full']) }),
      CommonSchemas.serviceStatus
    ),
    restart: action(
      z.object({ mode: z.enum(['graceful', 'force']) }),
      z.object({ success: z.boolean(), message: z.string() })
    ),
  },
  channels: {
    notifications: channel(CommonSchemas.notification),
    system_status: channel(CommonSchemas.serviceStatus),
  },
  routes: {
    '/status': httpRoute({
      method: 'GET',
      output: CommonSchemas.serviceStatus,
    }),
    '/devices': httpRoute({
      method: 'GET',
      output: z.array(CommonSchemas.deviceInfo),
    }),
  },
});
```

### 2. Basic Usage (Vanilla TypeScript)

```typescript
import { DaebusClient } from '@daebus/client';

const client = new DaebusClient({
  serviceName: 'my-service',
  httpBaseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8081',
  schema: MyServiceSchema,
});

// HTTP requests
const statusResponse = await client.get('/status');
console.log('Service status:', statusResponse.data);

// WebSocket actions
const restartResult = await client.sendAction('restart', {
  mode: 'graceful'
});

// Subscribe to real-time updates
await client.subscribe('notifications', (notification) => {
  console.log('New notification:', notification);
});
```

### 3. React Component with Hooks

```tsx
import React from 'react';
import { useDaebus } from '@daebus/client';

function ServiceDashboard() {
  const {
    client,
    connection,
    useAction,
    useChannel,
    useFetch,
  } = useDaebus({
    serviceName: 'my-service',
    httpBaseUrl: 'http://localhost:8080',
    wsUrl: 'ws://localhost:8081',
    schema: MyServiceSchema,
  });

  // Fetch data on mount
  const [status, statusState, refetchStatus] = useFetch('/status');

  // Action hook for restart
  const [restart, restartState] = useAction('restart');

  // Subscribe to notifications
  const [notification, notificationState] = useChannel('notifications');

  const handleRestart = async () => {
    try {
      await restart({ mode: 'graceful' });
      // Refetch status after restart
      setTimeout(() => refetchStatus(), 5000);
    } catch (error) {
      console.error('Restart failed:', error);
    }
  };

  return (
    <div>
      <h1>Service Dashboard</h1>
      
      {/* Connection Status */}
      <div>
        Status: {connection.connected ? '✅ Connected' : '❌ Disconnected'}
      </div>

      {/* Service Status */}
      {statusState.loading ? (
        <p>Loading...</p>
      ) : status ? (
        <div>
          <p>Service Status: {status.status}</p>
          <p>Uptime: {status.uptime}s</p>
          <button onClick={refetchStatus}>Refresh</button>
        </div>
      ) : null}

      {/* Actions */}
      <button 
        onClick={handleRestart}
        disabled={restartState.loading}
      >
        {restartState.loading ? 'Restarting...' : 'Restart Service'}
      </button>

      {/* Real-time Notifications */}
      {notification && (
        <div>
          <h3>Latest Notification</h3>
          <p>{notification.title}: {notification.message}</p>
        </div>
      )}
    </div>
  );
}
```

## API Reference

### DaebusClient

The main client class that provides both HTTP and WebSocket functionality.

#### Constructor Options

```typescript
interface DaebusClientOptions<T extends ServiceSchema> {
  serviceName: string;           // Name of the target service
  httpBaseUrl?: string;          // Base URL for HTTP requests
  wsUrl?: string;                // WebSocket server URL
  timeout?: number;              // Default timeout (30000ms)
  retryAttempts?: number;        // Retry attempts (3)
  retryDelay?: number;           // Retry delay (1000ms)
  headers?: Record<string, string>; // Default HTTP headers
  autoConnect?: boolean;         // Auto-connect WebSocket (true)
  schema?: T;                    // Service schema for type safety
}
```

#### HTTP Methods

```typescript
// GET request
const response = await client.get('/status');

// POST request
const response = await client.post('/control', {
  action: 'reboot',
  params: { delay: 5 }
});

// Request with parameters
const response = await client.get('/devices/<device_id>', {
  params: { device_id: 'device-123' }
});
```

#### WebSocket Methods

```typescript
// Send action
const result = await client.sendAction('restart', { mode: 'graceful' });

// Subscribe to channel
await client.subscribe('notifications', (data) => {
  console.log('Notification:', data);
});

// Broadcast message
client.broadcast('device_events', {
  device_id: 'sensor-1',
  event_type: 'connected',
  timestamp: Date.now(),
});

// Check connection
const isConnected = client.isConnected();

// Manual connection management
await client.connect();
client.disconnect();
```

### React Hooks

#### useDaebus

Main hook that provides a configured client and helper hooks.

```typescript
const {
  client,
  connection,
  broadcast,
  useAction,
  useChannel,
  useHttp,
  useFetch,
} = useDaebus({
  serviceName: 'my-service',
  httpBaseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8081',
  schema: MyServiceSchema,
});
```

#### useAction

Hook for sending WebSocket actions with loading state.

```typescript
const [sendAction, state] = useAction('restart');

await sendAction({ mode: 'graceful' });
console.log(state.loading, state.error, state.data);
```

#### useChannel

Hook for subscribing to real-time channels.

```typescript
const [latestData, state] = useChannel('notifications', {
  autoSubscribe: true,
  reconnectOnError: true,
});
```

#### useFetch

Hook for HTTP requests with automatic fetching.

```typescript
const [data, state, refetch] = useFetch('/status', {
  refetchOnMount: true,
  enabled: true,
});
```

#### useConnection

Hook for monitoring WebSocket connection state.

```typescript
const connection = useConnection(client);
console.log(connection.connected, connection.connecting, connection.error);
```

### Schema Helpers

#### defineSchema

Type-safe schema definition helper.

```typescript
const schema = defineSchema({
  actions: { /* ... */ },
  channels: { /* ... */ },
  routes: { /* ... */ },
});
```

#### Helper Functions

```typescript
// Action definition
const myAction = action(inputSchema, outputSchema);

// Channel definition
const myChannel = channel(dataSchema);

// HTTP route definition
const myRoute = httpRoute({
  method: 'POST',
  input: inputSchema,
  output: outputSchema,
  params: { id: z.string() },
});
```

#### Common Schemas

Pre-built schemas for common use cases:

```typescript
import { CommonSchemas } from '@daebus/client';

CommonSchemas.serviceStatus    // Service health status
CommonSchemas.deviceInfo      // Device information
CommonSchemas.notification    // User notifications
CommonSchemas.errorResponse   // Error responses
CommonSchemas.paginationQuery // Pagination parameters
// ... and more
```

### Error Handling

The library provides custom error types for different scenarios:

```typescript
import { DaebusError, DaebusTimeoutError, DaebusConnectionError } from '@daebus/client';

try {
  await client.sendAction('restart', { mode: 'graceful' });
} catch (error) {
  if (error instanceof DaebusTimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof DaebusConnectionError) {
    console.log('Connection failed');
  } else if (error instanceof DaebusError) {
    console.log('Daebus error:', error.message, error.code, error.details);
  }
}
```

## Configuration Examples

### Development Environment

```typescript
const client = new DaebusClient({
  serviceName: 'my-service',
  httpBaseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8081',
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000,
});
```

### Production Environment

```typescript
const client = new DaebusClient({
  serviceName: 'my-service',
  httpBaseUrl: 'https://api.myapp.com',
  wsUrl: 'wss://ws.myapp.com',
  timeout: 30000,
  retryAttempts: 5,
  retryDelay: 2000,
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'X-API-Version': 'v1',
  },
});
```

### Multiple Services

```typescript
const mainClient = new DaebusClient({
  serviceName: 'main-service',
  httpBaseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8081',
});

// Create client for different service with same config
const deviceClient = mainClient.forService('device-service');
```

## Advanced Usage

### Custom WebSocket Protocols

```typescript
const client = new DaebusClient({
  serviceName: 'my-service',
  wsUrl: 'ws://localhost:8081',
  // Custom WebSocket sub-protocols
  protocols: ['daebus-v1', 'custom-protocol'],
});
```

### Connection Management

```typescript
// Wait for connection with timeout
await client.waitForConnection(5000);

// Ensure connection before operations
await client.ensureConnection();

// Manual reconnection
if (!client.isConnected()) {
  await client.connect();
}
```

### Schema Validation

```typescript
import { validateSchema, safeValidateSchema } from '@daebus/client';

// Validate data (throws on error)
const validated = validateSchema(mySchema, data);

// Safe validation (returns result object)
const result = safeValidateSchema(mySchema, data);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## Best Practices

1. **Define schemas early**: Create comprehensive schemas for type safety
2. **Use hooks in components**: Leverage React hooks for state management
3. **Handle errors gracefully**: Always wrap async operations in try-catch
4. **Monitor connection state**: Display connection status to users
5. **Implement retry logic**: Use built-in retry mechanisms for reliability
6. **Validate data**: Use schema validation for runtime type safety
7. **Clean up subscriptions**: React hooks handle cleanup automatically

## TypeScript Support

This library is built with TypeScript and provides full type safety:

- ✅ Automatic type inference from schemas
- ✅ Compile-time type checking for requests/responses
- ✅ IntelliSense support in editors
- ✅ Generic types for custom schemas
- ✅ Strict null checks supported

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/your-username/daebus-ts)
- 🐛 [Issue Tracker](https://github.com/your-username/daebus-ts/issues)
- 💬 [Discussions](https://github.com/your-username/daebus-ts/discussions) 