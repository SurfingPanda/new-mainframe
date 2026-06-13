import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

let io = null;

/**
 * Attach Socket.IO to the HTTP server. Called once from index.js.
 * Authenticates connections via the same httpOnly cookie used by REST.
 */
export function initSocket(httpServer, corsOpts) {
  io = new Server(httpServer, {
    cors: corsOpts,
    // The auth cookie is httpOnly, so clients can't read it in JS. Socket.IO
    // sends cookies automatically with the handshake request when
    // `withCredentials: true` on the client — the same mechanism the REST API
    // already uses. We parse the cookie server-side below.
    allowEIO3: false
  });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie || '';
      const token = parseCookie(raw, 'mf_token');
      if (!token) return next(new Error('authentication required'));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const [[user]] = await pool.query(
        'SELECT id, name, email, role, department, token_version FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [payload.sub]
      );
      if (!user) return next(new Error('user not found'));
      if (typeof payload.tv === 'number' && payload.tv !== user.token_version) {
        return next(new Error('session expired'));
      }

      // Attach user info so event handlers can reference it.
      socket.userId = user.id;
      socket.userName = user.name;
      socket.userRole = user.role;
      socket.userDepartment = user.department;
      next();
    } catch {
      next(new Error('authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    // Join a personal room so we can target events to specific users.
    socket.join(`user:${socket.userId}`);

    // --- Chat room join/leave ---
    socket.on('chat:join', (room) => {
      if (typeof room === 'string' && room.length < 80) {
        socket.join(`chat:${room}`);
      }
    });

    socket.on('chat:leave', (room) => {
      if (typeof room === 'string') {
        socket.leave(`chat:${room}`);
      }
    });

    // --- Typing indicator (replaces POST /api/chat/typing for connected clients) ---
    socket.on('chat:typing', (room) => {
      if (typeof room === 'string' && room.length < 80) {
        socket.to(`chat:${room}`).emit('chat:typing', {
          room,
          userId: socket.userId,
          name: socket.userName
        });
      }
    });

    socket.on('disconnect', () => {
      // Cleanup is automatic — Socket.IO removes from all rooms.
    });
  });

  return io;
}

/** Get the Socket.IO server instance. Returns null before init. */
export function getIO() {
  return io;
}

// ---- Emit helpers (called from route handlers) ---- //

/**
 * New chat message. Broadcast to everyone in the chat room.
 * @param {string} room - The room key (e.g. 'general', 'dm:1:2', 'g:5')
 * @param {object} message - The full message object (same shape the REST API returns)
 */
export function emitChatMessage(room, message) {
  if (!io) return;
  io.to(`chat:${room}`).emit('chat:message', message);
}

/**
 * Message unsent. Broadcast to everyone in the chat room.
 */
export function emitChatUnsend(room, messageId) {
  if (!io) return;
  io.to(`chat:${room}`).emit('chat:unsend', { room, messageId });
}

/**
 * Chat unread counts changed for a specific user.
 * The client will refetch from the REST endpoint.
 */
export function emitUnreadUpdate(userId) {
  if (!io) return;
  io.to(`user:${userId}`).emit('chat:unread');
}

/**
 * Notification bell update for a specific user.
 * The client will refetch from the REST endpoint.
 */
export function emitNotification(userId) {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification');
}

/**
 * Ticket changed — notify relevant users so they can refetch.
 * @param {number[]} userIds - Users who should be notified
 */
export function emitTicketUpdate(userIds) {
  if (!io) return;
  for (const uid of userIds) {
    io.to(`user:${uid}`).emit('notification');
  }
}

// Minimal cookie parser (no dependency needed).
function parseCookie(raw, name) {
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
