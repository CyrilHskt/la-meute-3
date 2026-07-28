// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title La Meute 3.0 — membership card and governance
/// @notice Single contract: non-transferable ERC-721 (membership registry) and
///         governance mechanics (application, vote, execution). See
///         docs/cahier-des-charges.md and docs/recap-conception.md §9 for the
///         rationale behind a single contract rather than two separate
///         contracts.
/// @dev No privileged role after deployment: no owner, no pause, no upgrade.
///      The constructor mints the founders' cards, the only moment a card
///      appears without a vote (§9 of the cahier des charges).
contract Meute is ERC721, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Strings for address;

    /// @notice Version of the deployed contract (semver), independent of the
    ///         generation name "La Meute 3.0" — that only changes at the next
    ///         major redesign, this version changes on every redeployment.
    ///         Immutable: since the contract isn't upgradable (§9), this is
    ///         the only way to know, from Etherscan or the front, which
    ///         commit a deployed address corresponds to.
    string public constant VERSION = "0.4.0";

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Rank carried by a card.
    enum Rank {
        Cub,
        Wolf
    }

    /// @notice Type of a proposal. All four share a single voting mechanic
    ///         (§7.0 of the cahier des charges); only execution consults the
    ///         type to decide what to apply.
    enum ProposalType {
        Admission,
        Confirmation,
        Exclusion,
        Expense
    }

    /// @notice Choice expressed by a voter. Fixed semantics, valid for every
    ///         proposal type:
    ///         - Approve  = in favor (for a confirmation: confirm)
    ///         - Reject   = against (for a confirmation: turn down)
    ///         - Postpone = deferral; only meaningful for a confirmation,
    ///                      rejected by {vote} for any other type (§7.3).
    enum VoteChoice {
        Approve,
        Reject,
        Postpone
    }

    /// @notice Data carried by a card. Rank and timestamp packed into a
    ///         single storage slot (§10 of the cahier des charges, "Gas"
    ///         section).
    /// @dev `lastActivity` means something different depending on rank, never
    ///      both at once: for a Wolf, it's dormancy tracking (§7.5) —
    ///      updated on every vote. For a Cub, who never votes, it's the start
    ///      of the current probation period — updated on mint and on every
    ///      postponement (§7.3). One field, two mutually exclusive uses
    ///      rather than one field per rank.
    struct Card {
        Rank rank;
        uint40 lastActivity;
        uint8 postponements; // number of postponements already used (max MAX_POSTPONEMENTS)
    }

    /// @notice An ongoing or finished proposal.
    struct Proposal {
        ProposalType proposalType;
        address target; // applicant / targeted member / expense beneficiary (depending on proposalType)
        uint64 deadline; // vote closing timestamp (opening + 7 days)
        uint32 activeSnapshot; // frozen denominator — see snapshotFrozen
        bool snapshotFrozen; // true as soon as the snapshot has been taken (first vote or opening)
        bool executed;
        // One counter per {VoteChoice} value, regardless of the proposal's
        // type. postponeVotes stays at 0 for binary proposals, since {vote}
        // rejects that choice for them (see VoteChoice).
        uint32 approveVotes;
        uint32 rejectVotes;
        uint32 postponeVotes;
        // parameters specific to the Expense type
        uint256 amount;
        string reason;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Exact fee due on application, not modifiable.
    uint256 public immutable fee;

    /// @notice Duration of the probation period before a confirmation vote
    ///         can be opened.
    uint256 public constant PROBATION_DURATION = 90 days;

    /// @notice Maximum number of postponements before a Cub can only be
    ///         confirmed or turned down.
    uint8 public constant MAX_POSTPONEMENTS = 2;

    /// @notice Inactivity delay beyond which a Wolf becomes dormant.
    /// @dev 6 months rather than 1 year: the participation quorum
    ///      ({QUORUM_NUM}/{QUORUM_DEN}) is computed over active Wolves, too
    ///      large a group (1 year) would make a 75% quorum in 7 days
    ///      unrealistic for an association that doesn't vote every week.
    uint256 public constant DORMANCY_DELAY = 180 days;

    /// @notice Duration during which a proposal stays open to voting.
    uint256 public constant VOTE_DURATION = 7 days;

    /// @notice Numerator/denominator of the required participation quorum
    ///         (active Wolves at snapshot time who must have voted, yes or
    ///         no, for a vote to be valid) — 75%.
    /// @dev A fraction rather than a direct percentage to stay in exact
    ///      integer arithmetic (Solidity only does truncated division):
    ///      `cast * QUORUM_DEN > active * QUORUM_NUM` is equivalent to
    ///      `cast / active > 75%` without ever rounding.
    uint8 public constant QUORUM_NUM = 3;
    uint8 public constant QUORUM_DEN = 4;

    /// @dev Each member's card, indexed directly by address. A card only
    ///      exists (in the ERC-721 sense) if {_isMember} is true — see that
    ///      function for the exact condition.
    ///      @dev The ERC-721 tokenId matching an address is never chosen nor
    ///      counted: it's the address itself, reinterpreted as an integer
    ///      ({_tokenId}). One card, one address, for a member's entire life —
    ///      an arbitrary identifier would add nothing and would require
    ///      maintaining an extra counter and mapping.
    mapping(address member => Card) private _cards;

    /// @dev Set of addresses currently at Wolf rank (dormant ones included).
    ///      Its size can't be controlled by an attacker: becoming a Wolf
    ///      requires passing a real vote, not free spam (§10 of the cahier
    ///      des charges, "DoS" section) — the loop over this set in
    ///      {activeWolves} therefore stays bounded by the pack's actual
    ///      growth, not by an arbitrary array.
    EnumerableSet.AddressSet private _wolves;

    /// @dev Proposals by identifier.
    mapping(uint256 proposalId => Proposal) private _proposals;

    /// @dev Registry of votes already cast, to prevent double voting.
    mapping(uint256 proposalId => mapping(address voter => bool)) private _hasVoted;

    /// @dev Prevents a second application from being open simultaneously for the same address.
    mapping(address applicant => bool) private _applicationOpen;

    /// @dev Prevents two Wolves from simultaneously opening two confirmation
    ///      votes for the same Cub. Symmetric to {_applicationOpen}.
    mapping(address cub => bool) private _confirmationOpen;

    uint256 private _nextProposalId;

    /// @notice Total amount donated by an address, member or not — a
    ///         donation is open to anyone, unlike the fee. Deliberately O(1)
    ///         read per address: the leaderboard of top contributors
    ///         (potentially unbounded, unlike the pack) is built off-chain
    ///         from {DonationReceived}, never through an on-chain loop over
    ///         donors (§10, "DoS via unbounded loop").
    mapping(address donor => uint256) public totalDonations;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error IncorrectFee();
    error ApplicationAlreadyOpen();
    error AlreadyMember();
    error NotACub();
    error NotAWolf();
    error ProbationNotOver();
    error VoteClosed();
    error VoteStillOpen();
    error AlreadyVoted();
    error UnknownProposal();
    error AlreadyExecuted();
    error InvalidChoice();
    error TransferForbidden();
    error InvalidAmount();
    error NoFounders();
    error InsufficientFunds();
    error TransferFailed();
    error NotAMember();
    error ConfirmationAlreadyOpen();
    error ConflictOfInterest();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @dev An event can index at most 3 parameters: `author` (new, to look
    ///      up proposals opened by an address — impossible before, `target`
    ///      doesn't work for that since for an exclusion or an expense it
    ///      designates the victim/beneficiary, not the author) takes the slot
    ///      left by `proposalType`, which stays readable in the log, just not
    ///      filterable by topic.
    event ProposalOpened(
        uint256 indexed proposalId,
        address indexed target,
        address indexed author,
        ProposalType proposalType
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter);
    event ProposalExecuted(uint256 indexed proposalId);
    event MemberWokenUp(address indexed member);
    event DonationReceived(address indexed donor, uint256 amount, uint256 totalDonated);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @notice Deploys the contract and mints the founding members' cards.
    /// @param founders Addresses of the founding members, minted at Wolf rank.
    /// @param feeAmount Exact amount required for every application.
    constructor(address[] memory founders, uint256 feeAmount) ERC721("Meute Card", "MEUTE") {
        if (founders.length == 0) revert NoFounders();
        if (feeAmount == 0) revert InvalidAmount();

        fee = feeAmount;

        for (uint256 i = 0; i < founders.length; i++) {
            _mintCard(founders[i], Rank.Wolf);
        }
    }

    // ---------------------------------------------------------------------
    // Proposal lifecycle — opening (§7.0-7.4)
    // ---------------------------------------------------------------------

    /// @notice Opens an application. The applicant opens it themselves, by
    ///         paying the exact fee (§7.1). Only one open application per
    ///         address.
    function applyForMembership() external payable {
        if (msg.value != fee) revert IncorrectFee();
        if (_isMember(msg.sender)) revert AlreadyMember();
        if (_applicationOpen[msg.sender]) revert ApplicationAlreadyOpen();

        _applicationOpen[msg.sender] = true;
        _openProposal(ProposalType.Admission, msg.sender, 0, "");
    }

    /// @notice Opens a confirmation vote for a Cub whose probation (initial
    ///         or extended by a postponement) is over. Can be opened by any
    ///         Wolf (§7.3).
    /// @dev Deliberately no notion of a "dormant Cub" here, despite an
    ///      attempt in that direction: unlike a Wolf (who can always prove
    ///      their presence via {imHere}), a Cub has no on-chain action to
    ///      reset their own clock — blocking it would have created a
    ///      permanent trap (a dormant Cub could never reopen a vote again,
    ///      so could never wake up again). An inactive Cub is never forced
    ///      anyway: Wolves simply don't have to open this vote, or can
    ///      propose their exclusion if needed.
    /// @param cub Address of the Cub concerned.
    function openConfirmationVote(address cub) external {
        if (_cards[msg.sender].rank != Rank.Wolf) revert NotAWolf();
        // rank == Cub also holds by default for an address without a card:
        // _isMember lifts the ambiguity (see its NatSpec).
        if (!_isMember(cub) || _cards[cub].rank != Rank.Cub) revert NotACub();
        if (block.timestamp < _cards[cub].lastActivity + PROBATION_DURATION) revert ProbationNotOver();
        if (_confirmationOpen[cub]) revert ConfirmationAlreadyOpen();

        _confirmationOpen[cub] = true;
        _openProposal(ProposalType.Confirmation, cub, 0, "");
    }

    /// @notice Opens an exclusion vote targeting a Wolf or a Cub (§7.4). Can
    ///         be opened by any Wolf.
    /// @param member Address of the targeted member.
    function proposeExclusion(address member) external {
        if (_cards[msg.sender].rank != Rank.Wolf) revert NotAWolf();
        if (!_isMember(member)) revert NotAMember();

        _openProposal(ProposalType.Exclusion, member, 0, "");
    }

    /// @notice Opens a treasury expense vote (§7.6). Can be opened by any
    ///         Wolf. The balance is only checked at execution
    ///         (InsufficientFunds): it can change between opening and
    ///         execution if other expenses are voted in the meantime.
    /// @param beneficiary Recipient of the transfer if the expense passes.
    /// @param amount Amount in wei to transfer.
    /// @param reason Description of the expense.
    function proposeExpense(address beneficiary, uint256 amount, string calldata reason) external {
        if (_cards[msg.sender].rank != Rank.Wolf) revert NotAWolf();
        if (amount == 0) revert InvalidAmount();

        _openProposal(ProposalType.Expense, beneficiary, amount, reason);
    }

    /// @notice Makes a free donation to the treasury — open to any address,
    ///         member or not (§7.6bis): unlike the fee, this is neither an
    ///         act of application nor escrowed, the ETH joins the contract's
    ///         balance directly, immediately available for a future
    ///         `proposeExpense`.
    function donate() external payable {
        if (msg.value == 0) revert InvalidAmount();
        totalDonations[msg.sender] += msg.value;
        emit DonationReceived(msg.sender, msg.value, totalDonations[msg.sender]);
    }

    // ---------------------------------------------------------------------
    // Proposal lifecycle — vote and execution (§7.0)
    // ---------------------------------------------------------------------

    /// @notice Single vote, regardless of the proposal type. Wakes up the
    ///         voter if they were dormant (§7.5).
    /// @dev Rejects (InvalidChoice) a Postpone choice on any proposal whose
    ///      type isn't Confirmation, as well as on a confirmation whose
    ///      target has already used MAX_POSTPONEMENTS postponements — "you
    ///      can't be a Cub for life" (§7.3).
    /// @param proposalId Proposal identifier.
    /// @param choice See {VoteChoice} for the semantics.
    function vote(uint256 proposalId, VoteChoice choice) external {
        if (proposalId >= _nextProposalId) revert UnknownProposal();
        Proposal storage prop = _proposals[proposalId];

        if (block.timestamp >= prop.deadline) revert VoteClosed();
        if (_cards[msg.sender].rank != Rank.Wolf) revert NotAWolf();
        if (_hasVoted[proposalId][msg.sender]) revert AlreadyVoted();
        // Conflict of interest: the target of an exclusion or an expense
        // doesn't vote on their own case (§7.4/§7.6). Not applicable to
        // Admission (the applicant isn't a Wolf yet) and Confirmation (the
        // targeted Cub never votes, regardless of context).
        if (
            msg.sender == prop.target &&
            (prop.proposalType == ProposalType.Exclusion || prop.proposalType == ProposalType.Expense)
        ) revert ConflictOfInterest();
        if (choice == VoteChoice.Postpone) {
            if (prop.proposalType != ProposalType.Confirmation) revert InvalidChoice();
            if (_cards[prop.target].postponements >= MAX_POSTPONEMENTS) revert InvalidChoice();
        }

        if (prop.snapshotFrozen) {
            // Normal case: the denominator has been frozen since opening.
            // Waking up here doesn't grow it — this neutralizes front-running
            // of the wake-up (§10 of the cahier des charges).
            _wakeUp(msg.sender);
        } else {
            // Edge case §7.5: the pack was fully dormant at opening, so the
            // snapshot was left pending. This first voter wakes up first,
            // then the snapshot is taken right after: they become the very
            // denominator they just rebuilt, rather than a simple numerator
            // added to a denominator that would ignore them.
            _wakeUp(msg.sender);
            prop.activeSnapshot = uint32(_activeForQuorum(prop.proposalType, prop.target));
            prop.snapshotFrozen = true;
        }

        _hasVoted[proposalId][msg.sender] = true;

        if (choice == VoteChoice.Approve) {
            prop.approveVotes++;
        } else if (choice == VoteChoice.Reject) {
            prop.rejectVotes++;
        } else {
            prop.postponeVotes++;
        }

        emit VoteCast(proposalId, msg.sender);
    }

    /// @notice Applies the outcome of a proposal whose deadline has passed.
    ///         Callable by anyone, member or not (§7.0) — it's a simple
    ///         mechanical chore, not a decision.
    /// @param proposalId Identifier of the proposal to execute.
    function execute(uint256 proposalId) external nonReentrant {
        if (proposalId >= _nextProposalId) revert UnknownProposal();
        Proposal storage prop = _proposals[proposalId];

        if (prop.executed) revert AlreadyExecuted();
        if (block.timestamp < prop.deadline) revert VoteStillOpen();

        // Marked before any external transfer (refund, expense) —
        // checks-effects-interactions, on top of the nonReentrant modifier.
        prop.executed = true;

        if (prop.proposalType == ProposalType.Admission) {
            _executeAdmission(prop);
        } else if (prop.proposalType == ProposalType.Confirmation) {
            _executeConfirmation(prop);
        } else if (prop.proposalType == ProposalType.Exclusion) {
            _executeExclusion(prop);
        } else {
            _executeExpense(prop);
        }

        emit ProposalExecuted(proposalId);
    }

    /// @notice Explicitly reactivates the caller without waiting for a
    ///         proposal to pass, so as to be recounted in the quorum before a
    ///         decision opens (§7.5).
    function imHere() external {
        if (_cards[msg.sender].rank != Rank.Wolf) revert NotAWolf();
        _wakeUp(msg.sender);
    }

    /// @notice Voluntary resignation, immediate, without a vote (§7.4). Burns
    ///         the card, whether at Cub or Wolf rank.
    function resign() external {
        if (!_isMember(msg.sender)) revert NotAMember();
        _confirmationOpen[msg.sender] = false;
        _burnCard(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Reads — proposals, quorum and dormancy
    // ---------------------------------------------------------------------

    /// @notice Reads a proposal. Useful for tests and the front (C7).
    function proposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[proposalId];
    }

    /// @notice Reads a member's card. Default rank (Cub) and null fields if
    ///         the address isn't a member — see {_isMember}.
    function card(address member) external view returns (Card memory) {
        return _cards[member];
    }

    /// @notice Whether a member address is currently dormant (a Wolf with no
    ///         participation since DORMANCY_DELAY). False for a Cub or an
    ///         address without a card: dormancy only concerns Wolves (§7.5)
    ///         — see {openConfirmationVote}'s NatSpec for why this
    ///         deliberately doesn't extend to Cubs.
    function isDormant(address member) public view returns (bool) {
        Card storage c = _cards[member];
        return c.rank == Rank.Wolf && block.timestamp - c.lastActivity > DORMANCY_DELAY;
    }

    /// @notice Number of active Wolves at call time (dormant ones excluded).
    /// @dev Recomputed on every call by iterating over {_wolves} — see the
    ///      justification for the bounded loop on this field. This is what
    ///      makes dormancy genuinely passive: no transaction is needed for a
    ///      Wolf to drop out of this count (§7.5).
    function activeWolves() public view returns (uint256 active) {
        uint256 n = _wolves.length();
        for (uint256 i = 0; i < n; i++) {
            if (!isDormant(_wolves.at(i))) {
                active++;
            }
        }
    }

    /// @dev Quorum denominator to use for a given proposal: {activeWolves}
    ///      minus the target itself if it's counted there (an active Wolf)
    ///      and this proposal type forbids it from voting ({vote} — conflict
    ///      of interest on Exclusion/Expense). A target already dormant
    ///      wasn't counted in {activeWolves} anyway: nothing to subtract in
    ///      that case, no double correction.
    function _activeForQuorum(ProposalType proposalType, address target) private view returns (uint256) {
        uint256 active = activeWolves();
        bool targetExcludedFromVote = (proposalType == ProposalType.Exclusion || proposalType == ProposalType.Expense) &&
            _cards[target].rank == Rank.Wolf &&
            !isDormant(target);
        return targetExcludedFromVote ? active - 1 : active;
    }

    // ---------------------------------------------------------------------
    // ERC-721 — non-transferability and on-chain metadata (§6)
    // ---------------------------------------------------------------------

    /// @dev Blocks any transfer between two holders while letting mint
    ///      (from == 0) and burn (to == 0) through. See
    ///      docs/recap-conception.md for the pitfall to avoid: not blocking
    ///      mint/burn at the same time as transfer.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert TransferForbidden();
        return super._update(to, tokenId, auth);
    }

    /// @notice 100% on-chain metadata: JSON + SVG encoded in Base64,
    ///         generated by the contract, with no dependency on a server or
    ///         IPFS (§6).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        address member = address(uint160(tokenId));
        Rank rank = _cards[member].rank;
        string memory rankName = rank == Rank.Wolf ? "Wolf" : "Cub";

        string memory json = string.concat(
            '{"name":"Meute Card - ',
            rankName,
            '","description":"Non-transferable membership card of La Meute. ',
            "Holder: ",
            member.toHexString(),
            '.","attributes":[{"trait_type":"Rank","value":"',
            rankName,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(rank))),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev tokenId associated with an address: the address itself,
    ///      reinterpreted as an integer. Deterministic, never stored or
    ///      counted.
    function _tokenId(address member) private pure returns (uint256) {
        return uint256(uint160(member));
    }

    /// @dev A member "exists" (excluding applicants) as long as their card
    ///      hasn't been burned. `lastActivity` acts as the marker: zero
    ///      before mint and after burn, always non-zero in between (updated
    ///      on every vote, never reset to zero while the card is alive).
    function _isMember(address member) private view returns (bool) {
        return _cards[member].lastActivity != 0;
    }

    /// @dev Creates a proposal and opens it for {VOTE_DURATION}. Shared by
    ///      the four opening functions (§7.0: a single mechanic, regardless
    ///      of type). Freezes the quorum snapshot immediately if the pack has
    ///      at least one active Wolf; otherwise leaves it pending for the
    ///      first vote (edge case §7.5, see {vote}).
    /// @param amount Only relevant for ProposalType.Expense; 0 otherwise.
    /// @param reason Only relevant for ProposalType.Expense; "" otherwise.
    function _openProposal(
        ProposalType proposalType,
        address target,
        uint256 amount,
        string memory reason
    ) private returns (uint256 proposalId) {
        proposalId = _nextProposalId++;

        // Excludes the target itself from the denominator if it can't vote
        // on its own case (see {_activeForQuorum}). If it was the only
        // active one, this falls to 0: the snapshot is then deferred to the
        // first eligible vote, exactly like the "fully dormant pack" case
        // below (see {vote}) — the same mechanism, not one more special case
        // to maintain.
        uint256 active = _activeForQuorum(proposalType, target);
        bool snapshotFrozen = active != 0;

        _proposals[proposalId] = Proposal({
            proposalType: proposalType,
            target: target,
            deadline: uint64(block.timestamp + VOTE_DURATION),
            activeSnapshot: snapshotFrozen ? uint32(active) : 0,
            snapshotFrozen: snapshotFrozen,
            executed: false,
            approveVotes: 0,
            rejectVotes: 0,
            postponeVotes: 0,
            amount: amount,
            reason: reason
        });

        // msg.sender here is indeed the original external caller
        // (applyForMembership, openConfirmationVote, proposeExclusion or
        // proposeExpense):
        // _openProposal is an internal call, not external, so msg.sender is
        // never rewritten between the two.
        emit ProposalOpened(proposalId, target, msg.sender, proposalType);
    }

    /// @dev Two conditions, not one: (1) a participation quorum — at least
    ///      {QUORUM_NUM}/{QUORUM_DEN} of the active Wolves at snapshot time
    ///      must have voted (yes or no), otherwise the vote isn't valid,
    ///      regardless of the outcome; (2) among the votes cast, "yes" must
    ///      strictly exceed "no" (a tie fails). Previously, only "yes" versus
    ///      the snapshot counted — a single voter could carry an expense or
    ///      an exclusion with no "no" vote ever able to stop it, even if the
    ///      rest of the pack woke up before closing. Also holds for a
    ///      proposal never voted on (0 cast: the quorum already fails, no
    ///      special case to code).
    function _isPassed(Proposal storage prop) private view returns (bool) {
        uint32 castVotes = prop.approveVotes + prop.rejectVotes;
        bool quorumReached = uint256(castVotes) * QUORUM_DEN > uint256(prop.activeSnapshot) * QUORUM_NUM;
        return quorumReached && prop.approveVotes > prop.rejectVotes;
    }

    /// @dev Admission: mints a Cub card if approved, otherwise refunds the
    ///      escrowed fee (§7.2).
    function _executeAdmission(Proposal storage prop) private {
        address applicantAddr = prop.target;
        _applicationOpen[applicantAddr] = false;

        if (_isPassed(prop)) {
            _mintCard(applicantAddr, Rank.Cub);
        } else {
            _refund(applicantAddr);
        }
    }

    /// @dev Exclusion: burns the card if approved, does nothing otherwise
    ///      (§7.4). No-op if the target has already resigned between opening
    ///      and execution: there's no more card to burn.
    function _executeExclusion(Proposal storage prop) private {
        if (!_isMember(prop.target)) return;
        if (_isPassed(prop)) {
            _burnCard(prop.target);
        }
    }

    /// @dev Expense: transfers the amount if approved, does nothing otherwise (§7.6).
    function _executeExpense(Proposal storage prop) private {
        if (_isPassed(prop)) {
            if (address(this).balance < prop.amount) revert InsufficientFunds();
            (bool ok, ) = prop.target.call{value: prop.amount}("");
            if (!ok) revert TransferFailed();
        }
    }

    /// @dev Confirmation: three-way relative-majority vote, but postponement
    ///      is the default outcome if the quorum (participation >=
    ///      {QUORUM_NUM}/{QUORUM_DEN} of the snapshot) isn't reached — the
    ///      only outcome that harms no one when the pack stayed silent
    ///      (§7.3). This passive default remains possible even once
    ///      MAX_POSTPONEMENTS is reached (only the *active* Postpone choice
    ///      is blocked by {vote}): a vote without quorum isn't a pack
    ///      decision to extend, it's the absence of a decision, which must
    ///      neither confirm nor exclude. Reuses {VoteChoice} to designate the
    ///      outcome: Approve = confirm, Reject = turn down, Postpone =
    ///      postpone — same enum as for voting, no extra type to maintain.
    function _executeConfirmation(Proposal storage prop) private {
        _confirmationOpen[prop.target] = false;
        // The Cub resigned between opening and execution: nothing left to
        // confirm, turn down or postpone.
        if (!_isMember(prop.target)) return;

        uint32 total = prop.approveVotes + prop.rejectVotes + prop.postponeVotes;
        bool quorumReached = uint256(total) * QUORUM_DEN > uint256(prop.activeSnapshot) * QUORUM_NUM;

        VoteChoice outcome = VoteChoice.Postpone;
        if (quorumReached) {
            if (prop.approveVotes > prop.rejectVotes && prop.approveVotes > prop.postponeVotes) {
                outcome = VoteChoice.Approve;
            } else if (prop.rejectVotes > prop.approveVotes && prop.rejectVotes > prop.postponeVotes) {
                outcome = VoteChoice.Reject;
            }
            // Tie between the three outcomes, or Postpone already the
            // majority: outcome stays Postpone, for the same reason as the
            // no-quorum default.
        }

        if (outcome == VoteChoice.Approve) {
            _cards[prop.target].rank = Rank.Wolf;
            _cards[prop.target].lastActivity = uint40(block.timestamp);
            _wolves.add(prop.target);
        } else if (outcome == VoteChoice.Reject) {
            _burnCard(prop.target);
        } else {
            Card storage target = _cards[prop.target];
            // Saturated at MAX_POSTPONEMENTS: the passive default can repeat
            // without ever overflowing the counter or throwing off {vote}.
            if (target.postponements < MAX_POSTPONEMENTS) {
                target.postponements++;
            }
            target.lastActivity = uint40(block.timestamp);
        }
    }

    /// @dev Burns a member's card, regardless of rank.
    function _burnCard(address member) private {
        if (_cards[member].rank == Rank.Wolf) {
            _wolves.remove(member);
        }
        uint256 tokenId = _tokenId(member);
        delete _cards[member];
        _burn(tokenId);
    }

    /// @dev Refunds the fee to a rejected applicant.
    function _refund(address applicantAddr) private {
        (bool ok, ) = applicantAddr.call{value: fee}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Mints a card at the given rank. Used for founders (Wolf rank, at
    ///      deployment) and for an admitted applicant (Cub rank, from
    ///      {_executeAdmission}).
    function _mintCard(address member, Rank rank) private {
        _cards[member] = Card({rank: rank, lastActivity: uint40(block.timestamp), postponements: 0});

        if (rank == Rank.Wolf) {
            _wolves.add(member);
        }

        _mint(member, _tokenId(member));
    }

    /// @dev Updates the last-activity timestamp. If the member was coming
    ///      out of dormancy, doesn't touch any counter — {activeWolves} will
    ///      recount them on its own on the next call — but emits the event
    ///      for traceability.
    function _wakeUp(address member) private {
        if (isDormant(member)) {
            emit MemberWokenUp(member);
        }
        _cards[member].lastActivity = uint40(block.timestamp);
    }

    /// @dev Generates the on-chain SVG for a rank: a paw print (pad + 4 toes
    ///      + 4 claws), outlined for Cub and solid silhouette for Wolf — same
    ///      set of shapes in both cases, only the styling changes. Original
    ///      artwork, drawn for this project.
    function _svg(Rank rank) private pure returns (string memory) {
        string memory style = rank == Rank.Wolf
            ? 'fill="#161311"'
            : 'fill="none" stroke="#161311" stroke-width="10" stroke-linejoin="round"';

        return
            string.concat(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g ',
                style,
                ">",
                '<path d="M256 258 L325 330 L350 420 L290 470 L256 452 L222 470 L162 420 L187 330 Z"/>',
                '<path d="M182 118 L210 86 L244 112 L252 178 L222 228 L176 206 L158 162 Z"/>',
                '<path d="M330 118 L302 86 L268 112 L260 178 L290 228 L336 206 L354 162 Z"/>',
                '<path d="M96 214 L132 182 L176 214 L184 292 L150 352 L106 330 L84 270 Z"/>',
                '<path d="M416 214 L380 182 L336 214 L328 292 L362 352 L406 330 L428 270 Z"/>',
                '<polygon points="196,58 214,18 230,66"/>',
                '<polygon points="316,58 298,18 282,66"/>',
                '<polygon points="82,182 96,144 110,188"/>',
                '<polygon points="430,182 416,144 402,188"/>',
                "</g></svg>"
            );
    }
}
