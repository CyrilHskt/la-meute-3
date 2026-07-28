// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Contrat de test uniquement — jamais déployé en production.
/// @dev N'a ni `receive()` ni `fallback()` payable : tout ETH entrant
///      revert. Sert à exercer TransfertEchoue() dans Meute.sol (chemins
///      remboursement de cotisation et versement de dépense), qu'aucun
///      compte de test normal (EOA) ne peut jamais déclencher — une EOA
///      accepte toujours l'ETH qu'on lui envoie.
contract RejectEther {
    /// @dev Relaie l'appel pour que `msg.sender` vu par Meute soit ce
    ///      contrat (donc l'adresse candidate), pas l'EOA qui a lancé le test.
    function candidaterSurMeute(address meute) external payable {
        (bool ok, ) = meute.call{value: msg.value}(abi.encodeWithSignature("candidater()"));
        require(ok, "candidater() a echoue");
    }
}
