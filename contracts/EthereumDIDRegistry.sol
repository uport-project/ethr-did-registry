pragma solidity ^0.5.16;

import "./IERC1271.sol";

// libraries
import "@openzeppelin/contracts/cryptography/ECDSA.sol";

contract EthereumDIDRegistry {
  
  bytes4 internal constant _ERC1271_MAGICVALUE = 0x1626ba7e;

  mapping(address => address) public owners;
  mapping(address => mapping(bytes32 => mapping(address => uint))) public delegates;
  mapping(address => uint) public changed;
  mapping(address => uint) public nonce;

  modifier onlyOwner(address identity, address actor) {
    require (actor == identityOwner(identity));
    _;
  }

  event DIDOwnerChanged(
    address indexed identity,
    address owner,
    uint previousChange
  );

  event DIDDelegateChanged(
    address indexed identity,
    bytes32 delegateType,
    address delegate,
    uint validTo,
    uint previousChange
  );

  event DIDAttributeChanged(
    address indexed identity,
    bytes32 name,
    bytes value,
    uint validTo,
    uint previousChange
  );

  function identityOwner(address identity) public view returns(address) {
     address owner = owners[identity];
     if (owner != address(0x0)) {
       return owner;
     }
     return identity;
  }

  function checkSignature(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 hash) internal returns(address) {
    address signer = ecrecover(hash, sigV, sigR, sigS);
    require(signer == identityOwner(identity));
    nonce[signer]++;
    return signer;
  }

    /**
     * @notice Checks if an identity's owner had provided a valid `_signature` for `_hash`.
     * If the identity's owner is a smart contract, the 'isValidSignature' will be called accourding to ERC1271 interface.
     *
     * @param _hash hash of the data signed//Arbitrary length data signed on the behalf of `identity`
     * @param _signature identity's signature(s) of the data
     */
    function checkSignature(
        address identity,
        bytes32 _hash,
        bytes memory _signature
    ) internal returns (address) {
        address owner = identityOwner(identity);
        bool isContract;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            isContract := gt(extcodesize(owner), 0)
        }
        if (isContract) {
            require(
                _ERC1271_MAGICVALUE ==
                    ERC1271(owner).isValidSignature(_hash, _signature)
            );
            nonce[owner]++;
            return owner;
        } else {
            address signer = ECDSA.recover(_hash, _signature);
            require(signer == identityOwner(identity));
            nonce[signer]++;
            return signer;
        }
    }

  function validDelegate(address identity, bytes32 delegateType, address delegate) public view returns(bool) {
    uint validity = delegates[identity][keccak256(abi.encodePacked(delegateType))][delegate];
    return (validity > now);
  }

  function changeOwner(address identity, address actor, address newOwner) internal onlyOwner(identity, actor) {
    owners[identity] = newOwner;
    emit DIDOwnerChanged(identity, newOwner, changed[identity]);
    changed[identity] = block.number;
  }

  function changeOwner(address identity, address newOwner) public {
    changeOwner(identity, msg.sender, newOwner);
  }

  function changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "changeOwner", newOwner));
    changeOwner(identity, checkSignature(identity, sigV, sigR, sigS, hash), newOwner);
  }

  function changeOwnerSigned(address identity, bytes memory signature, address newOwner) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "changeOwner", newOwner));
    changeOwner(identity, checkSignature(identity, hash, signature), newOwner);
  }

  function addDelegate(address identity, address actor, bytes32 delegateType, address delegate, uint validity) internal onlyOwner(identity, actor) {
    delegates[identity][keccak256(abi.encodePacked(delegateType))][delegate] = now + validity;
    emit DIDDelegateChanged(identity, delegateType, delegate, now + validity, changed[identity]);
    changed[identity] = block.number;
  }

  function addDelegate(address identity, bytes32 delegateType, address delegate, uint validity) public {
    addDelegate(identity, msg.sender, delegateType, delegate, validity);
  }

  function addDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate, uint validity) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "addDelegate", delegateType, delegate, validity));
    addDelegate(identity, checkSignature(identity, sigV, sigR, sigS, hash), delegateType, delegate, validity);
  }

  function addDelegateSigned(address identity, bytes memory signature, bytes32 delegateType, address delegate, uint validity) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "addDelegate", delegateType, delegate, validity));
    addDelegate(identity, checkSignature(identity, hash, signature), delegateType, delegate, validity);
  }

  function revokeDelegate(address identity, address actor, bytes32 delegateType, address delegate) internal onlyOwner(identity, actor) {
    delegates[identity][keccak256(abi.encodePacked(delegateType))][delegate] = now;
    emit DIDDelegateChanged(identity, delegateType, delegate, now, changed[identity]);
    changed[identity] = block.number;
  }

  function revokeDelegate(address identity, bytes32 delegateType, address delegate) public {
    revokeDelegate(identity, msg.sender, delegateType, delegate);
  }

  function revokeDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "revokeDelegate", delegateType, delegate));
    revokeDelegate(identity, checkSignature(identity, sigV, sigR, sigS, hash), delegateType, delegate);
  }

  function revokeDelegateSigned(address identity, bytes memory signature, bytes32 delegateType, address delegate) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "revokeDelegate", delegateType, delegate));
    revokeDelegate(identity, checkSignature(identity, hash, signature), delegateType, delegate);
  }

  function setAttribute(address identity, address actor, bytes32 name, bytes memory value, uint validity ) internal onlyOwner(identity, actor) {
    emit DIDAttributeChanged(identity, name, value, now + validity, changed[identity]);
    changed[identity] = block.number;
  }

  function setAttribute(address identity, bytes32 name, bytes memory value, uint validity) public {
    setAttribute(identity, msg.sender, name, value, validity);
  }

  function setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes memory value, uint validity) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "setAttribute", name, value, validity));
    setAttribute(identity, checkSignature(identity, sigV, sigR, sigS, hash), name, value, validity);
  }

  function setAttributeSigned(address identity, bytes memory signature, bytes32 name, bytes memory value, uint validity) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "setAttribute", name, value, validity));
    setAttribute(identity, checkSignature(identity, hash, signature), name, value, validity);
  }

  function revokeAttribute(address identity, address actor, bytes32 name, bytes memory value ) internal onlyOwner(identity, actor) {
    emit DIDAttributeChanged(identity, name, value, 0, changed[identity]);
    changed[identity] = block.number;
  }

  function revokeAttribute(address identity, bytes32 name, bytes memory value) public {
    revokeAttribute(identity, msg.sender, name, value);
  }

 function revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes memory value) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "revokeAttribute", name, value)); 
    revokeAttribute(identity, checkSignature(identity, sigV, sigR, sigS, hash), name, value);
  }

 function revokeAttributeSigned(address identity, bytes memory signature, bytes32 name, bytes memory value) public {
    bytes32 hash = keccak256(abi.encodePacked(byte(0x19), byte(0), this, nonce[identityOwner(identity)], identity, "revokeAttribute", name, value)); 
    revokeAttribute(identity, checkSignature(identity, hash, signature), name, value);
  }

}
