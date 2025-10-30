#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

declare_id!("FueDhRTexJfY9TXVXTSQaQQHkwMP6Enq6AJn4BPhbV51");

mod state;
mod instructions;

use instructions::*;

#[program]
pub mod escrow {

    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, receive: u64, deposit: u64) -> Result<()> {
        ctx.accounts.initialize(seed, receive, &ctx.bumps)?;
        ctx.accounts.deposit(deposit)?;

        Ok(())  
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.deposit()?;
        ctx.accounts.withdraw_and_close()?;

        Ok(())  
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.refund_and_close()?;

        Ok(())  
    }

}