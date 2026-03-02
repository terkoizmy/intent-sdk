/**
 * Protocol Registry — Phase I
 *
 * Central registry for looking up available protocol integrations.
 * Used by the Rebalancer to find the best available bridge for a given route.
 */

import { BaseProtocol, type ProtocolType } from "./base-protocol";

export class ProtocolRegistry {
    private protocols: Map<string, BaseProtocol> = new Map();

    /**
     * Register a new protocol instance.
     */
    register(protocol: BaseProtocol): void {
        this.protocols.set(protocol.name, protocol);
    }

    /**
     * Get a protocol by its unique name.
     */
    get(name: string): BaseProtocol | undefined {
        return this.protocols.get(name);
    }

    /**
     * Get all registered protocols, optionally filtered by type.
     */
    getAll(type?: ProtocolType): BaseProtocol[] {
        const all = Array.from(this.protocols.values());
        if (type) {
            return all.filter((p) => p.type === type);
        }
        return all;
    }

    /**
     * Find the first bridge protocol that supports both the source and target chains.
     * Uses registration order as implicit priority.
     */
    getBestBridge(fromChain: number, toChain: number): BaseProtocol | undefined {
        const bridges = this.getAll("bridge");
        return bridges.find((b) => b.supports(fromChain) && b.supports(toChain));
    }
}
