# Dokumentasi Alur E2E Testnet Bridge (Unichain Sepolia → Base Sepolia)

File ini mendokumentasikan skenario pengujian komprehensif *End-to-End* (E2E) pada file `tests/e2e/testnet-bridge.test.ts`. Pengujian ini menyimulasikan siklus hidup penuh (full lifecycle) dari sebuah transaksi intent lintas-jaringan (cross-chain) antara dua testnet EVM menggunakan infrastruktur nyata (RPC, Wallet, Smart Contracts).

---

## ⚙️ Prerequisites

### Environment Variables

Semua test (kecuali [T1]) membutuhkan env vars berikut. Buat file `.env` di root project:

```bash
# RPC Endpoints (T1 hanya butuh ini)
UNICHAIN_SEPOLIA_RPC_URL=https://...
BASE_SEPOLIA_RPC_URL=https://...

# Smart Contract Addresses (deploy dulu via deploy script)
SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA=0x...
SETTLEMENT_CONTRACT_BASE_SEPOLIA=0x...

# Private Keys (format: tanpa 0x prefix)
SOLVER_PRIVATE_KEY=abc123...
TESTING_USER_PRIVATE_KEY=def456...
```

> **Catatan:** Test T2–T6 di-skip otomatis jika salah satu env var di atas tidak tersedia (`test.skipIf(!HAS_ALL)`). Hanya T1 yang bisa berjalan dengan `HAS_RPC` saja.

### Testnet USDC Faucet
- **Unichain Sepolia USDC:** `0x31d0220469e10c4E71834a79b1f276d740d3768F`
- **Base Sepolia USDC:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

Gunakan faucet Circle atau Chainlink untuk mendapatkan testnet USDC.

### Cara Menjalankan
```bash
bun test tests/e2e/testnet-bridge.test.ts
```

---

## 🌍 Skenario Pengujian

- **Source Chain (Tempat User/Swapper):** Unichain Sepolia (Chain ID: `1301`)
- **Target Chain (Tempat Tujuan):** Base Sepolia (Chain ID: `84532`)
- **Token:** USDC (Decimals: `6`)
- **Intent Text:** *"Bridge 1 USDC from Unichain Sepolia to Base Sepolia"*
- **Amount:** `1 USDC` = `1,000,000` (dalam satuan terkecil USDC, 6 desimal)

---

## 🗺️ Diagram Alur Dana

```
[Swapper]                [Smart Contract]              [Solver]
   │                      (Unichain)                      │
   │──── T5: open() ─────────────────────────────────────►│
   │       Lock 1 USDC → Contract                         │
   │                          │                           │
   │                          │◄──── T4+T5: claim() ──────│
   │                          │      Contract kirim 1+1   │
   │                          │      USDC ke Solver       │
   │                          │                           │
   │◄──── T4: fill() ─────────────────────────────────────│
         Solver kirim 0.988 USDC                          │
         ke Swapper di Base Sepolia                       │

Aliran dana (net):
  Swapper: -1 USDC (Unichain) + 0.988 USDC (Base) → bayar ~0.012 USDC fee
  Solver:  +2 USDC (Unichain) - 0.988 USDC (Base) → untung ~1.012 USDC (reimburse T4 + fee T5)
```

---

## 🚀 Fase / Siklus Hidup Intent

Pengujian dibagi menjadi tahap Setup dan 6 tahap (*Test Blocks*) utama yang dieksekusi secara berurutan:

### [T0] Setup & SDK Initialization (Pre-flight)

Sebelum `[T1]` dijalankan, file test melakukan konfigurasi environment di dalam blok `beforeAll`. Proses ini mencakup:

1. **Pembuatan Klien RPC & Wallet:** Membangun instans `publicClient` dan `walletClient` dari `viem` untuk Solver dan Swapper di kedua jaringan (Unichain & Base).

2. **Setup Token & Chain Registry:**
   - Mendaftarkan rantai khusus (`unichainConfig`, `baseConfig`) ke dalam `chainRegistry` — menggunakan guard `has()` untuk menghindari error *double-register* (constructor `IntentSolver` sudah mendaftarkan mainnet chains secara otomatis).
   - Mengisi `tokenRegistry` dengan daftar alamat Token Testnet (seperti *mock* USDC) agar dikenali di kedua rantai.

3. **Instansiasi IntentSolver:** Menghidupkan entitas utama `IntentSolver` dalam mode **`live`**.
   - **Parameter Harga (Pricing):** Diatur agar kompetitif di testnet (biaya penanganan minimum diturunkan menjadi $0.10, dan Solver hanya akan mengambil 10% keuntungan margin slippage).
   ```typescript
   solver = new IntentSolver({
       agent: {
           privateKey: `0x${SOLVER_PRIVATE_KEY!}`,
           supportedChains: [1301, 84532],
           supportedTokens: ["USDC"],
           mode: "live", // Menginstruksikan solver langsung broadcast tx
       },
       contractAddress: CONTRACT_ADDRESS as Address,
       pricing: {
           minFeeUSD: 0.10,
           baseFeePercent: 0.001,
           slippageSharePercent: 0.10,
           maxFeePercent: 0.01,
       },
   });
   ```

4. **Bootstrapping RPC Provider Manager & Wallet Manager:** Memasangkan *RPC Factory* khusus milik SDK dan *Viem Signer Factory* agar `LiquidityAgent` (yang ada di dalam tubuh Solver) berhak mem-broadcast transaksi sungguhan *on-chain*.
   ```typescript
   const viemSignerFactory = createViemSignerFactory(rpcMapper);
   solver.walletManager.setSignerFactory(viemSignerFactory);
   ```

5. **Load Inventory Balance:** Solver secara proaktif mengecek cadangan USDC-nya pada Smart Contract USDC di jaringan target, merekam saldo tersebut dalam memori `InventoryManager`. Ini krusial agar solver tidak menolak permintaan dari Swapper akibat "Dana Target Tidak Cukup".
   ```typescript
   await solver.initialize();
   await solver.agent.inventoryManager.loadBalances();
   ```

---

### [T1] Connectivity / Sanity Check

- **Guard:** `HAS_RPC` (hanya butuh `UNICHAIN_SEPOLIA_RPC_URL` dan `BASE_SEPOLIA_RPC_URL`)
- **Tujuan:** Memastikan koneksi RPC berjalan.
- **Aksi:** Menghubungkan SDK ke jaringan publik `Unichain Sepolia` dan mengambil nomor blok terbaru (block number).
- **Validasi:** SDK berhasil mendapatkan `blockNumber > 0n`.

---

### [T2] Intent Parsing & Token Enrichment

- **Guard:** `HAS_ALL`
- **Tujuan:** Menguji pemahaman AI / Parser terhadap kalimat bahasa alami dan menerjemahkannya ke entitas *on-chain* yang valid.
- **Aksi:**
  1. `IntentParser` membaca teks kalimat dan menghasilkan ekstraksi data (token, jumlah, jaringan asal, jaringan tujuan).
     ```typescript
     const rawIntent = await parser.parse("Bridge 1 USDC from Unichain Sepolia to Base Sepolia");
     // rawIntent.data = { intentType: "bridge", parameters: { inputAmount: "1", inputToken: "USDC" } }
     ```
  2. Fungsi `enrichIntent` di SDK mengubah simbol "USDC" menjadi format *smart contract address* (`0x...`) di jaringan Base dan Unichain.
     ```typescript
     enrichedIntent = enrichIntent(intentData, solver.tokenRegistry, 1301, 84532);
     // Menyuntikkan tokenAddress ke dalam intent parameters
     ```
- **Validasi:** Target token sukses dikenali sebagai `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Alamat *mock* USDC di Base Sepolia).

---

### [T3] Preflight (Initial Balances Snapshot)

- **Guard:** `HAS_ALL`
- **Tujuan:** Merekam saldo USDC awal milik **Swapper (User)** dan **Solver** di kedua jaringan (Unichain dan Base). Snapshot ini digunakan sebagai *baseline* untuk validasi di [T6].
- **Aksi:** Memanggil fungsi `balanceOf` ke Smart Contract USDC di masing-masing chain.
- **Validasi:** Memastikan Solver punya cukup USDC di **Base Sepolia** untuk menalangi *(fill)* permintaan *bridge* Swapper. Jika saldo kurang, test gagal di sini sebelum ada dana yang bergerak.
- **Kalkulasi `transferAmountRaw`:**
  ```typescript
  // inputAmount dari parser = "1" (1 USDC dalam unit desimal)
  const parsedAmount = BigInt(enrichedIntent.parameters.inputAmount); // → 1n
  transferAmountRaw = parsedAmount * BigInt(10 ** USDC_DECIMALS);     // → 1_000_000n
  ```

---

### [T4] Solve Intent & Optimistic Fill

- **Guard:** `HAS_ALL` — Timeout: **60 detik**
- **Tujuan:** Mengetes mekanisme Kalkulasi Biaya (*Dynamic Pricing*) Solver dan eksekusi pembayaran pendahuluan ke akun tujuan.
- **Aksi:**
  1. SDK mengkalkulasi tarif `baseFee`, `gasCost`, dan `slippageCapture` dari amount 1 USDC.
  2. Saldo bersih yang diterima Swapper = `1,000,000 - 12,000 = 988,000` (0.988 USDC).
  3. **[On-Chain — Base Sepolia]** Solver langsung mengirim `988,000` unit USDC ke dompet Swapper di **Base Sepolia**.
  4. **[Auto-Settlement — Unichain Sepolia]** `SettlementManager` secara otomatis:
     - Menghitung `onChainIntentId = keccak256(abi.encode(order))`
     - Membuat oracle signature dengan format yang sama persis dengan yang divalidasi kontrak
     - Memanggil `claim()` di kontrak Unichain → **Solver menerima `1,000,000` USDC di Unichain** sebagai reimbursement
     > ⚠️ Ini berarti pada akhir T4, saldo Solver di Unichain sudah bertambah 1 USDC. Hal ini penting untuk memahami delta di [T6].

- **Validasi:** `solveResult.success === true` dan terdapat `txHash` pencairan di jaringan Base.

---

### [T5] On-chain Settlement (Open & Claim)

- **Guard:** `HAS_ALL` — Timeout: **60 detik**
- **Tujuan:** Menguji alur pencatatan pesanan di kontrak pintar (*Smart Contract*) dan pencairan dana talangan secara eksplisit. Ini adalah jantung keamanan arsitektur intent — membuktikan seluruh lifecycle open→claim bisa berjalan mandiri.
- **Aksi:** Semua operasi di tahap ini berjalan di **Unichain Sepolia** (Source Chain):
  1. Swapper menyetujui (`approve`) Kontrak Settlement untuk menarik `1 USDC` miliknya.
  2. Swapper membangun format *EIP-712 CrossChainOrder* dan menandatanganinya dengan dompet mereka.
  3. **[On-Chain — Unichain]** Swapper memanggil fungsi `open()` → memindahkan `1,000,000` USDC dari dompet Swapper ke dalam kontrak.
  4. Solver membuat bukti oracle (`oracleSignature`) yang menyatakan intent sudah di-fill di Base Sepolia.
     - Digest dihitung dengan `abi.encodePacked` (bukan `abi.encode`) agar sesuai dengan format yang diverifikasi kontrak:
     ```typescript
     // Di sisi kontrak Solidity:
     // bytes32 digest = keccak256(abi.encodePacked(intentId, "FILLED", msg.sender));
     // bytes32 signedHash = MessageHashUtils.toEthSignedMessageHash(digest);
     
     // Di sisi SDK (harus identik):
     const oracleDigest = keccak256(encodePacked(
         ["bytes32", "string", "address"],
         [globalIntentId, "FILLED", solverAddress],
     ));
     const oracleSignature = await solverAccount.signMessage({ message: { raw: toBytes(oracleDigest) } });
     ```
  5. **[On-Chain — Unichain]** Solver memanggil `settlementManager.settleOnChain()`. Kontrak memvalidasi signature oracle, lalu mengirim `1,000,000` USDC yang terkunci kepada Solver.
     ```typescript
     const claimResult = await settlementManager.settleOnChain({
         intentId: globalIntentId,
         swapper: order.swapper,
         token: USDC_UNICHAIN_SEPOLIA,
         amount: transferAmountRaw,
         // ... parameter lainnya
     }, oracleSignature);
     ```
- **Validasi:** Transaksi `claim()` sukses dan terkonfirmasi di rantai Unichain.

---

### [T6] Verification Final

- **Guard:** `HAS_ALL`
- **Tujuan:** Mengaudit hasil mutasi matematis uang lintas-jaringan secara menyeluruh (mencakup semua perubahan dari T4 **dan** T5).
- **Aksi:** SDK menanyakan saldo baru ke `balanceOf` untuk keempat data poin: Swapper(Unichain), Swapper(Base), Solver(Unichain), dan Solver(Base).
- **Validasi (4 assertion):**
  1. **Swapper Base** = `initial + 988,000` — menerima fill dari T4.
  2. **Swapper Unichain** = `initial - 1,000,000` — membayar ke kontrak via T5 `open()`.
  3. **Solver Unichain** = `initial + 2 × 1,000,000` — claim 2x: satu dari T4 SettlementManager, satu dari T5 eksplisit.
  4. **Solver Base** = `initial - 988,000` — biaya fill ke Swapper di T4.
  5. `isSettled(globalIntentId) === true` — kontrak mengonfirmasi intent sudah selesai.

---

## 📈 Tabulasi Saldo (Berdasarkan Hasil Run Aktual)

Berikut pergerakan dana nyata dari hasil `bun test` yang telah dijalankan (amount **1 USDC**):

| Akun                   | Saldo Awal (T3) | Event                                            | Delta        | Saldo Akhir (T6) |
|------------------------|-----------------|--------------------------------------------------|--------------|------------------|
| **Swapper (Unichain)** | `57.000005` USDC | T5: `open()` — 1 USDC dikunci ke kontrak         | **-1 USDC**  | `56.000005` USDC  |
| **Swapper (Base)**     | `21.649500` USDC | T4: Terima fill dari Solver                     | **+0.988 USDC** | `22.637500` USDC |
| **Solver (Unichain)**  | `21.999995` USDC | T4: claim() auto + T5: claim() eksplisit (2×1)  | **+2 USDC**  | `23.999995` USDC  |
| **Solver (Base)**      | `38.350500` USDC | T4: Kirim fill ke Swapper                       | **-0.988 USDC** | `37.362500` USDC |

**Analisis keuangan:**
- *Swapper* membayar `1 USDC` (di Unichain) dan menerima `0.988 USDC` (di Base) → **net cost: 0.012 USDC fee** ✅
- *Solver* (dari T5 saja) mengeluarkan `0.988 USDC` (di Base) dan menerima `1 USDC` (di Unichain) → **profit: ~0.012 USDC** (setelah gas) ✅

> **Kenapa Solver Unichain naik `+2 USDC`?** Karena ada **dua** `claim()` yang terjadi:
> - **T4 SettlementManager** otomatis claim setelah fill berhasil → `+1 USDC`
> - **T5 eksplisit** (dari `open()` Swapper yang baru) → `+1 USDC`

---

## 🔗 Rangkuman Arsitektur

Tes ini membuktikan mekanisme desentralisasi yang *trustless*:

1. **Swapper** menyerahkan dananya ke *smart contract* (bukan langsung ke pihak ketiga).
2. **Solver** memakai modal *(inventory)* pribadinya di rantai tujuan dengan jaminan *(optimistic guarantee)* pencairan di rantai asal.
3. **Oracle Signature** — Solver menandatangani bukti fill dengan format `keccak256(abi.encodePacked(intentId, "FILLED", solverAddress))` yang diverifikasi langsung oleh kontrak Solidity. Ini memastikan hanya Solver yang bersangkutan (sesuai `msg.sender`) yang bisa mencairkan dana.
4. Kedua belah pihak dimediasi secara asinkron dengan aransemen yang terisolasi tetapi aman.
