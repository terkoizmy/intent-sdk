/**
 * ERC-20 Utilities
 *
 * Lightweight pure functions for encoding ERC-20 contract calls
 * without requiring full ethers.js/viem contract instances.
 */

import type { Address } from "../../types/common";

export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb"; // keccak256("transfer(address,uint256)").slice(0, 10)
export const ERC20_BALANCEOF_SELECTOR = "0x70a08231"; // keccak256("balanceOf(address)").slice(0, 10)

/**
 * Encode an ERC-20 `transfer(address to, uint256 amount)` contract call.
 *
 * @param to - Recipient address
 * @param amount - Amount in basic units (wei)
 * @returns Hex data string for the transaction
 */
export function encodeTransferData(to: string, amount: bigint): `0x${string}` {
    const paddedTo = to.toLowerCase().replace("0x", "").padStart(64, "0");
    const paddedAmount = amount.toString(16).padStart(64, "0");
    return `${ERC20_TRANSFER_SELECTOR}${paddedTo}${paddedAmount}` as `0x${string}`;
}

/**
 * Encode an ERC-20 `balanceOf(address account)` contract call.
 *
 * @param account - Address to check balance for
 * @returns Hex data string for the eth_call
 */
export function encodeBalanceOfData(account: string): `0x${string}` {
    const paddedAccount = account.toLowerCase().replace("0x", "").padStart(64, "0");
    return `${ERC20_BALANCEOF_SELECTOR}${paddedAccount}` as `0x${string}`;
}
