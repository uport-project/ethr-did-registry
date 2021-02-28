var ethutil = require("ethereumjs-util");
var sha3 = require("js-sha3").keccak_256;
var EthereumDIDRegistry = artifacts.require("./EthereumDIDRegistry.sol");
var ERC1271Sample = artifacts.require("./ERC1271Sample.sol");
var BN = require("bn.js");

contract("EthereumDIDRegistry", function(accounts) {
  let didReg;
  let erc1271Sample1;
  let erc1271Sample2;
  const identity = web3.utils.toChecksumAddress(accounts[0]);
  let owner;
  let previousChange;
  const identity2 = web3.utils.toChecksumAddress(accounts[1]);
  const delegate = web3.utils.toChecksumAddress(accounts[2]);
  const delegate2 = web3.utils.toChecksumAddress(accounts[3]);
  const delegate3 = web3.utils.toChecksumAddress(accounts[4]);
  const delegate4 = web3.utils.toChecksumAddress(accounts[5]);
  const badboy = web3.utils.toChecksumAddress(accounts[9]);

  const privateKey = Buffer.from(
    "a285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7b",
    "hex"
  );
  const signerAddress = web3.utils.toChecksumAddress("0x2036c6cd85692f0fb2c26e6c6b2eced9e4478dfd");

  const privateKey2 = Buffer.from(
    "a285ab66393c5fdda46d6fbad9e27fafd438254ab72ad5acb681a0e9f20f5d7a",
    "hex"
  );
  const signerAddress2 = web3.utils.toChecksumAddress("0xea91e58e9fa466786726f0a947e8583c7c5b3185");

  // console.log({identity,identity2, delegate, delegate2, badboy})
  before(async () => {
    didReg = await EthereumDIDRegistry.deployed();
    erc1271Sample1 = await ERC1271Sample.deployed();
    erc1271Sample2 = await ERC1271Sample.new();
  });
  function getBlock(blockNumber) {
    return new Promise((resolve, reject) => {
      web3.eth.getBlock(blockNumber, (error, block) => {
        if (error) return reject(error);
        resolve(block);
      });
    });
  }

  function getLogs(filter) {
    return new Promise((resolve, reject) => {
      filter.get((error, events) => {
        if (error) return reject(error);
        resolve(events);
      });
    });
  }

  function stripHexPrefix(str) {
    if (str.startsWith("0x")) {
      return str.slice(2);
    }
    return str;
  }

  function bytes32ToString(bytes) {
    return Buffer.from(bytes.slice(2).split("00")[0], "hex").toString();
  }

  function stringToBytes32(str) {
    const buffstr = Buffer.from(str).toString("hex");
    return buffstr + "0".repeat(64 - buffstr.length);
  }

  function leftPad(data, size = 64) {
    if (data.length === size) return data;
    return "0".repeat(size - data.length) + data;
  }

  async function signData(identity, signer, key, data) {
    const nonce = await didReg.nonce(signer);
    const paddedNonce = leftPad(Buffer.from([nonce], 64).toString("hex"));
    const dataToSign =
      "1900" +
      stripHexPrefix(didReg.address) +
      paddedNonce +
      stripHexPrefix(identity) +
      data;
    const hash = Buffer.from(sha3.buffer(Buffer.from(dataToSign, "hex")));
    const signature = ethutil.ecsign(hash, key);
    
    // Had to compose the signature manually because 
    //  calling `web3.eth.accounts.sign(hash, key).signature` 
    //  or `await web3.eth.sign("0x" +hash.toString("hex"), signer)` (after adding the key with `web3.eth.accounts.wallet.add("0x" +key.toString("hex"))`)
    //  both provided a dirrerent signature.
    const composedSignature = "0x" + signature.r.toString("hex") + signature.s.toString("hex") + web3.utils.toHex(signature.v).substring(2)
    
    erc1271Sample1.addSignature(hash, composedSignature)
    
    const publicKey = ethutil.ecrecover(
      hash,
      signature.v,
      signature.r,
      signature.s
    ); 
    return {
      r: "0x" + signature.r.toString("hex"),
      s: "0x" + signature.s.toString("hex"),
      v: signature.v,
      signature: composedSignature,
    };
  }
  async function addContractSignature(identity, ownerERC1271Instance, data) {
    // // The next `key` is an arbitrary value because the sample ERC1271 contract 
    // //  Accept any data  
    // const key = privateKey;

    const signer = ownerERC1271Instance.address;
    const nonce = await didReg.nonce(signer);
    const paddedNonce = leftPad(Buffer.from([nonce], 64).toString("hex"));
    const dataToSign =
      "1900" +
      stripHexPrefix(didReg.address) +
      paddedNonce +
      stripHexPrefix(identity) +
      data;
    const hash = Buffer.from(sha3.buffer(Buffer.from(dataToSign, "hex")));

    // We can use any signature as a signature here because the ERC1271Sample 
    //  accepts any signature as signature as long as it is provided by the contract owner
    const genRanHex = size => "0x"+ [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const randomSignature = genRanHex(32);
    
    ownerERC1271Instance.addSignature(hash, randomSignature);
    
    return {
      signature: randomSignature,
    };    
  }

  describe("identityOwner()", () => {
    describe("default owner", () => {
      it("should return the identity address itself", async () => {
        const owner = await didReg.identityOwner(identity2);
        assert.equal(owner, identity2);
      });
    });

    describe("changed owner", () => {
      before(async () => {
        await didReg.changeOwner(identity2, delegate, { from: identity2 });
      });
      it("should return the delegate address", async () => {
        const owner = await didReg.identityOwner(identity2);
        assert.equal(owner, delegate);
      });
    });
  });

  describe("changeOwner()", () => {
    describe("using msg.sender", () => {
      describe("as current owner", () => {
        let tx;
        before(async () => {
          tx = await didReg.changeOwner(identity, delegate, { from: identity });
        });
        it("should change owner mapping", async () => {
          owner = await didReg.owners(identity);
          assert.equal(owner, delegate);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identity);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDOwnerChanged");
          assert.equal(event.args.identity, identity);
          assert.equal(event.args.owner, delegate);
          assert.equal(event.args.previousChange.toNumber(), 0);
        });
      });

      describe("as new owner", () => {
        let tx;
        before(async () => {
          previousChange = await didReg.changed(identity);
          tx = await didReg.changeOwner(identity, delegate2, {
            from: delegate
          });
        });
        it("should change owner mapping", async () => {
          owner = await didReg.owners(identity);
          assert.equal(owner, delegate2);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identity);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDOwnerChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDOwnerChanged");
          assert.equal(event.args.identity, identity);
          assert.equal(event.args.owner, delegate2);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });

      describe("as original owner", () => {
        it("should fail", async () => {
          try {
            const tx = await didReg.changeOwner(identity, identity, {
              from: identity
            });
            assert.equal(tx, undefined, "this should not happen");
          } catch (error) {
            assert.include(
              error.message,
              "VM Exception while processing transaction: revert"
            );
          }
        });
      });

      describe("as attacker", () => {
        it("should fail", async () => {
          try {
            const tx = await didReg.changeOwner(identity, badboy, {
              from: badboy
            });
            assert.equal(tx, undefined, "this should not happen");
          } catch (error) {
            assert.include(
              error.message,
              "VM Exception while processing transaction: revert"
            );
          }
        });
      });
    });
    describe("using signature", () => {
      describe("as current owner", () => {
        let tx;
        before(async () => {
          const sig = await signData(
            signerAddress,
            signerAddress,
            privateKey,
            Buffer.from("changeOwner").toString("hex") +
              stripHexPrefix(signerAddress2)
          );
          tx = await didReg.changeOwnerSigned(
            signerAddress,
            sig.v,
            sig.r,
            sig.s,
            signerAddress2,
            { from: badboy }
          );
        });
        it("should change owner mapping", async () => {
          const owner2 = await didReg.owners(signerAddress);
          assert.equal(owner2, signerAddress2);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDOwnerChanged event", () => {
          const event = tx.logs[0];
          // console.log(event.args)
          assert.equal(event.event, "DIDOwnerChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(event.args.owner, signerAddress2);
          assert.equal(event.args.previousChange.toNumber(), 0);
        });
      });
    });
    describe("using composed signature", () => {
      describe("as current owner", () => {
        let tx;
        const newOwner = signerAddress;
        before(async () => {
          const sig = await signData(
            signerAddress2,
            signerAddress2,
            privateKey2,
            Buffer.from("changeOwner").toString("hex") +
              stripHexPrefix(newOwner)
          );
          tx = await didReg.methods['changeOwnerSigned(address,bytes,address)'](
            signerAddress2,
            sig.signature,
            newOwner,
            { from: badboy }
          );
        });
        it("should change owner mapping", async () => {
          const owner2 = await didReg.owners(signerAddress2);
          assert.equal(owner2, newOwner);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress2);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDOwnerChanged event", () => {
          const event = tx.logs[0];
          // console.log(event.args)
          assert.equal(event.event, "DIDOwnerChanged");
          assert.equal(event.args.identity, signerAddress2);
          assert.equal(event.args.owner, newOwner);
          assert.equal(event.args.previousChange.toNumber(), 0);
        });
      });
    });
    describe("using smart contract signature", () => {
      describe("as current owner", () => {
        let tx;
        const identityAddress = ERC1271Sample.address;
        let newOwner;
        before(async () => {
          newOwner = erc1271Sample2.address;
          const sig = await addContractSignature(
            identityAddress,
            erc1271Sample1,
            Buffer.from("changeOwner").toString("hex") +
              stripHexPrefix(newOwner)
          );
          tx = await didReg.methods['changeOwnerSigned(address,bytes,address)'](
            identityAddress,
            sig.signature,
            newOwner,
            { from: badboy }
          );
        });
        it("should change owner mapping", async () => {
          const owner2 = await didReg.owners(identityAddress);
          assert.equal(owner2, newOwner);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identityAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDOwnerChanged event", () => {
          const event = tx.logs[0];
          // console.log(event.args)
          assert.equal(event.event, "DIDOwnerChanged");
          assert.equal(event.args.identity, identityAddress);
          assert.equal(event.args.owner, newOwner);
          assert.equal(event.args.previousChange.toNumber(), 0);
        });
      });
    });
  });

  describe("addDelegate()", () => {
    describe("using msg.sender", () => {
      it("validDelegate should be false", async () => {
        const valid = await didReg.validDelegate(
          identity,
          web3.utils.asciiToHex("attestor"),
          delegate3
        );
        assert.equal(valid, false, "not yet assigned delegate correctly");
      });
      describe("as current owner", () => {
        let tx;
        let block;
        before(async () => {
          previousChange = await didReg.changed(identity);
          tx = await didReg.addDelegate(
            identity,
            web3.utils.asciiToHex("attestor"),
            delegate3,
            86400,
            { from: delegate2 }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("validDelegate should be true", async () => {
          const valid = await didReg.validDelegate(
            identity,
            web3.utils.asciiToHex("attestor"),
            delegate3
          );
          assert.equal(valid, true, "assigned delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identity);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, identity);
          assert.equal(bytes32ToString(event.args.delegateType), "attestor");
          assert.equal(event.args.delegate, delegate3);
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });

      describe("as attacker", () => {
        it("should fail", async () => {
          try {
            const tx = await didReg.addDelegate(
              identity,
              web3.utils.asciiToHex("attestor"),
              badboy,
              86400,
              { from: badboy }
            );
            assert.equal(tx, undefined, "this should not happen");
          } catch (error) {
            assert.include(
              error.message,
              "VM Exception while processing transaction: revert"
            );
          }
        });
      });
    });
    describe("using signature", () => {
      describe("as current owner", () => {
        let tx1;
        let block1;
        let previousChange1;
        let tx2;
        let block2;
        let previousChange2;
        before(async () => {
          previousChange1 = await didReg.changed(signerAddress);
          let sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("addDelegate").toString("hex") +
              stringToBytes32("attestor") +
              stripHexPrefix(delegate) +
              leftPad(new BN(86400).toString(16))
          );
          tx1 = await didReg.methods['addDelegateSigned(address,uint8,bytes32,bytes32,bytes32,address,uint256)'](
            signerAddress,
            sig.v,
            sig.r,
            sig.s,
            web3.utils.asciiToHex("attestor"),
            delegate,
            86400,
            { from: badboy }
          );
          block1 = await getBlock(tx1.receipt.blockNumber);
        });
        it("validDelegate should be true", async () => {
          let valid = await didReg.validDelegate(
            signerAddress,
            web3.utils.asciiToHex("attestor"),
            delegate
          );
          assert.equal(valid, true, "assigned delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest.toNumber(), tx1.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          let event = tx1.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.delegateType), "attestor");
          assert.equal(event.args.delegate, delegate);
          assert.equal(event.args.validTo.toNumber(), block1.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange1.toNumber()
          );
        });
      });
    });
    describe("using composed signature", () => {
      describe("as current owner", () => {
        let tx1;
        let block1;
        let previousChange1;
        const delegateType = "attestor";
        const identityAddress = signerAddress;
        const owner = signerAddress2;
        before(async () => {
          previousChange1 = await didReg.changed(identityAddress);
          let sig = await signData(
            identityAddress,
            owner,
            privateKey2,
            Buffer.from("addDelegate").toString("hex") +
              stringToBytes32(delegateType) +
              stripHexPrefix(delegate) +
              leftPad(new BN(86400).toString(16))
          );
          tx1 = await didReg.methods['addDelegateSigned(address,bytes,bytes32,address,uint256)'](
            identityAddress,
            sig.signature,
            web3.utils.asciiToHex(delegateType),
            delegate,
            86400,
            { from: badboy }
          );
          block1 = await getBlock(tx1.receipt.blockNumber);
        });
        it("validDelegate should be true", async () => {
          let valid = await didReg.validDelegate(
            identityAddress,
            web3.utils.asciiToHex(delegateType),
            delegate
          );
          assert.equal(valid, true, "assigned delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identityAddress);
          assert.equal(latest.toNumber(), tx1.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          let event = tx1.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, identityAddress);
          assert.equal(bytes32ToString(event.args.delegateType), delegateType);
          assert.equal(event.args.delegate, delegate);
          assert.equal(event.args.validTo.toNumber(), block1.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange1.toNumber()
          );
        });
      });
    });
    describe("using smart contract signature", () => {
      describe("as current owner", () => {
        let tx1;
        let block1;
        let previousChange1;
        const identityAddress = ERC1271Sample.address;
        const delegateType = "attestor";
        before(async () => {
          previousChange1 = await didReg.changed(identityAddress);
          let sig = await addContractSignature(
            identityAddress,
            erc1271Sample2,
            Buffer.from("addDelegate").toString("hex") +
              stringToBytes32(delegateType) +
              stripHexPrefix(delegate) +
              leftPad(new BN(86400).toString(16))
          );
          tx1 = await didReg.methods['addDelegateSigned(address,bytes,bytes32,address,uint256)'](
            identityAddress,
            sig.signature,
            web3.utils.asciiToHex(delegateType),
            delegate,
            86400,
            { from: badboy }
          );
          block1 = await getBlock(tx1.receipt.blockNumber);
        });
        it("validDelegate should be true", async () => {
          let valid = await didReg.validDelegate(
            identityAddress,
            web3.utils.asciiToHex(delegateType),
            delegate
          );
          assert.equal(valid, true, "assigned delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identityAddress);
          assert.equal(latest.toNumber(), tx1.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          let event = tx1.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, identityAddress);
          assert.equal(bytes32ToString(event.args.delegateType), delegateType);
          assert.equal(event.args.delegate, delegate);
          assert.equal(event.args.validTo.toNumber(), block1.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange1.toNumber()
          );
        });
      });
    });
  });

  describe("revokeDelegate()", () => {
    describe("using msg.sender", () => {
      it("validDelegate should be true", async () => {
        const valid = await didReg.validDelegate(
          identity,
          web3.utils.asciiToHex("attestor"),
          delegate3
        );
        assert.equal(valid, true, "not yet revoked");
      });
      describe("as current owner", () => {
        let tx;
        let block;
        before(async () => {
          previousChange = await didReg.changed(identity);
          tx = await didReg.revokeDelegate(identity, web3.utils.asciiToHex("attestor"), delegate3, {
            from: delegate2
          });
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("validDelegate should be false", async () => {
          const valid = await didReg.validDelegate(
            identity,
            web3.utils.asciiToHex("attestor"),
            delegate3
          );
          assert.equal(valid, false, "revoked correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identity);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, identity);
          assert.equal(bytes32ToString(event.args.delegateType), "attestor");
          assert.equal(event.args.delegate, delegate3);
          assert.isBelow(
            event.args.validTo.toNumber(),
            Math.floor(Date.now() / 1000) + 1
          );
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
      describe("as attacker", () => {
        it("should fail", async () => {
          try {
            const tx = await didReg.revokeDelegate(
              identity,
              web3.utils.asciiToHex("attestor"),
              badboy,
              { from: badboy }
            );
            assert.equal(tx, undefined, "this should not happen");
          } catch (error) {
            assert.include(
              error.message,
              "VM Exception while processing transaction: revert"
            );
          }
        });
      });
    });
    describe("using signature", () => {
      describe("as current owner", () => {
        let tx;
        before(async () => {
          previousChange = await didReg.changed(signerAddress);
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("revokeDelegate").toString("hex") +
              stringToBytes32("attestor") +
              stripHexPrefix(delegate)
          );
          tx = await didReg.revokeDelegateSigned(
            signerAddress,
            sig.v,
            sig.r,
            sig.s,
            web3.utils.asciiToHex("attestor"),
            delegate,
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("validDelegate should be false", async () => {
          const valid = await didReg.validDelegate(
            signerAddress,
            web3.utils.asciiToHex("attestor"),
            delegate
          );
          assert.equal(valid, false, "revoked delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.delegateType), "attestor");
          assert.equal(event.args.delegate, delegate);
          assert.isBelow(
            event.args.validTo.toNumber(),
            Math.floor(Date.now() / 1000) + 1
          );
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
    describe("using composed signature", () => {
      describe("as current owner", () => {
        let tx;
        const delegateType = "attestor";
        before(async () => {
          previousChange = await didReg.changed(signerAddress);
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("revokeDelegate").toString("hex") +
              stringToBytes32(delegateType) +
              stripHexPrefix(delegate)
          );
          tx = await didReg.methods['revokeDelegateSigned(address,bytes,bytes32,address)'](
            signerAddress,
            sig.signature,
            web3.utils.asciiToHex(delegateType),
            delegate,
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("validDelegate should be false", async () => {
          const valid = await didReg.validDelegate(
            signerAddress,
            web3.utils.asciiToHex(delegateType),
            delegate
          );
          assert.equal(valid, false, "revoked delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.delegateType), delegateType);
          assert.equal(event.args.delegate, delegate);
          assert.isBelow(
            event.args.validTo.toNumber(),
            Math.floor(Date.now() / 1000) + 1
          );
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
    describe("using smart contract signature", () => {
      describe("as current owner", () => {
        let tx;
        const delegateType = "attestor";
        const identityAddress = ERC1271Sample.address;
        before(async () => {
          previousChange = await didReg.changed(identityAddress);
          const sig = await addContractSignature(
            identityAddress,
            erc1271Sample2,
            Buffer.from("revokeDelegate").toString("hex") +
              stringToBytes32(delegateType) +
              stripHexPrefix(delegate)
          );
          tx = await didReg.methods['revokeDelegateSigned(address,bytes,bytes32,address)'](
            identityAddress,
            sig.signature,
            web3.utils.asciiToHex(delegateType),
            delegate,
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("validDelegate should be false", async () => {
          const valid = await didReg.validDelegate(
            identityAddress,
            web3.utils.asciiToHex(delegateType),
            delegate
          );
          assert.equal(valid, false, "revoked delegate correctly");
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identityAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDDelegateChanged");
          assert.equal(event.args.identity, identityAddress);
          assert.equal(bytes32ToString(event.args.delegateType), delegateType);
          assert.equal(event.args.delegate, delegate);
          assert.isBelow(
            event.args.validTo.toNumber(),
            Math.floor(Date.now() / 1000) + 1
          );
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
  });

  describe("setAttribute()", () => {
    describe("using msg.sender", () => {
      describe("as current owner", () => {
        let tx;
        let block;
        before(async () => {
          previousChange = await didReg.changed(identity);
          tx = await didReg.setAttribute(
            identity,
            web3.utils.asciiToHex("encryptionKey"),
            web3.utils.asciiToHex("mykey"),
            86400,
            { from: owner }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identity);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDAttributeChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, identity);
          assert.equal(bytes32ToString(event.args.name), "encryptionKey");
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });

      describe("as attacker", () => {
        it("should fail", async () => {
          try {
            const tx = await didReg.setAttribute(
              identity,
              web3.utils.asciiToHex("encryptionKey"),
              web3.utils.asciiToHex("mykey"),
              86400,
              { from: badboy }
            );
            assert.equal(tx, undefined, "this should not happen");
          } catch (error) {
            assert.include(
              error.message,
              "VM Exception while processing transaction: revert"
            );
          }
        });
      });
    });

    describe("using signature", () => {
      describe("as current owner", () => {
        let tx;
        before(async () => {
          previousChange = await didReg.changed(signerAddress);
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("setAttribute").toString("hex") +
              stringToBytes32("encryptionKey") +
              Buffer.from("mykey").toString("hex") +
              leftPad(new BN(86400).toString(16))
          );
          tx = await didReg.setAttributeSigned(
            signerAddress,
            sig.v,
            sig.r,
            sig.s,
            web3.utils.asciiToHex("encryptionKey"),
            web3.utils.asciiToHex("mykey"),
            86400,
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.name), "encryptionKey");
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
    describe("using composed signature", () => {
      describe("as current owner", () => {
        let tx;
        const attributeName = "encryptionKey";
        before(async () => {
          previousChange = await didReg.changed(signerAddress);
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("setAttribute").toString("hex") +
              stringToBytes32(attributeName) +
              Buffer.from("mykey").toString("hex") +
              leftPad(new BN(86400).toString(16))
          );
          tx = await didReg.methods['setAttributeSigned(address,bytes,bytes32,bytes,uint256)'](
            signerAddress,
            sig.signature,
            web3.utils.asciiToHex(attributeName),
            web3.utils.asciiToHex("mykey"),
            86400,
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.name), attributeName);
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
    describe("using smart contract signature", () => {
      describe("as current owner", () => {
        let tx;
        const attributeName = "encryptionKey";
        const identityAddress = ERC1271Sample.address;
        before(async () => {
          previousChange = await didReg.changed(identityAddress);
          const sig = await addContractSignature(
            identityAddress,
            erc1271Sample2,
            Buffer.from("setAttribute").toString("hex") +
              stringToBytes32(attributeName) +
              Buffer.from("mykey").toString("hex") +
              leftPad(new BN(86400).toString(16))
          );
          tx = await didReg.methods['setAttributeSigned(address,bytes,bytes32,bytes,uint256)'](
            identityAddress,
            sig.signature,
            web3.utils.asciiToHex(attributeName),
            web3.utils.asciiToHex("mykey"),
            86400,
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identityAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, identityAddress);
          assert.equal(bytes32ToString(event.args.name), attributeName);
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), block.timestamp + 86400);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
  });

  describe("revokeAttribute()", () => {
    describe("using msg.sender", () => {
      describe("as current owner", () => {
        let tx;
        let block;
        before(async () => {
          previousChange = await didReg.changed(identity);
          tx = await didReg.revokeAttribute(
            identity,
            web3.utils.asciiToHex("encryptionKey"),
            web3.utils.asciiToHex("mykey"),
            { from: owner }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identity);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDAttributeChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, identity);
          assert.equal(bytes32ToString(event.args.name), "encryptionKey");
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), 0);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });

      describe("as attacker", () => {
        it("should fail", async () => {
          try {
            const tx = await didReg.revokeAttribute(
              identity,
              web3.utils.asciiToHex("encryptionKey"),
              web3.utils.asciiToHex("mykey"),
              { from: badboy }
            );
            assert.equal(tx, undefined, "this should not happen");
          } catch (error) {
            assert.include(
              error.message,
              "VM Exception while processing transaction: revert"
            );
          }
        });
      });
    });

    describe("using signature", () => {
      describe("as current owner", () => {
        let tx;
        before(async () => {
          previousChange = await didReg.changed(signerAddress);
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("revokeAttribute").toString("hex") +
              stringToBytes32("encryptionKey") +
              Buffer.from("mykey").toString("hex")
          );
          tx = await didReg.methods['revokeAttributeSigned(address,uint8,bytes32,bytes32,bytes32,bytes)'](
            signerAddress,
            sig.v,
            sig.r,
            sig.s,
            web3.utils.asciiToHex("encryptionKey"),
            web3.utils.asciiToHex("mykey"),
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.name), "encryptionKey");
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), 0);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
    describe("using composed signature", () => {
      describe("as current owner", () => {
        let tx;
        const attributeName = "encryptionKey";
        before(async () => {
          previousChange = await didReg.changed(signerAddress);
          const sig = await signData(
            signerAddress,
            signerAddress2,
            privateKey2,
            Buffer.from("revokeAttribute").toString("hex") +
              stringToBytes32(attributeName) +
              Buffer.from("mykey").toString("hex")
          );
          tx = await didReg.methods['revokeAttributeSigned(address,bytes,bytes32,bytes)'](
            signerAddress,
            sig.signature,
            web3.utils.asciiToHex(attributeName),
            web3.utils.asciiToHex("mykey"),
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(signerAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, signerAddress);
          assert.equal(bytes32ToString(event.args.name), attributeName);
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), 0);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
    describe("using smart contract signature", () => {
      describe("as current owner", () => {
        let tx;
        const attributeName = "encryptionKey";
        const identityAddress = ERC1271Sample.address;
        before(async () => {
          previousChange = await didReg.changed(identityAddress);
          const sig = await addContractSignature(
            identityAddress,
            erc1271Sample2,
            Buffer.from("revokeAttribute").toString("hex") +
              stringToBytes32(attributeName) +
              Buffer.from("mykey").toString("hex")
          );
          tx = await didReg.methods['revokeAttributeSigned(address,bytes,bytes32,bytes)'](
            identityAddress,
            sig.signature,
            web3.utils.asciiToHex(attributeName),
            web3.utils.asciiToHex("mykey"),
            { from: badboy }
          );
          block = await getBlock(tx.receipt.blockNumber);
        });
        it("should sets changed to transaction block", async () => {
          const latest = await didReg.changed(identityAddress);
          assert.equal(latest, tx.receipt.blockNumber);
        });
        it("should create DIDDelegateChanged event", () => {
          const event = tx.logs[0];
          assert.equal(event.event, "DIDAttributeChanged");
          assert.equal(event.args.identity, identityAddress);
          assert.equal(bytes32ToString(event.args.name), attributeName);
          assert.equal(event.args.value, "0x6d796b6579");
          assert.equal(event.args.validTo.toNumber(), 0);
          assert.equal(
            event.args.previousChange.toNumber(),
            previousChange.toNumber()
          );
        });
      });
    });
  });

  describe("Events", () => {
    it("can create list", async () => {
      const history = [];
      previousChange = await didReg.changed(identity);
      while (previousChange) {
        const events = await didReg.getPastEvents('allEvents', {          
          identity: identity,
          fromBlock: previousChange,
          toBlock: previousChange
        });
        previousChange = undefined;
        for (let event of events) {
          history.unshift(event.event);
          previousChange = event.args.previousChange;
        }
      }
      assert.deepEqual(history, [
        "DIDOwnerChanged",
        "DIDOwnerChanged",
        "DIDDelegateChanged",
        "DIDDelegateChanged",
        "DIDAttributeChanged",
        "DIDAttributeChanged"
      ]);
    });
  });
});
