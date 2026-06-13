import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { isAuthenticated } from './auth.js';

const SocketContext = createContext(null);

/**
 * Provides a shared Socket.IO connection to the component tree.
 * Connects when the user is authenticated, disconnects on logout.
 */
export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated()) return;

    const s = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000
    });

    s.on('connect', () => {
      // console.log('[socket] connected', s.id);
    });

    s.on('connect_error', () => {
      // Silently retry — the httpOnly cookie may be expired; REST calls
      // will 401 and trigger logout independently.
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Returns the Socket.IO client instance (or null if not connected).
 */
export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Subscribe to a Socket.IO event. The handler is stable across re-renders
 * (uses a ref internally). Cleans up on unmount or event name change.
 */
export function useSocketEvent(event, handler) {
  const socket = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket || !event) return;
    const fn = (...args) => handlerRef.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}
