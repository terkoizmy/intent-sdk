import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            evmVersion: "cancun",
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        unichainSepolia: {
            url: process.env.UNICHAIN_SEPOLIA_RPC_URL || "",
            accounts: (process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY] as string[] : []
        },
        baseSepolia: {
            url: process.env.BASE_SEPOLIA_RPC_URL || "",
            accounts: (process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY] as string[] : []
        }
    },
    etherscan: {
        apiKey: {
            baseSepolia: process.env.BASESCAN_API_KEY || "",
            unichainSepolia: "empty" // blockscout doesn't require an api key
        },
        customChains: [
            {
                network: "unichainSepolia",
                chainId: 1301,
                urls: {
                    apiURL: "https://unichain-sepolia.blockscout.com/api",
                    browserURL: "https://unichain-sepolia.blockscout.com"
                }
            }
        ]
    },
    paths: {
        sources: "./src",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};

export default config;
