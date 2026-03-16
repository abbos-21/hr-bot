import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { JwtPayload, WsMessage } from "./types";

interface AuthenticatedSocket extends WebSocket {
  adminId?: string;
  userType?: "admin" | "organization";
  botId?: string;
  isAlive: boolean;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<AuthenticatedSocket> = new Set();

  initialize(server: import("http").Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on(
      "connection",
      (ws: AuthenticatedSocket, req: IncomingMessage) => {
        ws.isAlive = true;

        // Authenticate via token in query string
        const url = new URL(req.url || "", "http://localhost");
        const token = url.searchParams.get("token");

        if (!token) {
          ws.close(1008, "Unauthorized");
          return;
        }

        try {
          const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
          ws.adminId = payload.adminId;
          ws.userType = payload.type;
          ws.botId = payload.botId;
        } catch {
          ws.close(1008, "Invalid token");
          return;
        }

        this.clients.add(ws);
        console.log(`WS client connected: ${ws.adminId}`);

        ws.on("pong", () => {
          ws.isAlive = true;
        });

        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString()) as WsMessage;
            if (msg.type === "PING") {
              ws.send(JSON.stringify({ type: "PONG" }));
            }
          } catch {
            // ignore
          }
        });

        ws.on("close", () => {
          this.clients.delete(ws);
          console.log(`WS client disconnected: ${ws.adminId}`);
        });

        ws.on("error", () => {
          this.clients.delete(ws);
        });
      },
    );

    // Heartbeat
    const interval = setInterval(() => {
      this.clients.forEach((ws) => {
        if (!ws.isAlive) {
          ws.terminate();
          this.clients.delete(ws);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on("close", () => clearInterval(interval));
  }

  /**
   * Broadcast to all clients. If botId is provided, org users only receive
   * messages for their own bot; admins always receive everything.
   */
  broadcast(message: WsMessage, botId?: string): void {
    const data = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Admins get everything; org users only get their bot's events
      if (botId && ws.userType === "organization" && ws.botId !== botId) return;
      ws.send(data);
    });
  }

  sendToAdmin(adminId: string, message: WsMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.adminId === adminId && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

export const wsManager = new WebSocketManager();
