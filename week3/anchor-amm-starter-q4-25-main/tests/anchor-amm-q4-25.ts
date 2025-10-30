import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";
import { assert, expect } from "chai";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

declare var console: any;

describe("anchor-amm-q4-25", () => {
  // ✅ Configure provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorAmmQ425 as Program<AnchorAmmQ425>;
  const user = provider.wallet.publicKey;

  let mintX: anchor.web3.PublicKey;
  let mintY: anchor.web3.PublicKey;
  let userAtaX: anchor.web3.PublicKey;
  let userAtaY: anchor.web3.PublicKey;
  let userLp: anchor.web3.PublicKey;

  let mintLp: anchor.web3.PublicKey;
  let vaultX: anchor.web3.PublicKey;
  let vaultY: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;
  let lpBump: number;
  let configBump: number;

  const seed = new anchor.BN(1234);
  const fee = 10;
  const decimals = 6;

  // -----------------------------------------------------
  // INITIAL SETUP
  // -----------------------------------------------------
  before(async () => {
    await provider.connection.requestAirdrop(
      user,
      20 * anchor.web3.LAMPORTS_PER_SOL
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ✅ Create mints for token X and Y
    mintX = await createMint(
      provider.connection,
      provider.wallet.payer,
      user,
      null,
      decimals
    );
    mintY = await createMint(
      provider.connection,
      provider.wallet.payer,
      user,
      null,
      decimals
    );

    // ✅ Create user ATAs for X and Y
    const userXInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintX,
      user
    );
    userAtaX = userXInfo.address;

    const userYInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mintY,
      user
    );
    userAtaY = userYInfo.address;

    // ✅ Mint tokens to user
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintX,
      userAtaX,
      user,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mintY,
      userAtaY,
      user,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    // ✅ Derive PDAs
    [configPda, configBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

    [mintLp, lpBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );
  });

  // -----------------------------------------------------
  // INITIALIZATION
  // -----------------------------------------------------
 
it("initializes configuration", async () => {
  // derive vault ATAs for the config PDA
  vaultX = getAssociatedTokenAddressSync(mintX, configPda, true);
  vaultY = getAssociatedTokenAddressSync(mintY, configPda, true);

  // call initialize instruction
  const tx = await program.methods
    .initialize(new anchor.BN(seed), fee, user)
    .accountsStrict({
      initializer: user,
      mintX,
      mintY,
      mintLp,
      vaultX,
      vaultY,
      config: configPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Initialize TX:", tx);

  // fetch config PDA data
  const configAccount = await program.account.config.fetch(configPda);

  // assertions
  expect(configAccount.mintX.toBase58()).to.equal(mintX.toBase58());
  expect(configAccount.mintY.toBase58()).to.equal(mintY.toBase58());
  expect(configAccount.fee).to.equal(fee);
  expect(configAccount.configBump).to.equal(configBump);
  expect(configAccount.lpBump).to.equal(lpBump);
  expect(configAccount.locked).to.equal(false);

  console.log("✅ Config initialized successfully:", {
    mintX: configAccount.mintX.toBase58(),
    mintY: configAccount.mintY.toBase58(),
    fee: configAccount.fee,
    bumps: {
      config: configAccount.configBump,
      lp: configAccount.lpBump,
    },
  });
});



  // -----------------------------------------------------
  // ADD LIQUIDITY
  // -----------------------------------------------------
 it("adds initial liquidity", async () => {
  const maxXAmt = new anchor.BN(100_000_000);
  const maxYAmt = new anchor.BN(200_000_000);
  const lpTokens = new anchor.BN(100_000_000);

  // Derive user's LP token account (ATA)
  userLp = getAssociatedTokenAddressSync(mintLp, user);

  const depositAccounts = {
    user,
    mintX,
    mintY,
    config: configPda,
    mintLp,
    vaultX,
    vaultY,
    userX: userAtaX,
    userY: userAtaY,
    userLp,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  };

  // Call deposit instruction
  const tx = await program.methods
    .deposit(lpTokens, maxXAmt, maxYAmt)
    .accountsStrict(depositAccounts)
    .rpc();

  console.log("✅ Deposit TX:", tx);

  // Fetch post-deposit balances
  const vaultXAccount = await getAccount(provider.connection, vaultX);
  const vaultYAccount = await getAccount(provider.connection, vaultY);
  const userLpAccount = await getAccount(provider.connection, userLp);

  // Assertions
  expect(Number(vaultXAccount.amount)).to.be.at.most(Number(maxXAmt));
  expect(Number(vaultYAccount.amount)).to.be.at.most(Number(maxYAmt));
  expect(userLpAccount.amount.toString()).to.equal(lpTokens.toString());

  console.log("✅ Liquidity added successfully:", {
    vaultX: vaultXAccount.amount.toString(),
    vaultY: vaultYAccount.amount.toString(),
    userLp: userLpAccount.amount.toString(),
  });
});


  // -----------------------------------------------------
  // SWAP X → Y
  // -----------------------------------------------------
  it("swaps 10 X tokens for Y", async () => {
  const xTokenAmt = new anchor.BN(10_000_000);
  const minYToken = new anchor.BN(3_000_000);

  // Get user's balances before swap
  const beforeX = await getAccount(provider.connection, userAtaX);
  const beforeY = await getAccount(provider.connection, userAtaY);

  const swapAccounts = {
    user,
    mintX,
    mintY,
    config: configPda,
    mintLp,
    vaultX,
    vaultY,
    userX: userAtaX,
    userY: userAtaY,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  };

  // Perform the swap
  const tx = await program.methods
    .swap(true, xTokenAmt, minYToken)
    .accountsStrict(swapAccounts)
    .rpc();

  console.log("✅ Swap TX:", tx);

  // Fetch balances after swap
  const afterX = await getAccount(provider.connection, userAtaX);
  const afterY = await getAccount(provider.connection, userAtaY);

  // Assertions
  expect(Number(beforeX.amount)).to.be.greaterThan(Number(afterX.amount));
  expect(Number(beforeY.amount)).to.be.lessThan(Number(afterY.amount));

  console.log("✅ Swap successful:", {
    beforeX: beforeX.amount.toString(),
    afterX: afterX.amount.toString(),
    beforeY: beforeY.amount.toString(),
    afterY: afterY.amount.toString(),
  });
});


  // // -----------------------------------------------------
  // // SWAP Y → X
  // // -----------------------------------------------------
  // it("swaps 20 Y tokens for X", async () => {
  //   const yTokenAmt = new anchor.BN(20_000_000);
  //   const minXToken = new anchor.BN(10_000_000);

  //   const beforeX = await getAccount(provider.connection, userAtaX);
  //   const beforeY = await getAccount(provider.connection, userAtaY);

  //   const swapAccounts = {
  //     user,
  //     mintX,
  //     mintY,
  //     config: configPda,
  //     mintLp,
  //     vaultX,
  //     vaultY,
  //     userX: userAtaX,
  //     userY: userAtaY,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //     associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //     systemProgram: anchor.web3.SystemProgram.programId,
  //   };

  //   await program.methods
  //     .swap(false, yTokenAmt, minXToken)
  //     .accountsStrict(swapAccounts)
  //     .rpc();

  //   const afterX = await getAccount(provider.connection, userAtaX);
  //   const afterY = await getAccount(provider.connection, userAtaY);

  //   console.log(
  //     `After swap: X=${afterX.amount}, Y=${afterY.amount}`
  //   );

  //   assert(
  //     beforeY.amount > afterY.amount,
  //     "user's Y balance should decrease"
  //   );
  //   assert(
  //     beforeX.amount < afterX.amount,
  //     "user's X balance should increase"
  //   );
  // });

//   // -----------------------------------------------------
//   // WITHDRAW LIQUIDITY
//   // -----------------------------------------------------
  it("withdraws half liquidity from pool", async () => {
  // Fetch balances before withdrawal
  const beforeUserAtaX = await getAccount(provider.connection, userAtaX);
  const beforeUserAtaY = await getAccount(provider.connection, userAtaY);
  const beforeUserLp = await getAccount(provider.connection, userLp);

  const halfAmount = new anchor.BN(beforeUserLp.amount.toString()).div(new anchor.BN(2));

  console.log(`Before withdraw: 
    X = ${beforeUserAtaX.amount}, 
    Y = ${beforeUserAtaY.amount}, 
    LP = ${beforeUserLp.amount}`);

  const withdrawAccounts = {
    user,
    mintX,
    mintY,
    config: configPda,
    mintLp,
    userLp,
    vaultX,
    vaultY,
    userX: userAtaX,
    userY: userAtaY,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  };

  // Set maxX and maxY to large values to withdraw as much as possible
  const maxX = new anchor.BN("1000000000000");
  const maxY = new anchor.BN("1000000000000");

  // Execute withdrawal transaction
  const tx = await program.methods
    .withdraw(halfAmount, maxX, maxY)
    .accountsStrict(withdrawAccounts)
    .rpc();

  console.log("✅ Withdraw TX:", tx);

  // Fetch balances after withdrawal
  const afterUserAtaX = await getAccount(provider.connection, userAtaX);
  const afterUserAtaY = await getAccount(provider.connection, userAtaY);
  const afterUserLp = await getAccount(provider.connection, userLp);

  console.log(`After withdraw: 
    X = ${afterUserAtaX.amount}, 
    Y = ${afterUserAtaY.amount}, 
    LP = ${afterUserLp.amount}`);

  // Assertions
  expect(Number(afterUserAtaX.amount)).to.be.greaterThan(Number(beforeUserAtaX.amount));
  expect(Number(afterUserAtaY.amount)).to.be.greaterThan(Number(beforeUserAtaY.amount));
  expect(Number(afterUserLp.amount)).to.be.lessThan(Number(beforeUserLp.amount));

  console.log("✅ Withdraw successful — liquidity removed correctly");
});


});
