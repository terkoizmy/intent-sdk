/**
 * Tests — Phase I: Protocols for Rebalancing
 *
 * Unit tests covering ProtocolRegistry, SwingProtocol (via HTTP mocking)
 * and AaveProtocol (lending logic).
 */

import { describe, test, expect, mock } from "bun:test";
import { ProtocolRegistry } from "../../src/solver/protocols/protocol-registry";
import { BaseProtocol, type ProtocolType, type ProtocolQuote, type QuoteParams } from "../../src/solver/protocols/base-protocol";
import { SwingProtocol, type IHttpClient } from "../../src/solver/protocols/aggregators/swing";
import { AaveProtocol } from "../../src/solver/protocols/lending/aave";
import type { RPCProviderManager } from "../../src/shared/rpc/provider-manager";

// Dummy Protocol for testing registry
class DummyBridge extends BaseProtocol {
    readonly name = "dummy-bridge";
    readonly type: ProtocolType = "bridge";
    readonly supportedChains = [1, 2];
    async quote() { return {} as ProtocolQuote; }
    async buildTransaction() { return []; }
}
class AnotherBridge extends BaseProtocol {
    readonly name = "another-bridge";
    readonly type: ProtocolType = "bridge";
    readonly supportedChains = [1, 3];
    async quote() { return {} as ProtocolQuote; }
    async buildTransaction() { return []; }
}

describe("ProtocolRegistry", () => {
    test("register() and get() by name", () => {
        const reg = new ProtocolRegistry();
        const p1 = new DummyBridge();
        reg.register(p1);
        expect(reg.get("dummy-bridge")).toBe(p1);
        expect(reg.get("missing")).toBeUndefined();
    });

    test("getAll() filters by type", () => {
        const reg = new ProtocolRegistry();
        reg.register(new DummyBridge());

        // Mock a lending protocol
        const lender = new DummyBridge();
        (lender as any).type = "lending";
        (lender as any).name = "dummy-lender";
        reg.register(lender);

        expect(reg.getAll().length).toBe(2);
        expect(reg.getAll("bridge").length).toBe(1);
        expect(reg.getAll("lending").length).toBe(1);
    });

    test("getBestBridge() returns protocol supporting both chains", () => {
        const reg = new ProtocolRegistry();
        reg.register(new DummyBridge());     // supports 1, 2
        reg.register(new AnotherBridge());   // supports 1, 3

        const b1 = reg.getBestBridge(1, 2);
        expect(b1?.name).toBe("dummy-bridge");

        const b2 = reg.getBestBridge(1, 3);
        expect(b2?.name).toBe("another-bridge");

        const b3 = reg.getBestBridge(2, 3); // None support both
        expect(b3).toBeUndefined();
    });
});

describe("SwingProtocol", () => {
    const mockQuoteParams: QuoteParams = {
        fromChain: 1,
        toChain: 137,
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        amount: 1000n,
        recipient: "0x123",
    };

    test("quote() correctly parses API response", async () => {
        const mockHttp: IHttpClient = {
            get: mock(async () => ({
                routes: [{
                    quote: {
                        integration: {
                            amountOut: "990",
                            fee: "10",
                            estimatedTime: 120, // seconds
                            priceImpact: 5,
                        }
                    }
                }]
            })),
            post: mock(async () => ({})),
        };

        const swing = new SwingProtocol("test-key", mockHttp);
        const quote = await swing.quote(mockQuoteParams);

        expect(quote.outputAmount).toBe(990n);
        expect(quote.fee).toBe(10n);
        expect(quote.estimatedTimeMs).toBe(120000);
        expect(quote.priceImpact).toBe(5);
        expect(quote.protocolName).toBe("swing");
    });

    test("buildTransaction() maps raw API response to Transaction[]", async () => {
        const mockHttp: IHttpClient = {
            get: mock(async () => ({})),
            post: mock(async () => ({
                tx: {
                    to: "0xbridge",
                    data: "0xabcdef",
                    value: "0",
                    gas: "100000"
                }
            })),
        };

        const swing = new SwingProtocol("test-key", mockHttp);
        const txs = await swing.buildTransaction({ protocolName: "swing" } as ProtocolQuote, mockQuoteParams);

        expect(txs.length).toBe(1);
        expect(txs[0].to).toBe("0xbridge");
        expect(txs[0].data).toBe("0xabcdef");
        expect(txs[0].chainId).toBe(1);
        expect(txs[0].gasLimit).toBe("100000");
    });

    test("getTransferStatus() normalizes strings", async () => {
        const mockHttp: IHttpClient = {
            get: mock(async () => ({ status: "Success" })),
            post: mock(async () => ({})),
        };
        const swing = new SwingProtocol("test", mockHttp);

        expect(await swing.getTransferStatus("1")).toBe("done");

        (mockHttp.get as ReturnType<typeof mock>).mockImplementationOnce(async () => ({ status: "Failed" }));
        expect(await swing.getTransferStatus("2")).toBe("failed");

        (mockHttp.get as ReturnType<typeof mock>).mockImplementationOnce(async () => ({ status: "InProgress" }));
        expect(await swing.getTransferStatus("3")).toBe("pending");
    });

    test("quote() throws when API returns empty routes", async () => {
        const mockHttp: IHttpClient = {
            get: mock(async () => ({ routes: [] })),
            post: mock(async () => ({})),
        };

        const swing = new SwingProtocol("test-key", mockHttp);
        expect(swing.quote(mockQuoteParams)).rejects.toThrow("No bridge routes found");
    });
});

describe("AaveProtocol", () => {
    const mockRpc = {} as RPCProviderManager;
    const poolConfig = { 1: "0xpool1" as any, 137: "0xpool137" as any };

    test("quote() returns 1:1 ratio with 0 fee", async () => {
        const aave = new AaveProtocol(mockRpc, poolConfig);
        const quote = await aave.quote({ fromChain: 1, toChain: 1, token: "0xabc", amount: 100n });

        expect(quote.inputAmount).toBe(100n);
        expect(quote.outputAmount).toBe(100n);
        expect(quote.fee).toBe(0n);
    });

    test("buildTransaction() creates exactly two transactions (approve + supply)", async () => {
        const aave = new AaveProtocol(mockRpc, poolConfig);
        const txs = await aave.buildTransaction({} as ProtocolQuote, {
            fromChain: 137,
            toChain: 137,
            token: "0xusdc",
            amount: 500n,
            recipient: "0xuser"
        });

        expect(txs.length).toBe(2);

        // Approve tx
        expect(txs[0].to).toBe("0xusdc");
        expect(txs[0].data.startsWith("0x095ea7b3")).toBe(true);
        expect(txs[0].chainId).toBe(137);

        // Supply tx
        expect(txs[1].to).toBe("0xpool137");
        expect(txs[1].data.startsWith("0x617ba037")).toBe(true);
        expect(txs[1].chainId).toBe(137);
    });

    test("buildWithdraw() creates a single interaction with the pool", async () => {
        const aave = new AaveProtocol(mockRpc, poolConfig);
        const tx = await aave.buildWithdraw("0xusdc", 500n, 137, "0xuser");

        expect(tx.to).toBe("0xpool137");
        expect(tx.data.startsWith("0x69328dec")).toBe(true);
        expect(tx.chainId).toBe(137);
    });
});
