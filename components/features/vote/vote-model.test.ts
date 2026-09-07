import assert from "node:assert/strict";
import test from "node:test";
import { allocationWeights, voteShare, votingRestriction, projectedIncentive } from "./vote-model";
const open = {
  now: 110n,
  start: 100n,
  voteStart: 105n,
  voteEnd: 190n,
  lastVoted: 99n,
  whitelisted: false,
  power: 1000n,
  deactivated: false,
};
test("Mezo epoch and whitelist boundaries", () => {
  assert.equal(votingRestriction(open), null);
  assert.match(votingRestriction({ ...open, now: 105n })!, /distribution/);
  assert.equal(votingRestriction({ ...open, now: 190n }), null);
  assert.match(votingRestriction({ ...open, now: 191n })!, /closed/);
  assert.equal(votingRestriction({ ...open, now: 191n, whitelisted: true }), null);
  assert.match(
    votingRestriction({ ...open, lastVoted: 100n, whitelisted: true })!,
    /Already voted/,
  );
  assert.match(votingRestriction({ ...open, power: 0n })!, /No veBTC/);
  assert.match(votingRestriction({ ...open, deactivated: true })!, /deactivated/);
});
test("allocation validates whole percentages, protocol maximum and integer rounding", () => {
  assert.deepEqual(allocationWeights(["30", "70"], 1000n, 2n), [30n, 70n]);
  for (const values of [
    ["50", "49"],
    ["-1", "101"],
    ["1.5", "98.5"],
    ["", "100"],
  ])
    assert.throws(() => allocationWeights(values, 1000n, 2n));
  assert.throws(() => allocationWeights(["50", "50"], 1000n, 1n), /Too many/);
  assert.throws(() => allocationWeights(["1", "99"], 10n, 2n), /too small/);
  assert.equal(voteShare(2n, 8n), "25%");
  assert.equal(voteShare(0n, 0n), "—");
});

test("conditional incentive payout uses reward supply and exact base-unit flooring", () => {
  assert.equal(projectedIncentive(100n, 1n, 3n), 33n);
  assert.equal(projectedIncentive(100n, 0n, 3n), 0n);
  assert.equal(projectedIncentive(100n, 1n, 0n), null);
  assert.equal(projectedIncentive(100n, 4n, 3n), null);
  assert.equal(voteShare(1n, 100000n), "<0.01%");
});
