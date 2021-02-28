var ERC1271Sample = artifacts.require("ERC1271Sample");

module.exports = function(deployer) {
  // deployment steps
  deployer.deploy(ERC1271Sample);
};