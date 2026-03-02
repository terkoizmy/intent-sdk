import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy IntentSettlement to Unichain Sepolia
 *
 * Phase E: Contract Deployment & Live Settlement
 *
 * Run via:
 *   UNICHAIN_SEPOLIA_RPC_URL=<url> PRIVATE_KEY=<key> \
 *   npx hardhat run contracts/deploy/deploy-unichain-sepolia.ts --network unichainSepolia
 *
 * After successful deployment, the contract address is saved to:
 *   deployed-addresses.json (project root)
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying IntentSettlement to Unichain Sepolia...");
    console.log("Deployer address:", await deployer.getAddress());

    const deployerBalance = await ethers.provider.getBalance(await deployer.getAddress());
    console.log("Deployer ETH balance:", ethers.formatEther(deployerBalance), "ETH");

    const IntentSettlement = await ethers.getContractFactory("IntentSettlement");

    // Deploy UUPS Proxy with deployer as initial owner / oracle
    const intentSettlement = await upgrades.deployProxy(
        IntentSettlement,
        [await deployer.getAddress()],
        { initializer: "initialize", kind: "uups" }
    );

    await intentSettlement.waitForDeployment();

    const proxyAddress = await intentSettlement.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n✅ Deployment complete!");
    console.log("   Proxy address:         ", proxyAddress);
    console.log("   Implementation address:", implAddress);

    // ── Persist addresses to JSON for use by the SDK & settlement tests ──
    const outPath = path.resolve(__dirname, "../../deployed-addresses.json");
    let existing: Record<string, any> = {};
    if (fs.existsSync(outPath)) {
        existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    }
    existing["unichainSepolia"] = {
        proxy: proxyAddress,
        implementation: implAddress,
        deployedAt: new Date().toISOString(),
        chainId: 1301,
    };
    fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
    console.log("\n📄 Addresses saved to deployed-addresses.json");
    console.log(`\nNext steps:
  1. Add SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA=${proxyAddress} to your .env
  2. Fund the contract or solver wallet with testnet ETH
  3. Run: bun test tests/live/settlement-onchain.test.ts`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
