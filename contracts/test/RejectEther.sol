// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Test-only contract — never deployed to production.
/// @dev Has neither a payable `receive()` nor `fallback()`: any incoming ETH
///      reverts. Used to exercise TransferFailed() in Meute.sol (fee-refund
///      and expense-payout paths), which no normal test account (EOA) could
///      ever trigger — an EOA always accepts the ETH sent to it.
contract RejectEther {
    /// @dev Relays the call so that the `msg.sender` seen by Meute is this
    ///      contract (i.e. the applicant address), not the EOA that started the test.
    function applyOnMeute(address meute) external payable {
        (bool ok, ) = meute.call{value: msg.value}(abi.encodeWithSignature("applyForMembership()"));
        require(ok, "applyForMembership() failed");
    }
}
