import React, { useEffect } from 'react';
import { z } from 'zod';
import {
  DaebusClient,
  defineSchema,
  action,
  channel,
  httpRoute,
  useDaebus,
  CommonSchemas,
} from '../src';

// Define your service schema
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
    update_config: action(
      z.object({ 
        config: z.record(z.unknown()),
        validate: z.boolean().default(true)
      }),
      z.object({ applied: z.boolean(), errors: z.array(z.string()) })
    ),
  },
  channels: {
    notifications: channel(CommonSchemas.notification),
    system_status: channel(CommonSchemas.serviceStatus),
    device_events: channel(z.object({
      device_id: z.string(),
      event_type: z.enum(['connected', 'disconnected', 'error']),
      timestamp: z.number(),
      data: z.unknown().optional(),
    })),
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
    '/devices/<device_id>': httpRoute({
      method: 'GET',
      output: CommonSchemas.deviceInfo,
      params: { device_id: z.string() },
    }),
    '/control': httpRoute({
      method: 'POST',
      input: z.object({
        action: z.string(),
        params: z.record(z.unknown()),
      }),
      output: z.object({
        success: z.boolean(),
        result: z.unknown(),
      }),
    }),
  },
});

// Basic usage without React
export async function basicUsage() {
  // Create a client for your service
  const client = new DaebusClient({
    serviceName: 'my-service',
    httpBaseUrl: 'http://localhost:8080',
    wsUrl: 'ws://localhost:8081',
    timeout: 10000,
    schema: MyServiceSchema,
  });

  try {
    // HTTP requests
    const statusResponse = await client.get('/status');
    console.log('Service status:', statusResponse.data);

    const devicesResponse = await client.get('/devices');
    console.log('Devices:', devicesResponse.data);

    // Get specific device
    const deviceResponse = await client.get('/devices/<device_id>', {
      params: { device_id: 'device-123' }
    });
    console.log('Device:', deviceResponse.data);

    // POST request
    const controlResponse = await client.post('/control', {
      action: 'reboot',
      params: { delay: 5 }
    });
    console.log('Control result:', controlResponse.data);

    // WebSocket actions
    const restartResult = await client.sendAction('restart', {
      mode: 'graceful'
    });
    console.log('Restart result:', restartResult);

    // Subscribe to notifications
    await client.subscribe('notifications', (notification) => {
      console.log('Notification:', notification);
    });

    // Subscribe to system status updates
    await client.subscribe('system_status', (status) => {
      console.log('System status update:', status);
    });

    // Broadcast a message
    client.broadcast('device_events', {
      device_id: 'sensor-1',
      event_type: 'connected',
      timestamp: Date.now(),
      data: { ip: '192.168.1.100' }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.disconnect();
  }
}

// React component using hooks
export function ServiceDashboard() {
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

  // Fetch service status on mount
  const [status, statusState, refetchStatus] = useFetch('/status', {
    refetchOnMount: true,
  });

  // Fetch devices list
  const [devices, devicesState, refetchDevices] = useFetch('/devices');

  // Hook for restart action
  const [restart, restartState] = useAction('restart');

  // Hook for HTTP control requests
  const [sendControl, controlState] = useHttp('/control');

  // Subscribe to notifications
  const [latestNotification, notificationState] = useChannel(
    'notifications',
    { autoSubscribe: true }
  );

  // Subscribe to system status updates
  const [systemStatus, systemStatusState] = useChannel(
    'system_status'
  );

  // Subscribe to device events
  const [deviceEvent, deviceEventState] = useChannel(
    'device_events'
  );

  useEffect(() => {
    if (deviceEvent) {
      console.log('Device event received:', deviceEvent);
      // Refetch devices when a device connects/disconnects
      if (['connected', 'disconnected'].includes(deviceEvent.event_type)) {
        refetchDevices();
      }
    }
  }, [deviceEvent, refetchDevices]);

  const handleRestart = async () => {
    try {
      await restart({ mode: 'graceful' });
      // Refetch status after restart
      setTimeout(() => refetchStatus(), 5000);
    } catch (error) {
      console.error('Restart failed:', error);
    }
  };

  const handleControlAction = async (action: string, params: any) => {
    try {
      await sendControl({
        method: 'POST',
        data: { action, params }
      });
    } catch (error) {
      console.error('Control action failed:', error);
    }
  };

  const handleBroadcastTest = () => {
    broadcast('device_events', {
      device_id: 'test-device',
      event_type: 'connected',
      timestamp: Date.now(),
      data: { test: true }
    });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Service Dashboard</h1>
      
      {/* Connection Status */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: connection.connected ? '#d4edda' : '#f8d7da', borderRadius: '5px' }}>
        <strong>Connection: </strong>
        {connection.connected ? '✅ Connected' : '❌ Disconnected'}
        {connection.error && <div>Error: {connection.error.message}</div>}
      </div>

      {/* Service Status */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Service Status</h2>
        {statusState.loading && <p>Loading status...</p>}
        {statusState.error && <p style={{ color: 'red' }}>Error: {statusState.error.message}</p>}
        {status && (
          <div>
            <p><strong>Status:</strong> {status.status}</p>
            <p><strong>Uptime:</strong> {status.uptime}s</p>
            <p><strong>Version:</strong> {status.version || 'N/A'}</p>
            <button onClick={refetchStatus}>Refresh Status</button>
          </div>
        )}
      </div>

      {/* Devices */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Devices</h2>
        {devicesState.loading && <p>Loading devices...</p>}
        {devicesState.error && <p style={{ color: 'red' }}>Error: {devicesState.error.message}</p>}
        {devices && (
          <div>
            <p>Total devices: {devices.length}</p>
            <button onClick={refetchDevices}>Refresh Devices</button>
            <ul>
              {devices.map(device => (
                <li key={device.id}>
                  {device.name} ({device.type}) - {device.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Actions</h2>
        <button 
          onClick={handleRestart}
          disabled={restartState.loading}
          style={{ marginRight: '10px' }}
        >
          {restartState.loading ? 'Restarting...' : 'Restart Service'}
        </button>
        
        <button 
          onClick={() => handleControlAction('reboot', { delay: 10 })}
          disabled={controlState.loading}
          style={{ marginRight: '10px' }}
        >
          {controlState.loading ? 'Sending...' : 'Reboot Device'}
        </button>

        <button onClick={handleBroadcastTest}>
          Broadcast Test Event
        </button>

        {restartState.error && <p style={{ color: 'red' }}>Restart error: {restartState.error.message}</p>}
        {controlState.error && <p style={{ color: 'red' }}>Control error: {controlState.error.message}</p>}
      </div>

      {/* Real-time Data */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Real-time Updates</h2>
        
        {/* Latest notification */}
        <div style={{ marginBottom: '10px' }}>
          <h3>Latest Notification</h3>
          {notificationState.connected ? (
            latestNotification ? (
              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
                <strong>{latestNotification.type.toUpperCase()}:</strong> {latestNotification.title}
                <br />
                <small>{latestNotification.message}</small>
              </div>
            ) : (
              <p>No notifications yet</p>
            )
          ) : (
            <p>Not connected to notifications channel</p>
          )}
        </div>

        {/* System status updates */}
        <div style={{ marginBottom: '10px' }}>
          <h3>System Status Updates</h3>
          {systemStatusState.connected ? (
            systemStatus ? (
              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
                <p><strong>Status:</strong> {systemStatus.status}</p>
                <p><strong>Uptime:</strong> {systemStatus.uptime}s</p>
              </div>
            ) : (
              <p>No system status updates yet</p>
            )
          ) : (
            <p>Not connected to system status channel</p>
          )}
        </div>

        {/* Device events */}
        <div>
          <h3>Latest Device Event</h3>
          {deviceEventState.connected ? (
            deviceEvent ? (
              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
                <p><strong>Device:</strong> {deviceEvent.device_id}</p>
                <p><strong>Event:</strong> {deviceEvent.event_type}</p>
                <p><strong>Time:</strong> {new Date(deviceEvent.timestamp).toLocaleString()}</p>
              </div>
            ) : (
              <p>No device events yet</p>
            )
          ) : (
            <p>Not connected to device events channel</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Usage in your React app
export function App() {
  return (
    <div>
      <ServiceDashboard />
    </div>
  );
} 