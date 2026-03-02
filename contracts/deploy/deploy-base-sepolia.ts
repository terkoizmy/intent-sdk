import { ethers, upgrades } from "hardhat";

async function main() {
    console.log("Deploying IntentSettlement to Base Sepolia...");

    const IntentSettlement = await ethers.getContractFactory("IntentSettlement");

    // Deploy UUPS Proxy
    const intentSettlement = await upgrades.deployProxy(IntentSettlement, [await (await ethers.getSigners())[0].getAddress()], {
        initializer: "initialize",
        kind: "uups"
    });

    await intentSettlement.waitForDeployment();

    const proxyAddress = await intentSettlement.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("IntentSettlement Proxy deployed to:", proxyAddress);
    console.log("IntentSettlement Implementation deployed to:", implAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
