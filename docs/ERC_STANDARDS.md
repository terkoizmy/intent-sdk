# ERC Standards Research & Implementation Guide

Dokumen ini menjelaskan standar Ethereum Request for Comment (ERC) yang akan digunakan dalam implementasi **Intent Parser SDK** (Phase D & J).

---

## 1. ERC-7683: Cross-Chain Intents (Draft)

**Status:** Draft / Emerging Standard (Across Protocol & Uniswap Labs)
**Tujuan:** Standarisasi struktur order untuk transaksi lintas chain agar interoperable antar filling network.

### Mengapa Kita Pakai?
Tanpa standar ini, setiap bridge/solver punya format intent sendiri. Dengan ERC-7683, intent yang kita generate bisa (secara teori) diselesaikan oleh solver network lain (seperti UniswapX atau Across ecosystem), membuka likuiditas global.

### Komponen Utama:
- **`CrossChainOrder` Struct:** Format data baku yang berisi:
  - `settlementContract`: Address contract settlement tujuan.
  - `swapper`: User pengirim.
  - `nonce`: Anti-replay.
  - `originChainId` & `initiateDeadline`.
  - `orderData`: Data spesifik implementasi.
- **`ISettlementContract`**: Interface yang harus diimplementasikan oleh contract kita (`IntentSettlement.sol`).

---

## 2. ERC-712: Scalable Typed Data Signing

**Status:** Final
**Tujuan:** Menampilkan data terstruktur yang readable di wallet user saat signing, bukan hex string `0x...` yang membingungkan.

### Mengapa Kita Pakai?
Keamanan dan UX. User harus tahu persis apa yang mereka sign ("Saya setuju swap 100 USDC ke MATIC di Polygon"). ERC-712 mencegah serangan phishing di mana user tidak sengaja menandatangani transaksi berbahaya.

### Mekanisme:
1. **Domain Separator:** Mencegah **Replay Attack** antar chain atau antar dApps (misal: tanda tangan untuk Testnet tidak valid di Mainnet).
2. **Struct Hashing:** Data di-hash per field (seperti `amount`, `token`, `destination`) lalu digabung menjadi satu digest final.

---

## 3. ERC-1271: Standard Signature Validation

**Status:** Final
**Tujuan:** Memungkinkan Smart Contract (seperti Gnosis Safe, Argent) untuk melakukan "tanda tangan" yang bisa diverifikasi.

### Mengapa Kita Pakai?
Solver kita mungkin dijalankan oleh **DAO** atau institusi yang menggunakan Multisig Wallet (Safe), bukan Private Key tunggal. ERC-1271 memungkinkan contract `IntentSettlement` kita memverifikasi apakah sebuah intent valid disetujui oleh Smart Wallet tersebut.

### Mekanisme:
Contract Wallet harus mengimplementasikan fungsi:
```solidity
function isValidSignature(bytes32 _hash, bytes memory _signature) public view returns (bytes4);
```
Jika valid, return magic value `0x1626ba7e`.

---

## 4. ERC-2612: Permit (Gasless Approvals)

**Status:** Final
**Tujuan:** Mengizinkan user memberikan approval token (ERC-20) menggunakan signature off-chain, tanpa perlu kirim transaksi on-chain (`approve()`) yang bayar gas.

### Mengapa Kita Pakai?
Untuk pengalaman **"Gasless Bridge"**. User cukup sign pesan Permit, lalu Solver yang akan submit transaksi tersebut ke blockchain sekaligus mengambil token dan mengirimkannya ke tujuan. User tidak perlu punya ETH untuk gas awal.

**Note:** Untuk USDC, kita juga akan support varian **ERC-3009 (Transfer With Authorization)** yang digunakan di versi lama USDC mainnet.

---

## 5. ERC-1967: Proxy Storage Slots

**Status:** Final
**Tujuan:** Standar penyimpanan variable untuk Smart Contract yang bisa di-upgrade (Upgradeable Proxy), mencegah tabrakan data (storage collision) antara Proxy dan Implementation.

### Mengapa Kita Pakai?
Logic settlement kita (`IntentSettlement.sol`) mungkin perlu di-update di masa depan (fix bug, optimasi gas). Kita akan menggunakan pola **UUPS (Universal Upgradeable Proxy Standard)** yang berbasis ERC-1967 agar contract bisa di-upgrade tanpa user perlu memindahkan dana atau ganti address.

---

## 6. ERC-8004: Trustless Agents (Identity & Reputation)

**Status:** Draft (Baru, 2025/2026)
**Tujuan:** Registry on-chain khusus untuk AI Agent untuk membangun identitas, reputasi, dan verifikasi kerja.

### Mengapa Kita Pakai?
Untuk **Phase J (Monetization & Registry)**.
- **Identity:** Mendaftarkan Solver kita sebagai "Legal/Verified Agent" di blockchain.
- **Reputation:** Mencatat history kesuksesan (Successful Fills vs Failures) secara transparan.
- **Validation:** Mekanisme untuk memverifikasi bahwa Solver bekerja dengan benar (e.g. via TEE atau ZK Proofs).

Standar ini memungkinkan Solver kita untuk "dipercaya" oleh user asing tanpa perlu kenal siapa operatornya (Trustless).
