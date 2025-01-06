import { ethers } from "ethers";

// CONFIGURATION
const RPC_URL = "https://blast-rpc.publicnode.com"; // Replace with the Blast Network RPC URL
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Wallet Configuration
const PRIVATE_KEY = "Your Wallet here"; // Replace with your private key
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Addresses
const PAC_FINANCE_CONTRACT = "0xfde98ab7a6602ad55462297d952ce25b58743140"; // Pac Finance contract address
const AWETH_TOKEN_ADDRESS = "0x63749b03bdb4e86e5aaf7e5a723bf993dbf0c1c5"; // aWETH token address (reserve)
const DESTINATION_WALLET = wallet.address; // Your wallet to receive the withdrawn ETH
const TOKEN_CONTRACT_ADDRESS = "0x4300000000000000000000000000000000000004"; // token Weth address
// ABI for tokens ERC-20
const ERC21_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  ];

// Thresholds
const MIN_ETH_BALANCE = 0.001; // Minimum ETH balance in the reserve to trigger withdrawal
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)", // Check aWETH balance
];
const PAC_FINANCE_ABI = [
  "function withdrawERC20(address asset, uint256 amount, address to) external", // Withdraw function
];

const checkAndWithdraw = async (intervalId) => {
  try {

    const tokenContract = new ethers.Contract(
      TOKEN_CONTRACT_ADDRESS,
      ERC21_ABI,
      provider
    );

    // Check ETH balance of the reserve (AWETH_TOKEN_ADDRESS)
    const reserveEthBalanceWei = await tokenContract.balanceOf(AWETH_TOKEN_ADDRESS); 
     const decimals = await tokenContract.decimals();

    //  decimais format
    const reserveEthBalance = ethers.formatUnits(reserveEthBalanceWei, decimals);

    console.log(`Reserve ETH balance: ${reserveEthBalance} ETH`);

    // Ensure the reserve balance exceeds the minimum threshold
    if (parseFloat( reserveEthBalance) >= MIN_ETH_BALANCE) {
      console.log(`Reserve has sufficient ETH. Checking your aWETH balance...`);

      // Check your aWETH balance
      const aWethContract = new ethers.Contract(AWETH_TOKEN_ADDRESS, ERC20_ABI, wallet);
      const myAWethBalance = await aWethContract.balanceOf(wallet.address);
      const myAWethBalanceEth = ethers.formatEther(myAWethBalance);
      console.log(`Your aWETH balance: ${myAWethBalanceEth} aWETH`);

      // Ensure you have aWETH to withdraw
      if (parseFloat(myAWethBalanceEth) > 0) {
        // Calculate the amount to withdraw: the smaller of reserve ETH or your entitlement
        const withdrawAmountWei = ethers.parseUnits(
          Math.min(parseFloat(reserveEthBalance), parseFloat(myAWethBalanceEth)).toString(),
          "ether"
        );
        
        // -  wei amount
        const adjustedWithdrawAmountWei = withdrawAmountWei - BigInt(6666833308834); // made because some transactions sometimes are failling with full value 
        // Check for zero withdrawal
        if (withdrawAmountWei === 0n) { // Compare bigint to 0n
          // console.log("Calculated withdrawal amount is 0. Skipping transaction.");
          return;
        }

        console.log(`Preparing to withdraw ${ethers.formatEther(adjustedWithdrawAmountWei)} ETH...`);

        // Withdraw aWETH for ETH
        const pacFinanceContract = new ethers.Contract(PAC_FINANCE_CONTRACT, PAC_FINANCE_ABI, wallet);
        
        // getting data
        const data = await pacFinanceContract.interface.encodeFunctionData("withdrawERC20", [
        TOKEN_CONTRACT_ADDRESS, // asset
        adjustedWithdrawAmountWei.toString(),  // amount
        DESTINATION_WALLET,  // to
        ]);
        // Optional: run transaction
       const tx = await wallet.sendTransaction({
       to: PAC_FINANCE_CONTRACT,
       data: data, // codified data
       maxPriorityFeePerGas: ethers.parseUnits("0.012437253", "gwei"), // priority rate
       maxFeePerGas: ethers.parseUnits("0.5", "gwei"), // max unit gás
       gasLimit: 2100000, //  gas limit, change when necessary
       });

        console.log("Withdrawal transaction sent. Hash:", tx.hash);
        const receipt = await tx.wait();
        console.log(`Withdrawal successful! Transaction Hash: ${receipt.transactionHash}`);

        // Stop monitoring
        //clearInterval(intervalId);
        
      } else {
        console.log("You have no aWETH tokens to withdraw.");
        clearInterval(intervalId);
        console.log("Monitoring stopped after successful withdrawal.");
      }
    } else {
      console.log(`Reserve ETH balance is below the minimum threshold (${MIN_ETH_BALANCE} ETH).`);
    }
  } catch (error) {
    console.error("Error occurred during monitoring/withdrawal:", error);
  }
};

// Run the script every 2 seconds
const intervalId = setInterval(() => checkAndWithdraw(intervalId), 2000);