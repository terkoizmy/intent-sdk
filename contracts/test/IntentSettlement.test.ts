import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { IntentSettlement, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("IntentSettlement", function () {
    let intentSettlement: IntentSettlement;
    let mockToken: MockERC20;
    let owner: SignerWithAddress;
    let solver: SignerWithAddress;
    let swapper: SignerWithAddress;

    const CHAIN_ID = 31337; // Hardhat default

    beforeEach(async function () {
        [owner, solver, swapper] = await ethers.getSigners();

        // Deploy Mock Token
        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        mockToken = (await MockERC20Factory.deploy("USDC", "USDC")) as unknown as MockERC20;
        await mockToken.waitForDeployment();

        // Mint tokens to swapper
        await mockToken.mint(swapper.address, ethers.parseUnits("1000", 6));

        // Deploy IntentSettlement
        const IntentSettlementFactory = await ethers.getContractFactory("IntentSettlement");
        intentSettlement = (await upgrades.deployProxy(IntentSettlementFactory, [owner.address], {
            initializer: "initialize",
        })) as unknown as IntentSettlement;
        await intentSettlement.waitForDeployment();
    });

    describe("open (lockFunds)", function () {
        it("Should lock funds with valid signature", async function () {
            const amount = ethers.parseUnits("100", 6);

            // Approve contract
            await mockToken.connect(swapper).approve(await intentSettlement.getAddress(), amount);

            const orderData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [await mockToken.getAddress(), amount]
            );

            const order = {
                settlementContract: await intentSettlement.getAddress(),
                swapper: swapper.address,
                nonce: 1n,
                originChainId: CHAIN_ID,
                initiateDeadline: Math.floor(Date.now() / 1000) + 3600,
                fillDeadline: Math.floor(Date.now() / 1000) + 7200,
                orderData: orderData
            };

            // Create EIP-712 Signature
            const domain = {
                name: "IntentSettlement",
                version: "1",
                chainId: CHAIN_ID,
                verifyingContract: await intentSettlement.getAddress()
            };

            const types = {
                CrossChainOrder: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" }
                ]
            };

            const signature = await swapper.signTypedData(domain, types, order);

            // Execute open
            await expect(intentSettlement.open(order, signature, orderData))
                .to.emit(intentSettlement, "FundsLocked")
                .withArgs(
                    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
                        ["tuple(address,address,uint256,uint32,uint32,uint32,bytes)"],
                        [[order.settlementContract, order.swapper, order.nonce, order.originChainId, order.initiateDeadline, order.fillDeadline, order.orderData]]
                    )),
                    swapper.address,
                    await mockToken.getAddress(),
                    amount
                );

            // Verify balance
            expect(await mockToken.balanceOf(await intentSettlement.getAddress())).to.equal(amount);
        });

        it("Should revert with invalid signature", async function () {
            const amount = ethers.parseUnits("100", 6);
            const orderData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [await mockToken.getAddress(), amount]
            );

            const order = {
                settlementContract: await intentSettlement.getAddress(),
                swapper: swapper.address,
                nonce: 1n,
                originChainId: CHAIN_ID,
                initiateDeadline: Math.floor(Date.now() / 1000) + 3600,
                fillDeadline: Math.floor(Date.now() / 1000) + 7200,
                orderData: orderData
            };

            // Wrong signer (solver signs instead of swapper)
            const domain = {
                name: "IntentSettlement",
                version: "1",
                chainId: CHAIN_ID,
                verifyingContract: await intentSettlement.getAddress()
            };

            const types = {
                CrossChainOrder: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" }
                ]
            };

            const signature = await solver.signTypedData(domain, types, order);

            await expect(intentSettlement.open(order, signature, orderData))
                .to.be.revertedWith("Invalid signature");
        });
    });

    describe("claim (Settlement)", function () {
        let order: any;
        let orderData: string;
        let signature: string;
        let intentId: string;
        const amount = ethers.parseUnits("100", 6);

        beforeEach(async function () {
            // Open order first
            await mockToken.connect(swapper).approve(await intentSettlement.getAddress(), amount);

            orderData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [await mockToken.getAddress(), amount]
            );

            order = {
                settlementContract: await intentSettlement.getAddress(),
                swapper: swapper.address,
                nonce: 1n,
                originChainId: CHAIN_ID,
                initiateDeadline: Math.floor(Date.now() / 1000) + 3600,
                fillDeadline: Math.floor(Date.now() / 1000) + 7200,
                orderData: orderData
            };

            const domain = {
                name: "IntentSettlement",
                version: "1",
                chainId: CHAIN_ID,
                verifyingContract: await intentSettlement.getAddress()
            };

            const types = {
                CrossChainOrder: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" }
                ]
            };

            signature = await swapper.signTypedData(domain, types, order);
            await intentSettlement.open(order, signature, orderData);

            // Calc intentId
            intentId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(address,address,uint256,uint32,uint32,uint32,bytes)"],
                [[order.settlementContract, order.swapper, order.nonce, order.originChainId, order.initiateDeadline, order.fillDeadline, order.orderData]]
            ));
        });

        it("Should claim funds with valid oracle signature", async function () {
            // Mock Oracle Signature
            // digest = keccak256(intentId, "FILLED", solver)
            const digest = ethers.keccak256(ethers.solidityPacked(["bytes32", "string", "address"], [intentId, "FILLED", solver.address]));
            const oracleSignature = await owner.signMessage(ethers.getBytes(digest));

            // Execute Claim
            await expect(intentSettlement.connect(solver).claim(order, oracleSignature))
                .to.emit(intentSettlement, "FundsClaimed")
                .withArgs(intentId, solver.address, amount);

            // Check Balance
            expect(await mockToken.balanceOf(solver.address)).to.equal(amount);
            expect(await intentSettlement.isIntentSettled(intentId)).to.be.true;
        });

        it("Should revert double claim", async function () {
            const digest = ethers.keccak256(ethers.solidityPacked(["bytes32", "string", "address"], [intentId, "FILLED", solver.address]));
            const oracleSignature = await owner.signMessage(ethers.getBytes(digest));

            await intentSettlement.connect(solver).claim(order, oracleSignature);

            await expect(intentSettlement.connect(solver).claim(order, oracleSignature))
                .to.be.revertedWith("Intent already settled");
        });
    });

    describe("refund", function () {
        let order: any;
        let amount = ethers.parseUnits("100", 6);
        let orderData: string;

        beforeEach(async function () {
            await mockToken.connect(swapper).approve(await intentSettlement.getAddress(), amount);
            orderData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await mockToken.getAddress(), amount]);

            order = {
                settlementContract: await intentSettlement.getAddress(),
                swapper: swapper.address,
                nonce: 2n, // Different nonce
                originChainId: CHAIN_ID,
                initiateDeadline: await time.latest() + 3600,
                fillDeadline: await time.latest() + 3600,
                orderData: orderData
            };

            const domain = { name: "IntentSettlement", version: "1", chainId: CHAIN_ID, verifyingContract: await intentSettlement.getAddress() };
            const types = { CrossChainOrder: [{ name: "settlementContract", type: "address" }, { name: "swapper", type: "address" }, { name: "nonce", type: "uint256" }, { name: "originChainId", type: "uint32" }, { name: "initiateDeadline", type: "uint32" }, { name: "fillDeadline", type: "uint32" }, { name: "orderData", type: "bytes" }] };
            const signature = await swapper.signTypedData(domain, types, order);
            await intentSettlement.open(order, signature, orderData);
        });

        it("Should revert refund before deadline", async function () {
            await expect(intentSettlement.refund(order))
                .to.be.revertedWith("Refund not ready yet");
        });

        it("Should refund after deadline", async function () {
            await time.increase(3601);

            const preBalance = await mockToken.balanceOf(swapper.address);

            await expect(intentSettlement.refund(order))
                .to.emit(intentSettlement, "FundsRefunded");

            const postBalance = await mockToken.balanceOf(swapper.address);
            expect(postBalance).to.equal(preBalance + amount);
        });
    });
});
