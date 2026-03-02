// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC7683 Cross Chain Intent Standard
/// @notice Interface for standardized cross-chain orders
interface IERC7683 {
    struct CrossChainOrder {
        address settlementContract;
        address swapper;
        uint256 nonce;
        uint32 originChainId;
        uint32 initiateDeadline;
        uint32 fillDeadline;
        bytes orderData;
    }

    struct ResolvedCrossChainOrder {
        address settlementContract;
        address swapper;
        uint256 nonce;
        uint32 originChainId;
        uint32 initiateDeadline;
        uint32 fillDeadline;
        Input[] swapperInputs;
        Output[] swapperOutputs;
        Output[] fillerOutputs;
    }

    struct Input {
        address token;
        uint256 amount;
    }

    struct Output {
        address token;
        uint256 amount;
        address recipient;
        uint32 chainId;
    }

    /// @notice Open a cross-chain order
    /// @param order The order to open
    /// @param signature The swapper's signature
    /// @param orderData Additional data for the order
    function open(
        CrossChainOrder calldata order,
        bytes calldata signature,
        bytes calldata orderData
    ) external;

    /// @notice Resolve a cross-chain order into explicit inputs and outputs
    /// @param order The order to resolve
    /// @param orderData Additional data for resolution
    /// @return The resolved order
    function resolve(
        CrossChainOrder calldata order,
        bytes calldata orderData
    ) external pure returns (ResolvedCrossChainOrder memory);
}
