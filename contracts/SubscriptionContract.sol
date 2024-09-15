// SPDX-License-Identifier: CC-BY-NC-ND
pragma solidity ^0.8.20;
pragma abicoder v2;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IReferralCalculator.sol";


interface IWETH {
    function deposit() external payable;

    function transfer(address to, uint256 value) external returns (bool);

    function withdraw(uint256) external;
}

interface IUniswapRouter is ISwapRouter {
    function refundETH() external payable;

    function sweepToken(
        address token,
        uint256 amountMinimum,
        address recipient
    ) external payable;
}

interface IWMATIC {
    function withdraw(uint wad) external;
}


contract SubscriptionContract is ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISwapRouter public immutable swapRouter;
    IWETH private weth;
    IReferralCalculator public referralCalculator;

    address public CALCULATOR_ADDRESS = 0xf30F6B0C19EB4f02F5f27313Fbf87a9c5896d9BB;
    address private constant ROUTER_ADDRESS = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270; // Polygon WMATIC
    address public outputToken = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359; // USDC Token on Polygon Mainnet

    uint24 public constant poolFee = 3000; // Fee tier for Uniswap pool
    uint256 public gasDepositAmount = 20000000 * 1e9; // 20000000 gwei

    IUniswapRouter public constant uniswapRouter =
        IUniswapRouter(ROUTER_ADDRESS);

    address public owner;
    address public broker;

    event SubscriptionSuccessful(
        uint256 contentId,
        address indexed subscriber,
        address indexed contentCreator,
        uint256 usdcAmount,
        uint256 indexed offeringId,
        string userId
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor() {
        // Shares are multiplied by 10 to manage decimals

        owner = msg.sender;
        broker = msg.sender;
        // brokerShare = 200;
        swapRouter = ISwapRouter(ROUTER_ADDRESS);
        weth = IWETH(WMATIC);
        referralCalculator = IReferralCalculator(CALCULATOR_ADDRESS);
    }

    struct subscriptionDetails {
        uint256 _contentId;
        address _contentCreator;
        string _userId;
        uint256 _offeringId;
        address _inputToken;
        uint256 _outputAmount;
        uint256 _amountInMaximum;
        bool _gasDeposit;
    }

    struct referralDetails {
        address _parent;
        address _grandparent;
        uint256 _yearsVerified; 
        bool _creatorIsAmbassador;
        bool _parentIsAmbassador;
        bool _grandparentIsAmbassador;
    }


    function subscribe(subscriptionDetails memory details, referralDetails memory referral) external payable nonReentrant {
        require(
            details._contentCreator != address(0),
            "Creator's address can't be zero"
        );

        if (msg.value > 0) {
            /* Handle MATIC Payments */
            exactOutputSingleMATIC(details._outputAmount); // Swap MATIC to USDC

            /* Check for content creator gas deposit logic*/
            if (
                details._gasDeposit &&
                details._contentCreator.balance < (gasDepositAmount / 2)
            ) {
                /* Swap USDC to MATIC and transfer MATIC balance to content creator*/
                swapUSDCForExactMATIC();
                transferMATICBalance(details._contentCreator);
            }
        } else if (outputToken == details._inputToken) {
            /* Handle USDC Payments */
            require(details._outputAmount > 0, "Zero Output Amount");
            IERC20(outputToken).safeTransferFrom(
                msg.sender,
                address(this),
                details._outputAmount
            );
            /* Check for content creator gas deposit logic */
            if (
                details._gasDeposit &&
                details._contentCreator.balance < (gasDepositAmount / 2)
            ) {
                swapUSDCForExactMATIC();
                transferMATICBalance(details._contentCreator);
            }
        } else {
            /* Handle other ERC-20 Payments */
            exactOutputSingleToken(
                details._outputAmount,
                details._amountInMaximum,
                details._inputToken
            );
            /* Check for content creator gas deposit logic */
            if (
                details._gasDeposit &&
                details._contentCreator.balance < (gasDepositAmount / 2)
            ) {
                swapUSDCForExactMATIC();
                transferMATICBalance(details._contentCreator);
            }
        }

        /* Call function to calculate final profit splits */
        (uint256 finalBrokerShare, IReferralCalculator.referralRewards memory rewards) = calculateProfitShares(referral);

        /* Calculate and transfer broker USDC payment */
        uint256 brokerPayment = (details._outputAmount * finalBrokerShare) / 1000;
        IERC20(outputToken).safeTransfer(broker, brokerPayment);

        /* Calculate and transfer parent referral USDC payment */
        if(referral._parent != address(0)) {
            uint256 parentReferralPayment = (details._outputAmount * rewards.parentReferralShare) / 1000;
            IERC20(outputToken).safeTransfer(referral._parent , parentReferralPayment);  
        }

        /* Calculate and transfer grandparent referral USDC payment */
        if(referral._grandparent != address(0)) {
            uint256 grandparentReferralPayment = (details._outputAmount * rewards.grandparentReferralShare) / 1000;
            IERC20(outputToken).safeTransfer(referral._grandparent , grandparentReferralPayment);       
        }

        /* Transfer remaining USDC balance to content creator. */
        uint256 creatorPayment = IERC20(outputToken).balanceOf(address(this));
        IERC20(outputToken).safeTransfer(details._contentCreator, creatorPayment);

        emit SubscriptionSuccessful(
            details._contentId,
            msg.sender,
            details._contentCreator,
            details._outputAmount,
            details._offeringId,
            details._userId
        );
    }

    function calculateProfitShares(referralDetails memory details) internal view returns (uint256, IReferralCalculator.referralRewards memory){
        IReferralCalculator.referralDetails memory referral = IReferralCalculator.referralDetails({
            _parent: details._parent,
            _grandparent: details._grandparent,
            _yearsVerified: details._yearsVerified,
            _creatorIsAmbassador: details._creatorIsAmbassador,
            _parentIsAmbassador: details._parentIsAmbassador,
            _grandparentIsAmbassador: details._grandparentIsAmbassador
        });

        (uint256 finalBrokerShare, IReferralCalculator.referralRewards memory rewards) = referralCalculator.calculateProfitShares(referral);

        return (finalBrokerShare, rewards);

    }


    function exactOutputSingleToken(
        uint256 outputTokenAmount,
        uint256 _amountInMaximum,
        address inputToken
    ) internal {
        require(outputTokenAmount > 0, "Must pass non 0 Output amount");

        IERC20(inputToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amountInMaximum
        );
        IERC20(inputToken).approve(address(swapRouter), type(uint256).max);

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter
            .ExactOutputSingleParams(
                inputToken,
                outputToken,
                poolFee,
                address(this),
                block.timestamp + 300,
                outputTokenAmount,
                _amountInMaximum,
                0
            );

        swapRouter.exactOutputSingle(params);
        // refund leftover ERC20 to subscriber
        IERC20(inputToken).safeTransfer(msg.sender, checkERC20Balance(inputToken));
    }

    function exactOutputSingleMATIC(uint256 outputTokenAmount) internal {
        require(outputTokenAmount > 0, "Must pass non 0 Output amount");
        require(msg.value > 0, "Must pass non 0 ETH amount");
        uint256 amountInMaximum = msg.value;

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter
            .ExactOutputSingleParams(
                WMATIC,
                outputToken,
                poolFee,
                address(this),
                block.timestamp + 300,
                outputTokenAmount,
                amountInMaximum,
                0
            );

        /* Execute swap and transfer remaining MATIC balance to subscriber */
        swapRouter.exactOutputSingle{value: msg.value}(params);

        uniswapRouter.refundETH();
        transferMATICBalance(msg.sender);
    }

    function swapUSDCForExactMATIC() internal {
        /* Approve the Uniswap router to spend the USDC token */
        IERC20(outputToken).approve(address(swapRouter), 100000);

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter
            .ExactOutputSingleParams({
                tokenIn: outputToken,
                tokenOut: WMATIC,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 300, // 5 minutes from now
                amountOut: gasDepositAmount,
                amountInMaximum: 100000,
                sqrtPriceLimitX96: 0
            });

        /* Execute the swap and unwrap WMATIC */
        swapRouter.exactOutputSingle(params);
        unwrapWMATIC(WMATIC, gasDepositAmount);
    }

    function unwrapWMATIC(address wmaticToken, uint256 amount) internal {
        /* Ensure the contract has enough WMATIC to unwrap and interact with the WMATIC contract */
        require(
            IERC20(wmaticToken).balanceOf(address(this)) >= amount,
            "Insufficient WMATIC balance"
        );
        IWMATIC(wmaticToken).withdraw(amount);
    }

    function transferMATICBalance(address transferWallet) internal {
        /* Refund contract's MATIC balance to transferWallet (subscriber/creator). */
        (bool success, ) = transferWallet.call{value: address(this).balance}("");
        require(success, "refund failed");
    }

    function updateBrokerAddress(address _newAddress) external onlyOwner {
        require(_newAddress != address(0), "Address cannot be zero");
        broker = _newAddress;
    }

    function updateOutputToken(address _newAddress) external onlyOwner {
        require(_newAddress != address(0), "Address cannot be zero");
        outputToken = _newAddress;
    }

    function updateCalculatorContract(address _newContract) external onlyOwner {
        require(_newContract != address(0), "Address cannot be zero");
        CALCULATOR_ADDRESS = _newContract;
    }

    function updateGasDepositAmount(uint256 newGasAmount) external onlyOwner {
        gasDepositAmount = newGasAmount * 1e9;
    }

    function withdrawBalance() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    function withdrawERC20Balance(address tokenAddress) external onlyOwner {
        IERC20(tokenAddress).safeTransfer(owner, checkERC20Balance(tokenAddress));
    }

    receive() external payable {}

    function checkERC20Balance(address tokenAddress) public view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    function checkMATICBalance() public view returns (uint256) {
        return address(this).balance;
    }

}