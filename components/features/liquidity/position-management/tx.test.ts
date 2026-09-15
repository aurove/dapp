import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFunctionData,
  encodeEventTopics,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import { getContractsByChainId } from "@/contracts/shared";
import {
  buildGaugeStakeSteps,
  buildGaugeUnstakeStep,
  buildRemoveLiquidityCalls,
  buildRepositionCalls,
  mintedPositionTokenIdFromReceipt,
  wrapWithFarmHandoff,
} from "./tx";

const ACCOUNT = "0x00000000000000000000000000000000000000a1" as Address;
const GAUGE = "0x00000000000000000000000000000000000000b1" as Address;
const TOKEN0 = "0x0000000000000000000000000000000000000001" as Address;
const TOKEN1 = "0x0000000000000000000000000000000000000002" as Address;

function managerAbi() {
  const contracts = getContractsByChainId(31611) as unknown as Record<
    string,
    { address?: Address; abi: readonly unknown[] }
  >;
  const manager = contracts.NonfungiblePositionManager;
  assert.ok(manager?.abi);
  return { address: manager.address!, abi: manager.abi as Parameters<typeof buildRemoveLiquidityCalls>[0]["abi"] };
}

function decodedNames(abi: Parameters<typeof decodeFunctionData>[0]["abi"], calls: readonly Hex[]) {
  return calls.map((data) => decodeFunctionData({ abi, data }).functionName);
}

test("remove liquidity batches decrease, collect, and optional burn", () => {
  const { abi } = managerAbi();
  const withoutBurn = buildRemoveLiquidityCalls({
    abi,
    tokenId: 7n,
    liquidity: 100n,
    amount0Min: 1n,
    amount1Min: 2n,
    deadline: 99n,
    recipient: ACCOUNT,
    burnEmptyNft: false,
  });
  const withBurn = buildRemoveLiquidityCalls({
    abi,
    tokenId: 7n,
    liquidity: 100n,
    amount0Min: 1n,
    amount1Min: 2n,
    deadline: 99n,
    recipient: ACCOUNT,
    burnEmptyNft: true,
  });
  assert.deepEqual(decodedNames(abi, withoutBurn), ["decreaseLiquidity", "collect"]);
  assert.deepEqual(decodedNames(abi, withBurn), ["decreaseLiquidity", "collect", "burn"]);
});

test("reposition batches exit, burn, and mint into one manager payload", () => {
  const { abi } = managerAbi();
  const calls = buildRepositionCalls({
    abi,
    tokenId: 9n,
    liquidity: 50n,
    decreaseAmount0Min: 1n,
    decreaseAmount1Min: 2n,
    deadline: 123n,
    recipient: ACCOUNT,
    token0: TOKEN0,
    token1: TOKEN1,
    tickSpacing: 200,
    tickLower: -400,
    tickUpper: 400,
    amount0Desired: 10n,
    amount1Desired: 11n,
    amount0Min: 8n,
    amount1Min: 9n,
  });
  assert.deepEqual(decodedNames(abi, calls), ["decreaseLiquidity", "collect", "burn", "mint"]);
  const mint = decodeFunctionData({ abi, data: calls[3]! });
  assert.equal(mint.functionName, "mint");
  assert.ok(mint.args);
  const mintParams = mint.args[0] as { tickLower: number; tickUpper: number; recipient: Address };
  assert.equal(mintParams.tickLower, -400);
  assert.equal(mintParams.tickUpper, 400);
  assert.equal(mintParams.recipient.toLowerCase(), ACCOUNT);
});

test("unstake is a single withdraw and does not prepend getReward", () => {
  const step = buildGaugeUnstakeStep({
    tokenId: 4n,
    gaugeAddress: GAUGE,
    gaugeAbi: [
      {
        type: "function",
        name: "withdraw",
        stateMutability: "nonpayable",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [],
      },
    ],
  });
  assert.equal(step.type, "write");
  assert.equal(step.key, "liquidity-unstake-4");
});

test("stake still requires a skippable NFT approval plus deposit", () => {
  const steps = buildGaugeStakeSteps({
    tokenId: 4n,
    managerAddress: ACCOUNT,
    gaugeAddress: GAUGE,
    gaugeAbi: [
      {
        type: "function",
        name: "deposit",
        stateMutability: "nonpayable",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [],
      },
    ],
  });
  assert.deepEqual(
    steps.map((step) => step.key),
    ["liquidity-stake-approve-4", "liquidity-stake-4"],
  );
});

test("farm handoff prepends unstake and appends restake around a manager action", () => {
  const inner = buildGaugeUnstakeStep({
    tokenId: 1n,
    gaugeAddress: GAUGE,
    gaugeAbi: [{ type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] }],
  });
  const steps = wrapWithFarmHandoff({
    isStaked: true,
    restake: true,
    tokenId: 12n,
    managerAddress: ACCOUNT,
    gaugeAddress: GAUGE,
    gaugeAbi: [
      { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
      { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
    ],
    account: ACCOUNT,
    inner: [inner],
  });
  assert.deepEqual(
    steps.map((step) => step.key),
    ["liquidity-unstake-12", "liquidity-unstake-1", "liquidity-stake-approve-12", "liquidity-stake-12"],
  );
});

test("minted token id is read from the position-manager Transfer log", () => {
  const { address } = managerAbi();
  const topics = encodeEventTopics({
    abi: [
      {
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "tokenId", type: "uint256", indexed: true },
        ],
      },
    ],
    eventName: "Transfer",
    args: {
      from: "0x0000000000000000000000000000000000000000",
      to: ACCOUNT,
      tokenId: 77n,
    },
  });
  const receipt = {
    logs: [
      {
        address,
        topics,
        data: "0x" as Hex,
        blockHash: "0x1",
        blockNumber: 1n,
        logIndex: 0,
        transactionHash: "0x2",
        transactionIndex: 0,
        removed: false,
      },
    ],
  } as unknown as TransactionReceipt;
  assert.equal(
    mintedPositionTokenIdFromReceipt({
      receipt,
      managerAddress: address,
      recipient: ACCOUNT,
    }),
    77n,
  );
});
