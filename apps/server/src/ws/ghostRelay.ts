import type { WebSocket } from 'ws';
import type { GhostMessage } from '@echo-drift/shared';

interface ClientConnection {
  ws: WebSocket;
  seed: string;
  userId?: string;
  displayName?: string;
}

class GhostRelayHub {
  private rooms: Map<string, Set<ClientConnection>> = new Map();

  public register(ws: WebSocket, seed: string) {
    const conn: ClientConnection = { ws, seed };
    if (!this.rooms.has(seed)) {
      this.rooms.set(seed, new Set());
    }
    const room = this.rooms.get(seed)!;
    room.add(conn);

    ws.on('message', (raw) => {
      try {
        const msg: GhostMessage = JSON.parse(raw.toString());
        if (msg.userId) conn.userId = msg.userId;
        if (msg.displayName) conn.displayName = msg.displayName;

        // Relay position frame / ghost stream to all other clients in the same seed room
        this.broadcast(seed, conn, msg);
      } catch (err) {
        // ignore malformed packets
      }
    });

    ws.on('close', () => {
      room.delete(conn);
      if (room.size === 0) {
        this.rooms.delete(seed);
      }
    });
  }

  private broadcast(seed: string, sender: ClientConnection, msg: GhostMessage) {
    const room = this.rooms.get(seed);
    if (!room) return;

    const payload = JSON.stringify(msg);
    for (const client of room) {
      if (client !== sender && client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(payload);
      }
    }
  }
}

export const ghostHub = new GhostRelayHub();
