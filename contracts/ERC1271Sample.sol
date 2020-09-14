// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.5.16;

import "./IERC1271.sol";

// libraries
import "@openzeppelin/contracts/ownership/Ownable.sol";

/**
 * @notice ERC-1271: Standard Signature Validation Method for Contracts
 */
contract ERC1271Sample is ERC1271, Ownable {

  // bytes4(keccak256("isValidSignature(bytes32,bytes)")
  bytes4 constant internal MAGICVALUE = 0x1626ba7e;
  
  // To store the Data Hash => Singature Hash
  mapping(bytes32 => bytes32) public signatures;

  /**
   * @dev Should return whether the signature provided is valid for the provided data
   * @param _hash Arbitrary length data signed on the behalf of address(this)
   * @param _signature Signature byte array associated with _hash
   *
   * MUST return the bytes4 magic value 0x1626ba7e when function passes.
   * MUST NOT modify state (using STATICCALL for solc < 0.5, view modifier for solc > 0.5)
   * MUST allow external calls
   */ 
  function isValidSignature(
    bytes32 _hash, 
    bytes memory _signature)
    public
    view 
    returns (bytes4 magicValue) {
      if(signatures[_hash] == keccak256(_signature))
        return MAGICVALUE;
      return 0;
  }

  function addSignature(
    bytes32 _hash, 
    bytes memory _signature)
    public 
    onlyOwner {
      signatures[_hash] = keccak256(_signature);
  }

  function addSignature(
    bytes32 _hash, 
    bytes32 _signatureHash)
    public 
    onlyOwner {
      signatures[_hash] = _signatureHash;
  }
}