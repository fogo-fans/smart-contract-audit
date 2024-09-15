// SPDX-License-Identifier: CC-BY-NC-ND

pragma solidity ^0.8.0;    

import "../interfaces/IReferralCalculator.sol";

contract ReferralCalculator is IReferralCalculator {

    uint256 public brokerShare = 200; // Broker's percentage share (0-1000)

    uint256 public parentShare = 50;
    uint256 public grandparentShare = 10;

    uint256 public ambassadorParentShare = 100;
    uint256 public ambassadorGrandparentShare = 50; 

    uint256 public ambassadorDiscount = 100;
    uint256 public referralDiscount = 10;

    address public owner = msg.sender;

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    function calculateProfitShares(referralDetails memory details) external view returns (uint256, referralRewards memory) {
        uint256 finalBrokerShare = brokerShare;
        referralRewards memory rewards;

        if (details._creatorIsAmbassador) {
            finalBrokerShare -= ambassadorDiscount;

        } else if (details._parent != address(0)) {
            rewards = calculateReferralRewards(details);
            finalBrokerShare -= referralDiscount;
            finalBrokerShare -= (rewards.parentReferralShare + rewards.grandparentReferralShare);
        }

        return (finalBrokerShare, rewards);
    }


    function calculateReferralRewards(referralDetails memory details) private view returns (referralRewards memory rewards) {
        rewards.parentReferralShare = 0;
        rewards.grandparentReferralShare = 0;

        if (details._yearsVerified < 2 ) {
            if (details._grandparent != address(0)) { // Grandparent does exists?
                if (details._parentIsAmbassador) {
                    rewards.parentReferralShare = ambassadorParentShare;
                    rewards.grandparentReferralShare = grandparentShare;
                } else if (details._grandparentIsAmbassador) {
                    rewards.parentReferralShare = parentShare;
                    rewards.grandparentReferralShare = ambassadorGrandparentShare;
                } else {
                    rewards.parentReferralShare = parentShare;
                    rewards.grandparentReferralShare = grandparentShare;
                }
            } else {
                rewards.parentReferralShare = details._parentIsAmbassador ? ambassadorParentShare : parentShare;
            }
        }

        return rewards;
    }

    function updateBrokerShare(uint256 _newShare) external onlyOwner {
        require(_newShare <= 1000, "Broker share cannot be over 100%");
        brokerShare = _newShare;
    }

    function updateParentShare(uint256 _newShare) external onlyOwner {
        require(_newShare <= 1000, "Parent share cannot be over 100%");
        parentShare = _newShare;
    }

    function updateGrandparentShare(uint256 _newShare) external onlyOwner {
        require(_newShare <= 1000, "Grandparent share cannot be over 100%");
        grandparentShare = _newShare;
    }

    function updateAmbassadorParentShare(uint256 _newShare) external onlyOwner {
        require(_newShare <= 1000, "Ambassador parent share cannot be over 100%");
        ambassadorParentShare = _newShare;
    }

    function updateAmbassadorGrandparentShare(uint256 _newShare) external onlyOwner {
        require(_newShare <= 1000, "Ambassador grandparent share cannot be over 100%");
        ambassadorGrandparentShare = _newShare;
    }

    function updateAmbassadorDiscount(uint256 _newDiscount) external onlyOwner {
        require(_newDiscount <= brokerShare, "Ambassador discount cannot be more than broker share");
        ambassadorDiscount = _newDiscount;
    }

    function updateReferralDiscount(uint256 _newDiscount) external onlyOwner {
        require(_newDiscount <= brokerShare, "Referral discount cannot be more than broker share");
        referralDiscount = _newDiscount;
    }

}