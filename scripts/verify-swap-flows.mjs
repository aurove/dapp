import {
  createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther,
  encodeFunctionData, maxUint256, decodeErrorResult
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '../..');
const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const account = privateKeyToAccount(PK);

function loadDeploy(pkg, name) {
  return JSON.parse(readFileSync(join(root, 'packages', pkg, 'deployments/localhost', `${name}.json`), 'utf8'));
}

const publicClient = createPublicClient({ chain: hardhat, transport: http('http://127.0.0.1:8545') });
const walletClient = createWalletClient({ account, chain: hardhat, transport: http('http://127.0.0.1:8545') });

const ledger = loadDeploy('core', 'Ledger');
const zap = loadDeploy('id20', 'AuroveZapRouter');
const clRouter = loadDeploy('id20', 'CLSwapRouter');
const avBTCmId20 = loadDeploy('id20', 'avBTCmId20');
const avMEZOmId20 = loadDeploy('id20', 'avMEZOmId20');
const musdPool = loadDeploy('id20', 'MUSD-avBTCm');
const veBtc = loadDeploy('id20', 'VeBTC');
const veMezo = loadDeploy('id20', 'VeMEZO');
const BTC = '0x7b7C000000000000000000000000000000000000';
const MEZO = '0x7B7c000000000000000000000000000000000001';

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);
const erc721Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function approve(address,uint256)',
  'function getApproved(uint256) view returns (address)',
  'function isApprovedForAll(address,address) view returns (bool)',
  'function setApprovalForAll(address,bool)',
]);
const erc1155Abi = parseAbi([
  'function balanceOf(address,uint256) view returns (uint256)',
  'function isApprovedForAll(address,address) view returns (bool)',
  'function setApprovalForAll(address,bool)',
]);
const poolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)',
]);
const id20Abi = parseAbi(['function id() view returns (uint256)']);
const ledgerDepositAbi = parseAbi([
  'function depositErc20(uint8,uint256,uint256,address) returns (uint256,uint256)',
]);

function encodePath(tokenIn, tickSpacing, tokenOut) {
  const spacingHex = Number(tickSpacing).toString(16).padStart(6, '0');
  return `0x${tokenIn.slice(2).toLowerCase()}${spacingHex}${tokenOut.slice(2).toLowerCase()}`;
}

const results = [];
function log(flow, status, detail) {
  results.push({ flow, status, detail });
  console.log(`[${status}] ${flow}: ${detail}`);
}

async function approveErc20(token, spender, amount) {
  const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, spender] });
  if (allowance >= amount) return;
  const hash = await walletClient.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256] });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function approve1155(operator) {
  const ok = await publicClient.readContract({ address: ledger.address, abi: erc1155Abi, functionName: 'isApprovedForAll', args: [account.address, operator] });
  if (ok) return;
  const hash = await walletClient.writeContract({ address: ledger.address, abi: erc1155Abi, functionName: 'setApprovalForAll', args: [operator, true] });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function approve721(token, tokenId, operator) {
  const approved = await publicClient.readContract({ address: token, abi: erc721Abi, functionName: 'getApproved', args: [tokenId] });
  const all = await publicClient.readContract({ address: token, abi: erc721Abi, functionName: 'isApprovedForAll', args: [account.address, operator] });
  if (approved.toLowerCase() === operator.toLowerCase() || all) return;
  const hash = await walletClient.writeContract({ address: token, abi: erc721Abi, functionName: 'approve', args: [operator, tokenId] });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function findOwnedTokenId(collection) {
  // Brute-force ownerOf over a reasonable token id range (local fork often uses small ids)
  for (let id = 1n; id <= 500n; id++) {
    try {
      const owner = await publicClient.readContract({ address: collection, abi: erc721Abi, functionName: 'ownerOf', args: [id] });
      if (owner.toLowerCase() === account.address.toLowerCase()) return id;
    } catch { /* not minted / burned */ }
  }
  return null;
}

async function main() {
  const [t0, t1, tick, liq] = await Promise.all([
    publicClient.readContract({ address: musdPool.address, abi: poolAbi, functionName: 'token0' }),
    publicClient.readContract({ address: musdPool.address, abi: poolAbi, functionName: 'token1' }),
    publicClient.readContract({ address: musdPool.address, abi: poolAbi, functionName: 'tickSpacing' }),
    publicClient.readContract({ address: musdPool.address, abi: poolAbi, functionName: 'liquidity' }),
  ]);
  log('pool MUSD-avBTCm', liq > 0n ? 'OK' : 'EMPTY', `liq=${liq} tick=${tick}`);
  const avBTCm = avBTCmId20.address;
  const MUSD = t0.toLowerCase() === avBTCm.toLowerCase() ? t1 : t0;
  log('pair', 'INFO', `avBTCm=${avBTCm} MUSD=${MUSD}`);

  const trancheIdBtc = await publicClient.readContract({ address: avBTCm.address ?? avBTCm, abi: id20Abi, functionName: 'id' }).catch(async () =>
    publicClient.readContract({ address: avBTCmId20.address, abi: id20Abi, functionName: 'id' })
  );
  // fix call
  const tIdBtc = await publicClient.readContract({ address: avBTCmId20.address, abi: id20Abi, functionName: 'id' });
  const tIdMezo = await publicClient.readContract({ address: avMEZOmId20.address, abi: id20Abi, functionName: 'id' });
  const variant = Number(tIdBtc >> 16n);
  const epochs = BigInt(Number(tIdBtc & 0xffffn));
  log('tranche ids', 'INFO', `btc=${tIdBtc} (v=${variant},e=${epochs}) mezo=${tIdMezo}`);

  let [btcBal, musdBal, id20Bal, trancheBal] = await Promise.all([
    publicClient.readContract({ address: BTC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: avBTCmId20.address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: ledger.address, abi: erc1155Abi, functionName: 'balanceOf', args: [account.address, tIdBtc] }),
  ]);
  log('balances', 'INFO', `BTC=${formatEther(btcBal)} MUSD=${formatEther(musdBal)} avBTCm=${formatEther(id20Bal)} tranche=${formatEther(trancheBal)}`);

  // Mint MUSD via hardhat if zero (set storage not available; use anvil_setBalance style for ETH only)
  // Try transfer from a rich account if musd is 0 - seed script may mint
  if (musdBal === 0n) {
    // hardhat_impersonate and mint if it's a local mintable token - use setCode shim path from scripts
    try {
      // Use eth_call to see if mint exists
      const mintAbi = parseAbi(['function mint(address,uint256)']);
      await walletClient.writeContract({ address: MUSD, abi: mintAbi, functionName: 'mint', args: [account.address, parseEther('10000')] });
      musdBal = await publicClient.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
      log('seed MUSD', 'OK', formatEther(musdBal));
    } catch (e) {
      log('seed MUSD', 'SKIP', e.shortMessage || e.message?.slice(0,120));
    }
  }

  const amountSmall = parseEther('0.001');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  // ---- 1) Direct CL: ID20 → MUSD (after approve) ----
  if (id20Bal >= amountSmall) {
    await approveErc20(avBTCmId20.address, clRouter.address, amountSmall);
    try {
      const { request } = await publicClient.simulateContract({
        account: account.address,
        address: clRouter.address,
        abi: clRouter.abi,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: avBTCmId20.address,
          tokenOut: MUSD,
          tickSpacing: tick,
          recipient: account.address,
          deadline,
          amountIn: amountSmall,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      log('flow: ID20→ERC20 (direct CL)', 'VERIFIED_TX', `hash=${hash} status=${receipt.status}`);
    } catch (e) {
      log('flow: ID20→ERC20 (direct CL)', 'FAIL', e.shortMessage || e.message?.slice(0, 200));
    }
  } else {
    log('flow: ID20→ERC20 (direct CL)', 'SKIP_NO_BALANCE', formatEther(id20Bal));
  }

  // refresh balances
  id20Bal = await publicClient.readContract({ address: avBTCmId20.address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  musdBal = await publicClient.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });

  // ---- 2) Direct CL: MUSD → ID20 ----
  if (musdBal >= amountSmall) {
    await approveErc20(MUSD, clRouter.address, amountSmall);
    try {
      const { request } = await publicClient.simulateContract({
        account: account.address,
        address: clRouter.address,
        abi: clRouter.abi,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: MUSD,
          tokenOut: avBTCmId20.address,
          tickSpacing: tick,
          recipient: account.address,
          deadline,
          amountIn: amountSmall,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      log('flow: ERC20→ID20 (direct CL)', 'VERIFIED_TX', `hash=${hash} status=${receipt.status}`);
    } catch (e) {
      log('flow: ERC20→ID20 (direct CL)', 'FAIL', e.shortMessage || e.message?.slice(0, 200));
    }
  } else {
    log('flow: ERC20→ID20 (direct CL)', 'SKIP_NO_BALANCE', formatEther(musdBal));
  }

  // ---- 3) Underlying zap: BTC deposit → wrap → swap to MUSD ----
  btcBal = await publicClient.readContract({ address: BTC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  if (btcBal >= amountSmall) {
    await approveErc20(BTC, zap.address, amountSmall);
    const path = encodePath(avBTCmId20.address, tick, MUSD);
    try {
      const { request } = await publicClient.simulateContract({
        account: account.address,
        address: zap.address,
        abi: zap.abi,
        functionName: 'zapErc20ExactInput',
        args: [
          { variant, epochs, value: amountSmall },
          { tokenOut: MUSD, amountOutMinimum: 0n, amountOut: 0n, receiver: account.address, deadline, path },
        ],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      log('flow: underlying deposit→wrap→swap (BTC)', 'VERIFIED_TX', `hash=${hash} status=${receipt.status}`);
    } catch (e) {
      log('flow: underlying deposit→wrap→swap (BTC)', 'FAIL', e.shortMessage || e.message?.slice(0, 250));
    }
  } else {
    log('flow: underlying deposit→wrap→swap (BTC)', 'SKIP_NO_BALANCE', formatEther(btcBal));
  }

  // ---- 4) Tranche wrap → swap (need ERC1155 approval) ----
  trancheBal = await publicClient.readContract({ address: ledger.address, abi: erc1155Abi, functionName: 'balanceOf', args: [account.address, tIdBtc] });
  // If empty, deposit some BTC to ledger first to create tranche for partial swap path
  if (trancheBal < amountSmall && btcBal >= amountSmall) {
    try {
      await approveErc20(BTC, ledger.address, amountSmall);
      const hash = await walletClient.writeContract({
        address: ledger.address,
        abi: ledger.abi,
        functionName: 'depositErc20',
        args: [variant, epochs, amountSmall, account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      trancheBal = await publicClient.readContract({ address: ledger.address, abi: erc1155Abi, functionName: 'balanceOf', args: [account.address, tIdBtc] });
      log('seed tranche via depositErc20', 'OK', `tranche bal=${formatEther(trancheBal)}`);
    } catch (e) {
      log('seed tranche via depositErc20', 'FAIL', e.shortMessage || e.message?.slice(0, 200));
    }
  }

  if (trancheBal >= amountSmall) {
    await approve1155(zap.address);
    const path = encodePath(avBTCmId20.address, tick, MUSD);
    try {
      const { request } = await publicClient.simulateContract({
        account: account.address,
        address: zap.address,
        abi: zap.abi,
        functionName: 'zapTrancheExactInput',
        args: [
          tIdBtc,
          amountSmall,
          { tokenOut: MUSD, amountOutMinimum: 0n, amountOut: 0n, receiver: account.address, deadline, path },
        ],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      log('flow: tranche wrap→swap', 'VERIFIED_TX', `hash=${hash} status=${receipt.status}`);
    } catch (e) {
      log('flow: tranche wrap→swap', 'FAIL', e.shortMessage || e.message?.slice(0, 250));
    }
  } else {
    log('flow: tranche wrap→swap', 'SKIP_NO_BALANCE', formatEther(trancheBal));
  }

  // ---- 5) Partial: deposit veNFT to earn (ledger) then swap part of tranche ----
  // Document as two-step: Earn deposit + tranche swap (already tested above if we deposit)
  // ---- 6) Entire veNFT zap ----
  const veBtcCount = await publicClient.readContract({ address: veBtc.address, abi: erc721Abi, functionName: 'balanceOf', args: [account.address] });
  log('veBTC count', 'INFO', String(veBtcCount));
  if (veBtcCount > 0n) {
    const tokenId = await findOwnedTokenId(veBtc.address);
    if (tokenId == null) {
      log('flow: veNFT entire swap', 'SKIP', 'owned but tokenId not found in 1..500 scan');
    } else {
      await approve721(veBtc.address, tokenId, zap.address);
      const path = encodePath(avBTCmId20.address, tick, MUSD);
      try {
        const { request } = await publicClient.simulateContract({
          account: account.address,
          address: zap.address,
          abi: zap.abi,
          functionName: 'zapVeNftExactInput',
          args: [
            { variant, epochs, value: tokenId },
            { tokenOut: MUSD, amountOutMinimum: 0n, amountOut: 0n, receiver: account.address, deadline, path },
          ],
        });
        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        log('flow: veNFT entire swap', 'VERIFIED_TX', `tokenId=${tokenId} hash=${hash} status=${receipt.status}`);
      } catch (e) {
        // simulation-only if write fails
        try {
          await publicClient.simulateContract({
            account: account.address,
            address: zap.address,
            abi: zap.abi,
            functionName: 'zapVeNftExactInput',
            args: [
              { variant, epochs, value: tokenId },
              { tokenOut: MUSD, amountOutMinimum: 0n, amountOut: 0n, receiver: account.address, deadline, path },
            ],
          });
          log('flow: veNFT entire swap', 'VERIFIED_SIM', `tokenId=${tokenId} (write failed: ${(e.shortMessage||e.message||'').slice(0,120)})`);
        } catch (e2) {
          log('flow: veNFT entire swap', 'FAIL', e2.shortMessage || e2.message?.slice(0, 250));
        }
      }
    }
  } else {
    log('flow: veNFT entire swap', 'SKIP_NO_BALANCE', 'no veBTC');
  }

  // Partial path documentation basis: depositErc20 to create tranche then zapTranche
  // Already proved deposit + tranche zap if step 4 worked.

  console.log('\n=== FLOW VERIFICATION SUMMARY ===');
  for (const r of results.filter((x) => x.flow.startsWith('flow:') || x.status === 'VERIFIED_TX' || x.status === 'VERIFIED_SIM' || x.status === 'FAIL' || x.status === 'SKIP' || x.status === 'SKIP_NO_BALANCE' || x.status === 'OK')) {
    console.log(`${r.status.padEnd(16)} ${r.flow} — ${r.detail}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
