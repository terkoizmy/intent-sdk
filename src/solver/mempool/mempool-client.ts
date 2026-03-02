/**
 * Mempool Client — Phase G
 *
 * WebSocket transport layer for connecting to the Intent Mempool server.
 * Emits typed events when intents arrive or are solved by other solvers.
 *
 * Events:
 *   "connected"      — WebSocket opened successfully
 *   "disconnected"   — WebSocket closed (code, reason)
 *   "new_intent"     — New SolverIntent broadcast from mempool
 *   "intent_solved"  — Another solver claimed an intent first
 *   "error"          — Transport-level error
 *
 * Design: Custom lightweight EventEmitter. No external dependencies.
 * WebSocket is injected (or auto-created) so tests can mock it cleanly.
 *
 * Used by: MempoolMonitor
 */

import type { SolverIntent } from "../types/intent";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Events emitted by MempoolClient */
export type MempoolEvent =
    | "connected"
    | "disconnected"
    | "new_intent"
    | "intent_solved"
    | "error";

/** Payload for "intent_solved" event */
export interface IntentSolvedPayload {
    intentId: string;
    solver: string;
}

/** Payload for "disconnected" event */
export interface DisconnectedPayload {
    code: number;
    reason: string;
}

/** Union of all event payloads */
export type MempoolEventPayload =
    | SolverIntent            // new_intent
    | IntentSolvedPayload     // intent_solved
    | DisconnectedPayload     // disconnected
    | Error                   // error
    | undefined;              // connected

/** Callback shape for each event */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventCallback = (payload: any) => void;

/** Minimal interface for WebSocket — mocked in tests */
export interface IWebSocket {
    send(data: string): void;
    close(): void;
    onopen?: (() => void) | null;
    onclose?: ((event: { code: number; reason: string }) => void) | null;
    onmessage?: ((event: { data: string }) => void) | null;
    onerror?: ((event: { message?: string }) => void) | null;
}

/** Factory for creating WebSocket instances */
export type WebSocketFactory = (url: string) => IWebSocket;

// ─────────────────────────────────────────────
// MempoolClient
// ─────────────────────────────────────────────

export class MempoolClient {
    private ws: IWebSocket | null = null;
    private listeners: Map<MempoolEvent, Set<EventCallback>> = new Map();
    private connected = false;
    private wsFactory: WebSocketFactory;

    constructor(wsFactory?: WebSocketFactory) {
        // Default factory uses global WebSocket (Node.js 22+ / browser)
        this.wsFactory = wsFactory ?? ((url: string) => new WebSocket(url) as unknown as IWebSocket);
    }

    // ─────────────────────────────────────────
    // Connection
    // ─────────────────────────────────────────

    /**
     * Connect to the mempool WebSocket server.
     *
     * Immediately attaches message handlers. Emits "connected"
     * when the socket opens, or "error" if it fails.
     *
     * @param url - WebSocket URL (e.g. "ws://mempool.example.com/ws")
     */
    connect(url: string): void {
        if (this.ws) {
            this.disconnect();
        }

        this.ws = this.wsFactory(url);

        this.ws.onopen = () => {
            this.connected = true;
            this.emit("connected", undefined);
        };

        this.ws.onclose = (event) => {
            this.connected = false;
            this.emit("disconnected", { code: event.code, reason: event.reason });
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as { type: string; payload: unknown };
                this.handleMessage(msg);
            } catch {
                this.emit("error", new Error(`Failed to parse mempool message: ${event.data}`));
            }
        };

        this.ws.onerror = (event) => {
            this.emit("error", new Error(event.message ?? "WebSocket error"));
        };
    }

    /**
     * Gracefully close the WebSocket connection.
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /** Whether the client is currently connected */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Send a solution to the mempool server.
     *
     * Payload format: { type: "submit_solution", intentId, txHash, solver, profit }
     */
    submitSolution(intentId: string, txHash?: string, solverAddress?: string, profit?: string): void {
        if (!this.ws || !this.connected) {
            console.warn("[MempoolClient] Cannot submit: not connected");
            return;
        }

        const message = JSON.stringify({
            type: "submit_solution",
            payload: { intentId, txHash, solver: solverAddress, profit },
        });

        this.ws.send(message);
    }

    // ─────────────────────────────────────────
    // Event Emitter
    // ─────────────────────────────────────────

    /**
     * Register a listener for a mempool event.
     *
     * @param event - Event name
     * @param cb    - Callback to invoke with the event payload
     */
    on(event: MempoolEvent, cb: EventCallback): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(cb);
    }

    /**
     * Unregister a previously registered listener.
     *
     * @param event - Event name
     * @param cb    - The exact callback reference to remove
     */
    off(event: MempoolEvent, cb: EventCallback): void {
        this.listeners.get(event)?.delete(cb);
    }

    /**
     * Remove ALL listeners for all events.
     * Called during disconnect / cleanup.
     */
    removeAllListeners(): void {
        this.listeners.clear();
    }

    // ─────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────

    /** Dispatch incoming server message to the right event */
    private handleMessage(msg: { type: string; payload: unknown }): void {
        switch (msg.type) {
            case "new_intent":
                this.emit("new_intent", msg.payload as SolverIntent);
                break;
            case "intent_solved":
                this.emit("intent_solved", msg.payload as IntentSolvedPayload);
                break;
            default:
                // Unknown message type — ignore silently
                break;
        }
    }

    /** Emit an event to all registered listeners */
    private emit(event: MempoolEvent, payload: MempoolEventPayload): void {
        const callbacks = this.listeners.get(event);
        if (!callbacks) return;

        for (const cb of callbacks) {
            try {
                cb(payload);
            } catch (err) {
                console.error(`[MempoolClient] Error in "${event}" listener:`, err);
            }
        }
    }
}
