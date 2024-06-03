// SPDX-License-Identifier: CC-BY-NC-ND

pragma solidity ^0.8.0;

interface IReferralCalculator {
    struct referralDetails {
        address _parent;
        address _grandparent;
        uint256 _yearsVerified; 
        bool _creatorIsAmbassador;
        bool _parentIsAmbassador;
        bool _grandparentIsAmbassador;
    }

    struct referralRewards {
        uint256 parentReferralShare;
        uint256 grandparentReferralShare;
    }

    function calculateProfitShares(referralDetails calldata details) external view returns (uint256, referralRewards memory);
}
