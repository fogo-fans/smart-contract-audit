const { time, loadFixture} = require('@nomicfoundation/hardhat-network-helpers');
// console.log(anyValue);

const { expect } = require('chai');
const { ethers } = require('hardhat');

describe("SubscriptionContract", () => {
    async function runEveryTime(){

        const zeroAddress = ethers.ZeroAddress; 

        //Generate owner and creator accounts
        const [owner] = await ethers.getSigners();
        const creator = ethers.Wallet.createRandom();
        const parentWallet = ethers.Wallet.createRandom();
        const grandparentWallet = ethers.Wallet.createRandom(); 

        const parent = parentWallet.address
        // const grandparent = grandparentWallet.address
        // const parent = zeroAddress;
        const grandparent = zeroAddress;

   
        //Impersonate subscriber account
        const subscriberAddress = '0x1144c5b7A6032f5C894436A3Be5BDdE1ba224aB5' //USDC & USDT holder
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [subscriberAddress],
        });
        const subscriber = await ethers.getSigner(subscriberAddress);

        //Deploy contract
        const SubscriptionContract = await hre.ethers.getContractFactory("SubscriptionContract")
        const subscriptionContract = await SubscriptionContract.deploy();
        
        
        //USDC Contract & Approval
        const usdcAddress = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
        const erc20Abi = [ 
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function balanceOf(address owner) view returns (uint256)",
            "function transfer(address to, uint amount) returns (bool)"
        ];
        const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, ethers.provider);
        
        const usdcOutputAmount = 1_000_000; //USDC Subscription Price (6 decimal)
        await usdcContract.connect(subscriber).approve(subscriptionContract.target, usdcOutputAmount);


        //ERC20 Contract & Approval
        const erc20Token = 'USDT'
        const erc20Address = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
        const erc20Contract = new ethers.Contract(erc20Address, erc20Abi, ethers.provider);
        
        const erc20InputAmount = 0//1_100_000
        await erc20Contract.connect(subscriber).approve(subscriptionContract.target, erc20InputAmount);


        const msgValue = ethers.parseEther("30");
        const subscriptionDetails = {
            _contentId: 101,
            _contentCreator: creator.address,
            _userId: "301",
            _offeringId: 201,
            _inputToken: zeroAddress,
            // _inputToken: usdcAddress,
            // _inputToken: erc20Address,
            _outputAmount: usdcOutputAmount,
            // _amountInMaximum: msgValue,
            // _amountInMaximum: usdcOutputAmount,
            _amountInMaximum: erc20InputAmount,
            _gasDeposit: true
            //_isTip: true
        };

        const referralDetails = {
            _parent: parent,
            _grandparent: grandparent,
            _yearsVerified: 0, 
            _creatorIsAmbassador: false,
            _parentIsAmbassador: true,
            _grandparentIsAmbassador: false
        };

        return { subscriptionContract, owner, subscriber, creator, parent, grandparent, msgValue, subscriptionDetails, referralDetails, usdcContract, erc20Contract, erc20Token }
    }

    describe('Deployment', function () {
        it('Contract was deployed and subscription payment was processed.', async function () {
            const { subscriptionContract, owner, subscriber, creator, parent, grandparent, msgValue, subscriptionDetails, referralDetails, usdcContract, erc20Token } = await loadFixture(runEveryTime);

            console.log('broker USDC intial balance ==========>', await usdcContract.balanceOf(owner.address));

            const subscribeTx = await subscriptionContract.connect(subscriber).subscribe(subscriptionDetails, referralDetails, {value: msgValue} );
            
            // Log parameter values and final balances
            console.log('gasDeposit =========================>', subscriptionDetails._gasDeposit);
            console.log('has parent referrer ================>', parent != ethers.ZeroAddress ? true : false);
            console.log('has grandparentparent referrer =====>', grandparent != ethers.ZeroAddress ? true : false);
            console.log('creator is ambassador ==============>', referralDetails._creatorIsAmbassador);
            console.log('parent is ambassador ===============>', referralDetails._parentIsAmbassador);
            console.log('grandparent is ambassador ==========>', referralDetails._grandparentIsAmbassador);
            console.log('years verified =====================>', referralDetails._yearsVerified);
            console.log('MATIC transaction value ============>', msgValue); 
            console.log(`ERC20 input value (${erc20Token}) ===========>`, subscriptionDetails._amountInMaximum);
            console.log('USDC subscription price ============>', subscriptionDetails._outputAmount);
            console.log('broker USDC final balance ==========>', await usdcContract.balanceOf(owner.address));
            console.log('parent USDC final balance ==========>', await usdcContract.balanceOf(parent));
            console.log('grandparent USDC final balance =====>', await usdcContract.balanceOf(grandparent));
            console.log('creator USDC final balance =========>', await usdcContract.balanceOf(creator.address));
            console.log('creator MATIC final balance ========>', await ethers.provider.getBalance(creator.address));
            expect(subscribeTx && await subscriptionContract.owner()).to.equal(owner.address);    
            
        });
        
        it('Should recieve payment in MATIC, USDC, or other ERC20 token and deposit USDC across broker and referrers (20%) and creator (80%).', async function () {
            const { subscriptionContract, owner, subscriber, creator, parent, grandparent, msgValue, subscriptionDetails, referralDetails, usdcContract } = await loadFixture(runEveryTime);

            const initialBrokerBalance = await usdcContract.balanceOf(owner.address).then(b => BigInt(b));
            const initialCreatorBalance = await usdcContract.balanceOf(creator.address).then(b => BigInt(b));
            const initialParentBalance = await usdcContract.balanceOf(parent).then(b => BigInt(b));
            const initialGrandparentBalance = await usdcContract.balanceOf(grandparent).then(b => BigInt(b));
            
            // Shares are multiplied by 10 for compatibility with integer math (representing 10%, 5%, etc.)
            const parentShare = referralDetails._parentIsAmbassador ? BigInt(100) : BigInt(50); // 10% or 5%
            const grandparentShare = referralDetails._grandparentIsAmbassador ? BigInt(50) : BigInt(10); // 5% or 1%
            const creatorShare = referralDetails._creatorIsAmbassador ? BigInt(900) : BigInt(800); // 90% or 80%
            const brokerShare = BigInt(1000) - creatorShare; // 10% or 20%
            
            await subscriptionContract.connect(subscriber).subscribe(subscriptionDetails, referralDetails, {value: msgValue});
            
            // Calculate expected balances using BigInt for all arithmetic to prevent precision issues
            const outputAmount = BigInt(subscriptionDetails._outputAmount); 
            
            const expectedParentBalance = referralDetails._yearsVerified < 2 && parent != ethers.ZeroAddress 
                                            ? initialParentBalance + (outputAmount * parentShare / BigInt(1000))
                                            : BigInt(0);
            const expectedGrandparentBalance = referralDetails._yearsVerified < 2 && grandparent != ethers.ZeroAddress
                                                ? initialGrandparentBalance + (outputAmount * grandparentShare / BigInt(1000))
                                                : BigInt(0);
            
            
            // Creators get a 1% discount when using a referral code.
            const discount = parent != ethers.ZeroAddress ? BigInt(10) : BigInt(0); // Convert 1% into an integer scaled value
            
            const expectedBrokerBalance = initialBrokerBalance + outputAmount
                * (brokerShare - discount) / BigInt(1000)
                - (expectedParentBalance + expectedGrandparentBalance);
            
            const expectedCreatorBalance = initialCreatorBalance + (outputAmount * (creatorShare + discount) / BigInt(1000));


            
            expect(await usdcContract.balanceOf(owner.address)).to.equal(expectedBrokerBalance);
            expect(await usdcContract.balanceOf(parent)).to.equal(expectedParentBalance);
            expect(await usdcContract.balanceOf(grandparent)).to.equal(expectedGrandparentBalance);
            
            // console.log(`Expected Parent Balance: ${expectedParentBalance.toString()}`);
            // console.log(`Expected Grandparent Balance: ${expectedGrandparentBalance.toString()}`);
            //  console.log(`Expected Broker Balance: ${expectedBrokerBalance.toString()}`);
            //  console.log(`Initial Broker Balance: ${initialBrokerBalance.toString()}`);
            // console.log(`Expected Creator Balance: ${expectedCreatorBalance.toString()}`);
            // expect(await usdcContract.balanceOf(creator.address)).to.equal(expectedCreatorBalance);
        });

        it("Should deposit 0.02 MATIC to creator when _gasDeposit is true and creator's balance is less than 0.01 MATIC. Should fail if conditions are not met.", async function () {
            const { subscriptionContract, subscriber, creator, msgValue, subscriptionDetails, referralDetails } = await loadFixture(runEveryTime);

            const initialCreatorMATICBalance = await ethers.provider.getBalance(creator.address);

            await subscriptionContract.connect(subscriber).subscribe(subscriptionDetails, referralDetails, {value: msgValue} );

            const expectedCreatorMATICBalance = initialCreatorMATICBalance + ethers.parseEther("0.02");
            
            expect(await ethers.provider.getBalance(creator.address)).to.equal(expectedCreatorMATICBalance);
        });

        it('Should refund any excess MATIC or ERC20 to subscriber after swap is completed.', async function () {
            const { subscriptionContract, subscriber, erc20Contract, subscriptionDetails, referralDetails, msgValue, usdcContract } = await loadFixture(runEveryTime);

            //MATIC payment
            if (msgValue > 0) {
                const initialSubscriberBalance = await ethers.provider.getBalance(subscriber.address);
    
                const tx = await subscriptionContract.connect(subscriber).subscribe(subscriptionDetails, referralDetails, {value: msgValue});
                const txReceipt = await tx.wait();
    
                const gasSpent = BigInt(txReceipt.gasUsed * txReceipt.gasPrice);
                const expectedSubscriberBalance = initialSubscriberBalance - msgValue - gasSpent;
                
                // console.log('initial subscriber balance--->', initialSubscriberBalance);
                // console.log('final subscriber balance----->', await ethers.provider.getBalance(subscriber.address));
                // console.log('expected subscriber balance-->', expectedSubscriberBalance);
                expect(await ethers.provider.getBalance(subscriber.address)).to.be.greaterThan(expectedSubscriberBalance);
                expect(await subscriptionContract.checkMATICBalance()).to.equal(0);
            }
            //USDC Payment
            else if (subscriptionDetails._inputToken === usdcContract.target) {
                const initialSubscriberBalance = await usdcContract.balanceOf(subscriber.address);
                const expectedSubscriberBalance = initialSubscriberBalance - BigInt(subscriptionDetails._outputAmount);

                await subscriptionContract.connect(subscriber).subscribe(subscriptionDetails, {value: msgValue});

                expect(await usdcContract.balanceOf(subscriber.address)).to.equal(expectedSubscriberBalance);
                expect(await subscriptionContract.checkERC20Balance(usdcContract.target)).to.equal(0); 

            }
            //ERC20 Payment
            else {
                const initialSubscriberBalance = await erc20Contract.balanceOf(subscriber.address);
                const expectedSubscriberBalance = initialSubscriberBalance - BigInt(subscriptionDetails._amountInMaximum);
    
                await subscriptionContract.connect(subscriber).subscribe(subscriptionDetails, {value: msgValue});
    
                // console.log('initial subscriber balance--->', initialSubscriberBalance);
                // console.log('final subscriber balance----->', await erc20Contract.balanceOf(subscriber.address));
                // console.log('expected subscriber balance-->', expectedSubscriberBalance);
                expect(await erc20Contract.balanceOf(subscriber.address)).to.be.greaterThan(expectedSubscriberBalance);
                expect(await subscriptionContract.checkERC20Balance(erc20Contract.target)).to.equal(0); 
            }
        });

        it('Only the owner can call update and withdraw functions.', async function () {
            const { subscriptionContract, owner, subscriber, creator } = await loadFixture(runEveryTime);

            expect(await subscriptionContract.connect(owner).updateCalculatorContract('0xD3C27B06b65c7A4D51cA70fA77ad4D68bb48a35f'));
            expect(await subscriptionContract.connect(owner).updateBrokerAddress(creator.address));
            expect(await subscriptionContract.connect(owner).updateOutputToken('0xc2132D05D31c914a87C6611C10748AEb04B58e8F'));
            expect(await subscriptionContract.connect(owner).updateGasDepositAmount(50000000));
            expect(await subscriptionContract.connect(owner).withdrawBalance());
            expect(await subscriptionContract.connect(owner).withdrawERC20Balance('0xc2132D05D31c914a87C6611C10748AEb04B58e8F'));
 
            
            await expect(subscriptionContract.connect(subscriber).updateCalculatorContract('0xD3C27B06b65c7A4D51cA70fA77ad4D68bb48a35f')).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(subscriptionContract.connect(subscriber).updateBrokerAddress(creator.address)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(subscriptionContract.connect(subscriber).updateOutputToken('0xc2132D05D31c914a87C6611C10748AEb04B58e8F')).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(subscriptionContract.connect(subscriber).updateGasDepositAmount(50000000)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(subscriptionContract.connect(subscriber).withdrawBalance()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(subscriptionContract.connect(subscriber).withdrawERC20Balance('0xc2132D05D31c914a87C6611C10748AEb04B58e8F')).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it('Should update broker, CALCULATOR_ADDRESS, outputToken, and gasDepositAmount when update functions are called by owner.', async function () {
            const { subscriptionContract, owner, creator } = await loadFixture(runEveryTime);

            await subscriptionContract.connect(owner).updateCalculatorContract('0xD3C27B06b65c7A4D51cA70fA77ad4D68bb48a35f');
            await subscriptionContract.connect(owner).updateBrokerAddress(creator.address);
            await subscriptionContract.connect(owner).updateOutputToken('0xc2132D05D31c914a87C6611C10748AEb04B58e8F');
            await subscriptionContract.connect(owner).updateGasDepositAmount(50000000);
            


            expect(await subscriptionContract.CALCULATOR_ADDRESS()).to.equal('0xD3C27B06b65c7A4D51cA70fA77ad4D68bb48a35f');
            expect(await subscriptionContract.broker()).to.equal(creator.address);
            expect(await subscriptionContract.outputToken()).to.equal('0xc2132D05D31c914a87C6611C10748AEb04B58e8F');
            expect(await subscriptionContract.gasDepositAmount()).to.equal(BigInt('50000000000000000'));
        });

        it('Should withdraw any remaining MATIC balance in contract when withdraw function is called by owner.', async function () {
            const { subscriptionContract, owner, subscriber } = await loadFixture(runEveryTime);

            const tx = {
                to: subscriptionContract.target,
                value: ethers.parseEther('10')
            };
            
            const sendMatic = await subscriber.sendTransaction(tx);
            await sendMatic.wait();
            // console.log('Contract Initial Balance ===>', await subscriptionContract.checkMATICBalance());
            
            const initialOwnerBalance = await ethers.provider.getBalance(owner.address);         
            const withdrawBalance = await subscriptionContract.connect(owner).withdrawBalance();
            const txReceipt = await withdrawBalance.wait();
            
            const gasSpent = BigInt(txReceipt.gasUsed * txReceipt.gasPrice);
            const expectedOwnerBalance = initialOwnerBalance + tx.value - gasSpent ; 
            
            
            // console.log('Owner initial Balance ===>', initialOwnerBalance);
            // console.log('Gas Used ===>', gasUsed);
            // console.log('Contract Balance (Tx Value) ===>', tx.value);
            // console.log('expectedOwnerBalance ===>', expectedOwnerBalance);
            // console.log('Contract Ending Balance ===>', await subscriptionContract.checkMATICBalance());
            expect(await ethers.provider.getBalance(owner.address)).to.equal(expectedOwnerBalance);
        });

        it('Should withdraw any remaining ERC20 balance in contract when withdraw function is called by owner.', async function () {
            const { subscriptionContract, owner, subscriber, erc20Contract } = await loadFixture(runEveryTime);

            //Send ERC20 tokens to subscription contract
            const erc20TokenAmount = ethers.parseUnits('10', 6)
            await erc20Contract.connect(subscriber).transfer(subscriptionContract.target, erc20TokenAmount);

            // Calculate initial and expected owner balances
            const initialOwnerBalance = await erc20Contract.balanceOf(owner.address);   
            const expectedOwnerBalance = initialOwnerBalance + erc20TokenAmount; 

            //Withdraw ERC20 contract balance 
            await subscriptionContract.connect(owner).withdrawERC20Balance(erc20Contract.target);

            // console.log('Contract ERC20 balance --->', await subscriptionContract.checkERC20Balance(erc20Contract.target));
            expect(await erc20Contract.balanceOf(owner.address)).to.equal(expectedOwnerBalance);
        });
    });
});


