require('dotenv').config();
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      forking: {
        url: process.env.ALCHEMY_POLYGON_MAINNET_URL,
        blockNumber: 61502730
      }
    },
    polygon: {
      url: process.env.ALCHEMY_POLYGON_MAINNET_URL,
      accounts: [process.env.PRIVATE_KEY] 
    }
  }
};