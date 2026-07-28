import assert from "node:assert/strict";
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const FEE = ethers.parseEther("0.01");

// Must stay in sync with the Solidity enums (Meute.sol).
const ProposalType = { Admission: 0, Confirmation: 1, Exclusion: 2, Expense: 3 };
const VoteChoice = { Approve: 0, Reject: 1, Postpone: 2 };

async function deployMeuteFixture() {
  const [founder1, founder2, founder3, applicant, stranger] = await ethers.getSigners();
  const founders = [founder1, founder2, founder3];

  const meute = await ethers.deployContract("Meute", [founders.map((f) => f.address), FEE]);

  return { meute, founders, applicant, stranger };
}

describe("Meute", function () {
  describe("deployment", function () {
    it("reverts if there are no founders", async function () {
      await expect(ethers.deployContract("Meute", [[], FEE])).to.be.revertedWithCustomError(
        await ethers.getContractFactory("Meute"),
        "NoFounders",
      );
    });

    it("reverts if the fee is zero", async function () {
      const [f1] = await ethers.getSigners();
      await expect(ethers.deployContract("Meute", [[f1.address], 0n])).to.be.revertedWithCustomError(
        await ethers.getContractFactory("Meute"),
        "InvalidAmount",
      );
    });

    it("mints a Wolf card for each founder", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      assert.equal(await meute.activeWolves(), BigInt(founders.length));
      for (const f of founders) {
        assert.equal(await meute.isDormant(f.address), false);
      }
    });
  });

  describe("applyForMembership", function () {
    it("reverts if the fee paid is incorrect", async function () {
      const { meute, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(
        meute.connect(applicant).applyForMembership({ value: FEE - 1n }),
      ).to.be.revertedWithCustomError(meute, "IncorrectFee");
    });

    it("reverts if the caller is already a member", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(
        meute.connect(founders[0]).applyForMembership({ value: FEE }),
      ).to.be.revertedWithCustomError(meute, "AlreadyMember");
    });

    it("opens an admission proposal targeting the applicant", async function () {
      const { meute, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(meute.connect(applicant).applyForMembership({ value: FEE }))
        .to.emit(meute, "ProposalOpened")
        .withArgs(0n, applicant.address, applicant.address, ProposalType.Admission);

      const prop = await meute.proposal(0n);
      assert.equal(prop.proposalType, BigInt(ProposalType.Admission));
      assert.equal(prop.target, applicant.address);
      assert.equal(prop.executed, false);
      // At least one active Wolf at deployment: the snapshot is frozen right at opening.
      assert.equal(prop.snapshotFrozen, true);
      assert.equal(prop.activeSnapshot, 3n);
    });

    it("reverts on a second simultaneous application from the same address", async function () {
      const { meute, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(applicant).applyForMembership({ value: FEE });

      await expect(
        meute.connect(applicant).applyForMembership({ value: FEE }),
      ).to.be.revertedWithCustomError(meute, "ApplicationAlreadyOpen");
    });
  });

  describe("vote", function () {
    async function openApplication() {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      await fixture.meute.connect(fixture.applicant).applyForMembership({ value: FEE });
      return { ...fixture, proposalId: 0n };
    }

    it("reverts if the proposal doesn't exist", async function () {
      const { meute, founders } = await openApplication();

      await expect(
        meute.connect(founders[0]).vote(999n, VoteChoice.Approve),
      ).to.be.revertedWithCustomError(meute, "UnknownProposal");
    });

    it("reverts if the voter isn't a Wolf", async function () {
      const { meute, applicant, stranger, proposalId } = await openApplication();

      await expect(
        meute.connect(applicant).vote(proposalId, VoteChoice.Approve),
      ).to.be.revertedWithCustomError(meute, "NotAWolf");
      await expect(
        meute.connect(stranger).vote(proposalId, VoteChoice.Approve),
      ).to.be.revertedWithCustomError(meute, "NotAWolf");
    });

    it("reverts if the Postpone choice is used on an admission", async function () {
      const { meute, founders, proposalId } = await openApplication();

      await expect(
        meute.connect(founders[0]).vote(proposalId, VoteChoice.Postpone),
      ).to.be.revertedWithCustomError(meute, "InvalidChoice");
    });

    it("records a Wolf's vote and emits VoteCast", async function () {
      const { meute, founders, proposalId } = await openApplication();

      await expect(meute.connect(founders[0]).vote(proposalId, VoteChoice.Approve))
        .to.emit(meute, "VoteCast")
        .withArgs(proposalId, founders[0].address);

      const prop = await meute.proposal(proposalId);
      assert.equal(prop.approveVotes, 1n);
      assert.equal(prop.rejectVotes, 0n);
    });

    it("reverts on double voting", async function () {
      const { meute, founders, proposalId } = await openApplication();

      await meute.connect(founders[0]).vote(proposalId, VoteChoice.Approve);
      await expect(
        meute.connect(founders[0]).vote(proposalId, VoteChoice.Reject),
      ).to.be.revertedWithCustomError(meute, "AlreadyVoted");
    });

    it("reverts after the vote closes (7 days)", async function () {
      const { meute, founders, proposalId } = await openApplication();

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        meute.connect(founders[0]).vote(proposalId, VoteChoice.Approve),
      ).to.be.revertedWithCustomError(meute, "VoteClosed");
    });
  });

  describe("dormancy and snapshot (§7.5)", function () {
    it("a Wolf silent for 6 months becomes dormant without any transaction", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await networkHelpers.time.increase(180 * 24 * 60 * 60 + 1);

      // Pure read, no transaction sent in the meantime: dormancy is indeed
      // passive, observed on read (§7.5).
      assert.equal(await meute.isDormant(founders[0].address), true);
      assert.equal(await meute.activeWolves(), 0n);
    });

    it("voting wakes up a dormant Wolf and recounts them in activeWolves", async function () {
      const { meute, founders, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);

      await networkHelpers.time.increase(365 * 24 * 60 * 60 + 1);
      assert.equal(await meute.activeWolves(), 0n);

      // The pack is fully dormant: applyForMembership() still opens the
      // proposal, but leaves the snapshot pending (edge case §7.5).
      await meute.connect(applicant).applyForMembership({ value: FEE });
      let prop = await meute.proposal(0n);
      assert.equal(prop.snapshotFrozen, false);
      assert.equal(prop.activeSnapshot, 0n);

      await expect(meute.connect(founders[0]).vote(0n, VoteChoice.Approve))
        .to.emit(meute, "MemberWokenUp")
        .withArgs(founders[0].address);

      // The first voter woke up before the snapshot was taken: they are
      // themselves the denominator they just rebuilt.
      prop = await meute.proposal(0n);
      assert.equal(prop.snapshotFrozen, true);
      assert.equal(prop.activeSnapshot, 1n);
      assert.equal(prop.approveVotes, 1n);

      assert.equal(await meute.isDormant(founders[0].address), false);
      assert.equal(await meute.activeWolves(), 1n);
    });

    it("waking up after a snapshot is already frozen doesn't grow the denominator", async function () {
      const { meute, founders, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);
      const signers = await ethers.getSigners();
      const applicant2 = signers[5];
      const applicant3 = signers[6];

      // 300 days pass with no founder voting.
      await networkHelpers.time.increase(300 * 24 * 60 * 60);

      // founders[1] and [2] vote now: their timestamp is refreshed to
      // "today" (day 300). founders[0] stays silent.
      await meute.connect(applicant).applyForMembership({ value: FEE });
      await meute.connect(founders[1]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);

      // 100 more days: total 400 days for founders[0] (dormant, > 365d),
      // only 100 days for [1] and [2] (active).
      await networkHelpers.time.increase(100 * 24 * 60 * 60);

      assert.equal(await meute.isDormant(founders[0].address), true);
      assert.equal(await meute.isDormant(founders[1].address), false);
      assert.equal(await meute.activeWolves(), 2n);

      await meute.connect(applicant2).applyForMembership({ value: FEE });
      const prop = await meute.proposal(1n);
      // The snapshot at opening already ignores founders[0]: it only counts
      // the 2 remaining active Wolves.
      assert.equal(prop.snapshotFrozen, true);
      assert.equal(prop.activeSnapshot, 2n);

      // founders[0], dormant, wakes up by voting late on this same
      // proposal: their vote counts in the numerator but the
      // already-frozen denominator doesn't account for it.
      await meute.connect(founders[0]).vote(1n, VoteChoice.Approve);
      const propAfter = await meute.proposal(1n);
      assert.equal(propAfter.activeSnapshot, 2n);
      assert.equal(propAfter.approveVotes, 1n);
      assert.equal(await meute.activeWolves(), 3n);

      // Independent check: a proposal opened now (all 3 founders active)
      // does freeze a snapshot at 3.
      await meute.connect(applicant3).applyForMembership({ value: FEE });
      const nextProp = await meute.proposal(2n);
      assert.equal(nextProp.activeSnapshot, 3n);
    });
  });

  describe("execute — admission (§7.2)", function () {
    async function openApplicationAndVote(approveCount: number, rejectCount: number) {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      await fixture.meute.connect(fixture.applicant).applyForMembership({ value: FEE });

      for (let i = 0; i < approveCount; i++) {
        await fixture.meute.connect(fixture.founders[i]).vote(0n, VoteChoice.Approve);
      }
      for (let i = approveCount; i < approveCount + rejectCount; i++) {
        await fixture.meute.connect(fixture.founders[i]).vote(0n, VoteChoice.Reject);
      }

      return { ...fixture, proposalId: 0n };
    }

    it("reverts if the proposal doesn't exist", async function () {
      const { meute } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.execute(999n)).to.be.revertedWithCustomError(meute, "UnknownProposal");
    });

    it("reverts if the vote is still open", async function () {
      const { meute, proposalId } = await openApplicationAndVote(2, 0);
      await expect(meute.execute(proposalId)).to.be.revertedWithCustomError(meute, "VoteStillOpen");
    });

    it("reverts on double execution", async function () {
      const { meute, proposalId } = await openApplicationAndVote(2, 0);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await meute.execute(proposalId);
      await expect(meute.execute(proposalId)).to.be.revertedWithCustomError(meute, "AlreadyExecuted");
    });

    it("2 votes for out of 3: mints a Cub card and emits ProposalExecuted", async function () {
      // 75% quorum on 3 active: all 3 must have voted (2 for, 1 against) —
      // 2 > 1 still wins.
      const { meute, applicant, proposalId } = await openApplicationAndVote(2, 1);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.execute(proposalId)).to.emit(meute, "ProposalExecuted").withArgs(proposalId);

      const c = await meute.card(applicant.address);
      assert.equal(c.rank, 0n); // Rank.Cub
      assert.equal(await meute.ownerOf(BigInt(applicant.address)), applicant.address);

      // A new application from the same address must now fail: the
      // applicant has become a member.
      await expect(
        meute.connect(applicant).applyForMembership({ value: FEE }),
      ).to.be.revertedWithCustomError(meute, "AlreadyMember");
    });

    it("1 vote for out of 3 (minority): refunds the fee, no card minted", async function () {
      const { meute, applicant, proposalId } = await openApplicationAndVote(1, 2);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.execute(proposalId)).to.changeEtherBalance(ethers, applicant, FEE);

      const c = await meute.card(applicant.address);
      assert.equal(c.lastActivity, 0n); // no card: default struct

      // The rejected applicant can try again.
      await meute.connect(applicant).applyForMembership({ value: FEE });
    });

    it("reverts if the refund fails (applicant = contract without receive())", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);
      const rejectEther = await ethers.deployContract("RejectEther");
      await rejectEther.applyOnMeute(meute.target, { value: FEE });

      await meute.connect(founders[0]).vote(0n, VoteChoice.Reject);
      await meute.connect(founders[1]).vote(0n, VoteChoice.Reject);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.execute(0n)).to.be.revertedWithCustomError(meute, "TransferFailed");
    });

    it("no votes cast: rejected by default (no quorum, no majority)", async function () {
      const { meute, applicant, proposalId } = await openApplicationAndVote(0, 0);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);

      await expect(meute.execute(proposalId)).to.changeEtherBalance(ethers, applicant, FEE);
    });
  });

  describe("proposeExclusion (§7.4)", function () {
    it("reverts if the caller isn't a Wolf", async function () {
      const { meute, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(applicant).proposeExclusion(applicant.address),
      ).to.be.revertedWithCustomError(meute, "NotAWolf");
    });

    it("reverts if the target isn't a member", async function () {
      const { meute, founders, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(founders[0]).proposeExclusion(stranger.address),
      ).to.be.revertedWithCustomError(meute, "NotAMember");
    });

    it("opens an exclusion proposal targeting the member", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(founders[0]).proposeExclusion(founders[1].address))
        .to.emit(meute, "ProposalOpened")
        .withArgs(0n, founders[1].address, founders[0].address, ProposalType.Exclusion);
    });

    it("end to end: exclusion approved by majority burns the targeted member's card", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(founders[0]).proposeExclusion(founders[1].address);
      // The target (founders[1]) can't vote on their own exclusion
      // (ConflictOfInterest) — so the denominator excludes them too:
      // 75% quorum on 2 active (not 3), reached by the only two eligible voters.
      await meute.connect(founders[0]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(0n);

      await expect(meute.ownerOf(BigInt(founders[1].address))).to.revert(ethers);
      assert.equal(await meute.activeWolves(), 2n);
    });

    it("end to end: rejected exclusion changes nothing", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(founders[0]).proposeExclusion(founders[1].address);
      await meute.connect(founders[0]).vote(0n, VoteChoice.Reject);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Reject);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(0n);

      assert.equal(await meute.ownerOf(BigInt(founders[1].address)), founders[1].address);
      assert.equal(await meute.activeWolves(), 3n);
    });

    it("reverts if the target tries to vote on their own exclusion (conflict of interest)", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(founders[0]).proposeExclusion(founders[1].address);
      await expect(
        meute.connect(founders[1]).vote(0n, VoteChoice.Reject),
      ).to.be.revertedWithCustomError(meute, "ConflictOfInterest");
    });

    it("the denominator excludes the active target: 2 votes out of 2 (not 3) reach quorum", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(founders[0]).proposeExclusion(founders[1].address);
      const prop = await meute.proposal(0n);
      assert.equal(prop.activeSnapshot, 2n); // 3 active minus the target itself
    });
  });

  describe("donate (§7.6bis)", function () {
    it("reverts if the amount is zero", async function () {
      const { meute, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(stranger).donate()).to.be.revertedWithCustomError(meute, "InvalidAmount");
    });

    it("open to a non-member address, accumulates and emits DonationReceived", async function () {
      const { meute, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      const amount = ethers.parseEther("0.05");

      await expect(meute.connect(stranger).donate({ value: amount }))
        .to.emit(meute, "DonationReceived")
        .withArgs(stranger.address, amount, amount);

      assert.equal(await meute.totalDonations(stranger.address), amount);
    });

    it("accumulates several donations from the same address", async function () {
      const { meute, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await meute.connect(stranger).donate({ value: ethers.parseEther("0.01") });

      await expect(meute.connect(stranger).donate({ value: ethers.parseEther("0.02") }))
        .to.emit(meute, "DonationReceived")
        .withArgs(stranger.address, ethers.parseEther("0.02"), ethers.parseEther("0.03"));

      assert.equal(await meute.totalDonations(stranger.address), ethers.parseEther("0.03"));
    });

    it("a donation opens no application and no card", async function () {
      const { meute, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await meute.connect(stranger).donate({ value: ethers.parseEther("0.01") });

      const c = await meute.card(stranger.address);
      assert.equal(c.lastActivity, 0n); // still not a member
    });

    it("the donation immediately feeds the treasury, available for a voted expense", async function () {
      const { meute, founders, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      const amount = ethers.parseEther("0.05");
      await meute.connect(stranger).donate({ value: amount });

      await meute.connect(founders[0]).proposeExpense(stranger.address, amount, "test refund");
      await meute.connect(founders[0]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(0n)).to.changeEtherBalance(ethers, stranger, amount);
    });
  });

  describe("proposeExpense (§7.6)", function () {
    // An application, even unresolved, already pays the fee into the
    // contract: enough to fund the treasury for these tests.
    async function fundTreasury() {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      const funder = (await ethers.getSigners())[5];
      await fixture.meute.connect(funder).applyForMembership({ value: FEE });
      return fixture;
    }

    it("reverts if the caller isn't a Wolf", async function () {
      const { meute, applicant, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(applicant).proposeExpense(stranger.address, 1n, "test"),
      ).to.be.revertedWithCustomError(meute, "NotAWolf");
    });

    it("reverts if the amount is zero", async function () {
      const { meute, founders, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(
        meute.connect(founders[0]).proposeExpense(stranger.address, 0n, "test"),
      ).to.be.revertedWithCustomError(meute, "InvalidAmount");
    });

    it("opens an expense proposal with the beneficiary, amount and reason", async function () {
      const { meute, founders, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      const amount = ethers.parseEther("0.001");

      await expect(meute.connect(founders[0]).proposeExpense(stranger.address, amount, "game server"))
        .to.emit(meute, "ProposalOpened")
        .withArgs(0n, stranger.address, founders[0].address, ProposalType.Expense);

      const prop = await meute.proposal(0n);
      assert.equal(prop.amount, amount);
      assert.equal(prop.reason, "game server");
    });

    it("end to end: approved expense transfers the amount to the beneficiary", async function () {
      const { meute, founders, stranger } = await fundTreasury();
      const amount = FEE; // covered by the treasury funded above

      await meute.connect(founders[0]).proposeExpense(stranger.address, amount, "game server");
      await meute.connect(founders[0]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(1n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(1n)).to.changeEtherBalance(ethers, stranger, amount);
    });

    it("end to end: rejected expense transfers nothing", async function () {
      const { meute, founders, stranger } = await fundTreasury();
      const amount = FEE;

      await meute.connect(founders[0]).proposeExpense(stranger.address, amount, "game server");
      await meute.connect(founders[0]).vote(1n, VoteChoice.Reject);
      await meute.connect(founders[2]).vote(1n, VoteChoice.Reject);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(1n)).to.changeEtherBalance(ethers, stranger, 0n);
    });

    it("reverts at execution if the treasury has insufficient funds", async function () {
      const { meute, founders, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      const amount = ethers.parseEther("1"); // nothing in the treasury, no application paid

      await meute.connect(founders[0]).proposeExpense(stranger.address, amount, "too expensive");
      await meute.connect(founders[0]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(0n)).to.be.revertedWithCustomError(meute, "InsufficientFunds");
    });

    it("reverts if the payout fails (beneficiary = contract without receive())", async function () {
      const { meute, founders } = await fundTreasury();
      const rejectEther = await ethers.deployContract("RejectEther");

      await meute.connect(founders[0]).proposeExpense(rejectEther.target, FEE, "will fail");
      await meute.connect(founders[0]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(1n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(1n)).to.be.revertedWithCustomError(meute, "TransferFailed");
    });

    it("quorum not reached (1 vote out of 3 active): a single voter can no longer carry an expense alone", async function () {
      // Reproduces the "a single active Wolf could drain the treasury
      // alone" scenario (identified in security review): before the 75%
      // quorum, 1 vote for on a snapshot frozen at 1 was enough on its own
      // to validate an expense, with no "against" vote ever able to stop
      // it. Here, 3 Wolves are active at snapshot time: 1 vote alone (even
      // "for") no longer reaches quorum (at least 3 of the 3 are needed,
      // floor(3*3/4)+1 = 3), so the expense fails even if no one voted
      // against.
      const { meute, founders, stranger } = await fundTreasury();
      const amount = FEE;

      await meute.connect(founders[0]).proposeExpense(stranger.address, amount, "quorum test");
      await meute.connect(founders[0]).vote(1n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(1n)).to.changeEtherBalance(ethers, stranger, 0n);
    });

    it("quorum reached but a yes/no tie: the expense fails (strict majority required)", async function () {
      // 3 voters can never tie (3 is odd) — a 4th active Wolf is needed to
      // get a genuine 2-vs-2 tie.
      const { meute, founders, applicant, stranger } = await fundTreasury();
      await meute.connect(applicant).applyForMembership({ value: FEE });
      await meute.connect(founders[0]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(1n, VoteChoice.Approve);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(1n); // applicant becomes a Cub

      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
      await meute.connect(founders[0]).openConfirmationVote(applicant.address);
      await meute.connect(founders[0]).vote(2n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(2n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(2n, VoteChoice.Approve);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(2n); // applicant becomes a Wolf — 4 active now

      const amount = ethers.parseEther("0.02");
      await meute.connect(founders[0]).proposeExpense(stranger.address, amount, "tie test");
      await meute.connect(founders[0]).vote(3n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(3n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(3n, VoteChoice.Reject);
      await meute.connect(applicant).vote(3n, VoteChoice.Reject);
      // Quorum: 4/4 cast (>= floor(4*3/4)+1 = 4) — reached.
      // Majority: 2 for / 2 against — tie, so rejected.

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await expect(meute.execute(3n)).to.changeEtherBalance(ethers, stranger, 0n);
    });

    it("reverts if the beneficiary (a Wolf) tries to vote on their own expense (conflict of interest)", async function () {
      const { meute, founders } = await fundTreasury();
      await meute.connect(founders[0]).proposeExpense(founders[1].address, 1n, "to a Wolf");
      await expect(
        meute.connect(founders[1]).vote(1n, VoteChoice.Approve),
      ).to.be.revertedWithCustomError(meute, "ConflictOfInterest");
    });

    it("expense to a non-member: no conflict of interest, denominator unchanged", async function () {
      const { meute, founders, stranger } = await fundTreasury();
      await meute.connect(founders[0]).proposeExpense(stranger.address, 1n, "to a third party");
      const prop = await meute.proposal(1n);
      assert.equal(prop.activeSnapshot, 3n); // stranger isn't a Wolf, nothing to exclude
    });
  });

  describe("openConfirmationVote and its execution (§7.3)", function () {
    async function admitCub() {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      await fixture.meute.connect(fixture.applicant).applyForMembership({ value: FEE });
      // 75% quorum on 3 active: all 3 must have voted.
      await fixture.meute.connect(fixture.founders[0]).vote(0n, VoteChoice.Approve);
      await fixture.meute.connect(fixture.founders[1]).vote(0n, VoteChoice.Approve);
      await fixture.meute.connect(fixture.founders[2]).vote(0n, VoteChoice.Approve);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await fixture.meute.execute(0n);
      return { ...fixture, cub: fixture.applicant };
    }

    it("reverts if the caller isn't a Wolf", async function () {
      const { meute, cub } = await admitCub();
      await expect(
        meute.connect(cub).openConfirmationVote(cub.address),
      ).to.be.revertedWithCustomError(meute, "NotAWolf");
    });

    it("reverts if the target isn't a Cub", async function () {
      const { meute, founders, stranger } = await admitCub();
      await expect(
        meute.connect(founders[0]).openConfirmationVote(founders[1].address),
      ).to.be.revertedWithCustomError(meute, "NotACub");
      await expect(
        meute.connect(founders[0]).openConfirmationVote(stranger.address),
      ).to.be.revertedWithCustomError(meute, "NotACub");
    });

    it("reverts if probation isn't over", async function () {
      const { meute, founders, cub } = await admitCub();
      await expect(
        meute.connect(founders[0]).openConfirmationVote(cub.address),
      ).to.be.revertedWithCustomError(meute, "ProbationNotOver");
    });

    it("reverts on a second simultaneous opening", async function () {
      const { meute, founders, cub } = await admitCub();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(founders[0]).openConfirmationVote(cub.address);
      await expect(
        meute.connect(founders[1]).openConfirmationVote(cub.address),
      ).to.be.revertedWithCustomError(meute, "ConfirmationAlreadyOpen");
    });

    it("end to end: approved confirmation moves the Cub to Wolf, same card", async function () {
      const { meute, founders, cub } = await admitCub();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(founders[0]).openConfirmationVote(cub.address);
      await meute.connect(founders[0]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(1n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(1n, VoteChoice.Approve);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(1n);

      const c = await meute.card(cub.address);
      assert.equal(c.rank, 1n); // Rank.Wolf
      assert.equal(await meute.ownerOf(BigInt(cub.address)), cub.address);
      assert.equal(await meute.activeWolves(), 4n); // 3 founders + this new Wolf

      // Retrying an application later doesn't make sense here, but opening
      // a new confirmation vote must be possible again.
      assert.equal(await meute.isDormant(cub.address), false);
    });

    it("end to end: rejected confirmation burns the card", async function () {
      const { meute, founders, cub } = await admitCub();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(founders[0]).openConfirmationVote(cub.address);
      await meute.connect(founders[0]).vote(1n, VoteChoice.Reject);
      await meute.connect(founders[1]).vote(1n, VoteChoice.Reject);
      await meute.connect(founders[2]).vote(1n, VoteChoice.Reject);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(1n);

      await expect(meute.ownerOf(BigInt(cub.address))).to.revert(ethers);
    });

    it("end to end: an explicit postponement extends probation by 3 months", async function () {
      const { meute, founders, cub } = await admitCub();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(founders[0]).openConfirmationVote(cub.address);
      await meute.connect(founders[0]).vote(1n, VoteChoice.Postpone);
      await meute.connect(founders[1]).vote(1n, VoteChoice.Postpone);

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(1n);

      const c = await meute.card(cub.address);
      assert.equal(c.rank, 0n); // still a Cub
      assert.equal(c.postponements, 1n);

      // A new immediate opening fails: probation restarts for 3 months.
      await expect(
        meute.connect(founders[0]).openConfirmationVote(cub.address),
      ).to.be.revertedWithCustomError(meute, "ProbationNotOver");
    });

    it("no votes cast: postponed by default, without anyone choosing Postpone", async function () {
      const { meute, founders, cub } = await admitCub();
      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);

      await meute.connect(founders[0]).openConfirmationVote(cub.address);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(1n);

      const c = await meute.card(cub.address);
      assert.equal(c.rank, 0n);
      assert.equal(c.postponements, 1n);
    });

    it("once MAX_POSTPONEMENTS is reached, Postpone is no longer a valid choice", async function () {
      const { meute, founders, cub } = await admitCub();

      // Two consecutive postponements, each after its probation.
      for (let i = 0; i < 2; i++) {
        await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
        const proposalId = BigInt(i + 1);
        await meute.connect(founders[0]).openConfirmationVote(cub.address);
        await meute.connect(founders[0]).vote(proposalId, VoteChoice.Postpone);
        await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
        await meute.execute(proposalId);
      }

      const c = await meute.card(cub.address);
      assert.equal(c.postponements, 2n); // MAX_POSTPONEMENTS

      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
      await meute.connect(founders[0]).openConfirmationVote(cub.address);
      await expect(
        meute.connect(founders[0]).vote(3n, VoteChoice.Postpone),
      ).to.be.revertedWithCustomError(meute, "InvalidChoice");

      // The passive default (without quorum) is still possible and doesn't overflow the counter.
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(3n);
      const cAfter = await meute.card(cub.address);
      assert.equal(cAfter.postponements, 2n); // saturated, not 3
      assert.equal(cAfter.rank, 0n); // still a Cub, neither confirmed nor excluded
    });
  });

  describe("imHere (§7.5)", function () {
    it("reverts if the caller isn't a Wolf", async function () {
      const { meute, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(applicant).imHere()).to.be.revertedWithCustomError(meute, "NotAWolf");
    });

    it("wakes up a dormant Wolf without going through a vote", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await networkHelpers.time.increase(365 * 24 * 60 * 60 + 1);
      assert.equal(await meute.activeWolves(), 0n);

      await expect(meute.connect(founders[0]).imHere())
        .to.emit(meute, "MemberWokenUp")
        .withArgs(founders[0].address);

      assert.equal(await meute.isDormant(founders[0].address), false);
      assert.equal(await meute.activeWolves(), 1n);
    });
  });

  describe("resign (§7.4)", function () {
    it("reverts if the caller isn't a member", async function () {
      const { meute, stranger } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.connect(stranger).resign()).to.be.revertedWithCustomError(meute, "NotAMember");
    });

    it("burns a Wolf's card and removes them from the active count", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(founders[0]).resign();

      await expect(meute.ownerOf(BigInt(founders[0].address))).to.revert(ethers);
      assert.equal(await meute.activeWolves(), 2n);
    });

    it("doesn't block executing an exclusion vote targeting someone who resigned in the meantime", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(founders[0]).proposeExclusion(founders[1].address);
      await meute.connect(founders[1]).resign();

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      // Must not revert despite the card already being burned.
      await meute.execute(0n);
      assert.equal(await meute.activeWolves(), 2n);
    });

    it("doesn't block executing a confirmation vote targeting someone who resigned in the meantime", async function () {
      const fixture = await networkHelpers.loadFixture(deployMeuteFixture);
      const { meute, founders, applicant } = fixture;

      await meute.connect(applicant).applyForMembership({ value: FEE });
      await meute.connect(founders[0]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(0n);

      await networkHelpers.time.increase(90 * 24 * 60 * 60 + 1);
      await meute.connect(founders[0]).openConfirmationVote(applicant.address);
      await meute.connect(applicant).resign();

      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      // Must not revert despite the card already being burned.
      await meute.execute(1n);
      await expect(meute.ownerOf(BigInt(applicant.address))).to.revert(ethers);
    });
  });

  describe("non-transferability (§6, C3)", function () {
    it("reverts on a transfer between two holders", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      await expect(
        meute
          .connect(founders[0])
          .transferFrom(founders[0].address, founders[1].address, BigInt(founders[0].address)),
      ).to.be.revertedWithCustomError(meute, "TransferForbidden");
    });

    it("mint (admitted application) and burn (resignation) stay allowed", async function () {
      const { meute, founders, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(applicant).applyForMembership({ value: FEE });
      await meute.connect(founders[0]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(0n); // mint

      assert.equal(await meute.ownerOf(BigInt(applicant.address)), applicant.address);

      await meute.connect(applicant).resign(); // burn
      await expect(meute.ownerOf(BigInt(applicant.address))).to.revert(ethers);
    });
  });

  describe("tokenURI (§6, C3)", function () {
    function decodeDataUri(uri: string): unknown {
      const prefix = "data:application/json;base64,";
      assert.equal(uri.startsWith(prefix), true);
      const json = Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
      return JSON.parse(json);
    }

    it("reverts if the token doesn't exist", async function () {
      const { meute } = await networkHelpers.loadFixture(deployMeuteFixture);
      await expect(meute.tokenURI(999n)).to.revert(ethers);
    });

    it("a Wolf has metadata consistent with its rank", async function () {
      const { meute, founders } = await networkHelpers.loadFixture(deployMeuteFixture);

      const uri = await meute.tokenURI(BigInt(founders[0].address));
      const metadata = decodeDataUri(uri) as {
        name: string;
        attributes: { trait_type: string; value: string }[];
        image: string;
      };

      assert.match(metadata.name, /Wolf/);
      assert.deepEqual(metadata.attributes, [{ trait_type: "Rank", value: "Wolf" }]);
      assert.equal(metadata.image.startsWith("data:image/svg+xml;base64,"), true);

      const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString("utf8");
      assert.match(svg, /fill="#161311"/);
      assert.doesNotMatch(svg, /stroke=/);
    });

    it("a Cub has metadata consistent with its rank (outline)", async function () {
      const { meute, founders, applicant } = await networkHelpers.loadFixture(deployMeuteFixture);

      await meute.connect(applicant).applyForMembership({ value: FEE });
      await meute.connect(founders[0]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[1]).vote(0n, VoteChoice.Approve);
      await meute.connect(founders[2]).vote(0n, VoteChoice.Approve);
      await networkHelpers.time.increase(7 * 24 * 60 * 60 + 1);
      await meute.execute(0n);

      const uri = await meute.tokenURI(BigInt(applicant.address));
      const metadata = decodeDataUri(uri) as {
        name: string;
        attributes: { trait_type: string; value: string }[];
        image: string;
      };

      assert.match(metadata.name, /Cub/);
      assert.deepEqual(metadata.attributes, [{ trait_type: "Rank", value: "Cub" }]);

      const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString("utf8");
      assert.match(svg, /fill="none"/);
      assert.match(svg, /stroke="#161311"/);
    });
  });
});
