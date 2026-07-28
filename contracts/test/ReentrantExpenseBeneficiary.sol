// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IMeute {
    function execute(uint256 proposalId) external;
}

/// @notice Test-only contract — never deployed to production.
/// @dev Used as a malicious expense beneficiary: its `receive()` re-enters
///      Meute.execute() the moment it gets paid, to prove `nonReentrant`
///      actually blocks the reentrant call.
contract ReentrantExpenseBeneficiary {
    address public meute;
    uint256 public reentrantProposalId;

    function setMeute(address _meute) external {
        meute = _meute;
    }

    function setReentrantProposalId(uint256 _id) external {
        reentrantProposalId = _id;
    }

    receive() external payable {
        IMeute(meute).execute(reentrantProposalId);
    }
}
