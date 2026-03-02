// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC7683.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title IntentSettlement
/// @notice Main settlement contract for the Intent Parser SDK
/// @dev Implements ERC-7683 and UUPS Upgradeable pattern
contract IntentSettlement is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    EIP712Upgradeable,
    IERC7683
{
    using SafeERC20 for IERC20;

    // --- Events ---
    event FundsLocked(
        bytes32 indexed intentId,
        address indexed swapper,
        address token,
        uint256 amount
    );
    event FundsClaimed(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 amount
    );
    event FundsRefunded(
        bytes32 indexed intentId,
        address indexed swapper,
        uint256 amount
    );

    // --- State ---
    mapping(bytes32 => bool) public isIntentSettled;
    address public oracle; // Verifies cross-chain fills (MVP: Notary model)

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __EIP712_init("IntentSettlement", "1");
        oracle = initialOwner; // Default oracle is deployer for MVP
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // --- ERC-7683 Implementation (Skeleton) ---

    function open(
        CrossChainOrder calldata order,
        bytes calldata signature,
        bytes calldata /* orderData */
    ) external override {
        // 1. Validate Order
        bytes32 intentId = keccak256(abi.encode(order));

        if (isIntentSettled[intentId]) revert("Intent already settled");
        if (block.timestamp > order.initiateDeadline)
            revert("Intent init deadline expired");

        // 2. Validate Signature (ERC-1271 or EOA)
        _verifySignature(order, signature);

        // 3. Lock Funds (Pull from Swapper)
        // Decode orderData from the SIGNED order, not the external param
        (address inputToken, uint256 inputAmount) = abi.decode(
            order.orderData,
            (address, uint256)
        );

        // Transfer user -> contract
        IERC20(inputToken).safeTransferFrom(
            order.swapper,
            address(this),
            inputAmount
        );

        emit FundsLocked(intentId, order.swapper, inputToken, inputAmount);
    }

    function resolve(
        CrossChainOrder calldata order,
        bytes calldata orderData
    ) external pure override returns (ResolvedCrossChainOrder memory) {
        // Basic resolution logic
        // For production, this would parse orderData to specific inputs/outputs
        (address inputToken, uint256 inputAmount) = abi.decode(
            orderData,
            (address, uint256)
        );

        Input[] memory inputs = new Input[](1);
        inputs[0] = Input({token: inputToken, amount: inputAmount});

        Output[] memory outputs = new Output[](0); // Filler outputs

        return
            ResolvedCrossChainOrder({
                settlementContract: order.settlementContract,
                swapper: order.swapper,
                nonce: order.nonce,
                originChainId: order.originChainId,
                initiateDeadline: order.initiateDeadline,
                fillDeadline: order.fillDeadline,
                swapperInputs: inputs,
                swapperOutputs: outputs,
                fillerOutputs: outputs
            });
    }

    // --- Internal Helpers ---

    function _verifySignature(
        CrossChainOrder calldata order,
        bytes calldata signature
    ) internal view {
        bytes32 STRUCT_HASH = keccak256(
            "CrossChainOrder(address settlementContract,address swapper,uint256 nonce,uint32 originChainId,uint32 initiateDeadline,uint32 fillDeadline,bytes orderData)"
        );

        bytes32 structHash = keccak256(
            abi.encode(
                STRUCT_HASH,
                order.settlementContract,
                order.swapper,
                order.nonce,
                order.originChainId,
                order.initiateDeadline,
                order.fillDeadline,
                keccak256(order.orderData)
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        if (
            !SignatureChecker.isValidSignatureNow(
                order.swapper,
                digest,
                signature
            )
        ) {
            revert("Invalid signature");
        }
    }

    // --- Claim & Refund Logic ---
    // (Legacy lockFunds() removed — use open())

    /// @notice Claim funds after fulfilling the intent on destination chain
    /// @param order The original order
    /// @param signature Signature from Oracle verifying the fill
    function claim(
        CrossChainOrder calldata order,
        bytes calldata signature
    ) external {
        bytes32 intentId = keccak256(abi.encode(order));
        if (isIntentSettled[intentId]) revert("Intent already settled");

        // 1. Verify Oracle Signature
        // Digest = hash(intentId, "FILLED", msg.sender) -> Proves solver is the intended recipient
        bytes32 digest = keccak256(
            abi.encodePacked(intentId, "FILLED", msg.sender)
        );
        bytes32 signedHash = MessageHashUtils.toEthSignedMessageHash(digest);

        if (
            !SignatureChecker.isValidSignatureNow(oracle, signedHash, signature)
        ) {
            revert("Invalid oracle signature");
        }

        // 2. Settle
        isIntentSettled[intentId] = true;

        (address inputToken, uint256 inputAmount) = abi.decode(
            order.orderData,
            (address, uint256)
        );

        IERC20(inputToken).safeTransfer(msg.sender, inputAmount);

        emit FundsClaimed(intentId, msg.sender, inputAmount);
    }

    /// @notice Refund swapper if order expired and not filled
    function refund(CrossChainOrder calldata order) external {
        bytes32 intentId = keccak256(abi.encode(order));
        if (isIntentSettled[intentId]) revert("Intent already settled");
        if (block.timestamp <= order.fillDeadline)
            revert("Refund not ready yet");

        isIntentSettled[intentId] = true;

        (address inputToken, uint256 inputAmount) = abi.decode(
            order.orderData,
            (address, uint256)
        );

        IERC20(inputToken).safeTransfer(order.swapper, inputAmount);

        emit FundsRefunded(intentId, order.swapper, inputAmount);
    }
}
