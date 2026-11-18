import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";
import { getContractConfig } from "@/contracts/shared";
import { getAeroPoolConfigs } from "@/lib/bridge/aero-pools";
import {
  HORIZON_LEGACY_BASE_PEERS,
  HORIZON_TESTNET,
  type HorizonBridgeAsset,
} from "@/lib/bridge/horizon";

const WAVE2_ASSETS: HorizonBridgeAsset[] = ["avBTCv", "avMEZOv"];

describe("Horizon Wave 2 address book", () => {
  it("keeps dapp registry peers aligned with HORIZON_TESTNET", () => {
    for (const asset of WAVE2_ASSETS) {
      const peerContract = asset === "avBTCv" ? "avBTCvPeer" : "avMEZOvPeer";
      const registryPeer = getContractConfig(84532, peerContract)?.address;
      assert.ok(registryPeer, `missing registry peer for ${asset}`);
      assert.equal(
        getAddress(registryPeer),
        getAddress(HORIZON_TESTNET[84532].assets[asset].token),
        `${asset} registry peer drifted from HORIZON_TESTNET`,
      );
    }
  });

  it("keeps Mezo vault registry addresses aligned with HORIZON_TESTNET", () => {
    for (const asset of WAVE2_ASSETS) {
      const vaultContract = asset === "avBTCv" ? "avBTCVault" : "avMEZOVault";
      const registryVault = getContractConfig(31611, vaultContract)?.address;
      assert.ok(registryVault, `missing registry vault for ${asset}`);
      assert.equal(
        getAddress(registryVault),
        getAddress(HORIZON_TESTNET[31611].assets[asset].token),
        `${asset} registry vault drifted from HORIZON_TESTNET`,
      );
    }
  });

  it("keeps Aero pool share tokens on Wave 2 peers", () => {
    const pools = getAeroPoolConfigs();
    for (const asset of WAVE2_ASSETS) {
      const pool = pools.find((item) => item.asset === asset);
      assert.ok(pool, `missing Aero pool config for ${asset}`);
      assert.equal(
        getAddress(pool.share),
        getAddress(HORIZON_TESTNET[84532].assets[asset].token),
        `${asset} Aero share drifted from HORIZON_TESTNET`,
      );
    }
  });

  it("keeps legacy Base peers distinct from Wave 2 peers", () => {
    for (const asset of WAVE2_ASSETS) {
      assert.notEqual(
        getAddress(HORIZON_LEGACY_BASE_PEERS[asset]),
        getAddress(HORIZON_TESTNET[84532].assets[asset].token),
      );
    }
  });
});
