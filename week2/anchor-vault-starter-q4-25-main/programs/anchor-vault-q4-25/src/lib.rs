use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

declare_id!("2u5cG7PEVL5KdTRMWSjdwqtBVv1anE5Hvv4FGSPZVRUN");

#[program]
pub mod anchor_vault_q4_25 {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.initialize(&ctx.bumps)
    }

    // pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    //     ctx.accounts.deposit(amount)
    // }

    // pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    //     ctx.accounts.withdraw(amount)
    // }

    // pub fn close(ctx: Context<Close>) -> Result<()> {
    //     ctx.accounts.close()
    // }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        seeds = [b"state", user.key().as_ref()], 
        bump,
        space = VaultState::DISCRIMINATOR.len() + VaultState::INIT_SPACE,
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn initialize(&mut self, bumps: &InitializeBumps) -> Result<()> {
        // Get the amount of lamports needed to make the vault rent exempt
        let rent_exempt = Rent::get()?.minimum_balance(self.vault.to_account_info().data_len());

        // Transfer the rent-exempt amount from the user to the vault
        let cpi_program = self.system_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.user.to_account_info(),
            to: self.vault.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(cpi_ctx, rent_exempt)?;    // transfer a amount of sol from user to vault to make it rent exempt

        self.vault_state.vault_bump = bumps.vault;
        self.vault_state.state_bump = bumps.vault_state;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,    // jisko sols vault me deposit krne hain 
    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()], 
        bump = vault_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,     // kis vault me deposit krne hain
    #[account(
        seeds = [b"state", user.key().as_ref()],
        bump = vault_state.state_bump,
    )]
    pub vault_state: Account<'info, VaultState>,    // validate through the seeds and bumps ki sahi jagah pauche ki nhi 
    pub system_program: Program<'info, System>,     // jaha signer hoga waha system program chahiye
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let cpi_program = self.system_program.to_account_info();

        let cpi_accounts = Transfer {
            from: self.user.to_account_info(),
            to: self.vault.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
TODO: Implement Withdraw accounts
}

impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self, _amount: u64) -> Result<()> {
        TODO: Implement withdraw

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Close<'info> {
     TODO: Implement Close accounts
}

impl<'info> Close<'info> {
    pub fn close(&mut self) -> Result<()> {
         TODO: Implement close
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault-state", signer.key().as_ref()],
        bump = vault_state.state_bump,
        close = signer
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()],
        bump = vault_state.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,

}

impl<'info> Close<'info> {
    pub fn close(&mut self) -> Result<()> {
        let cpi_program = self.system_program.to_account_info();

        let cpi_account = Transfer {
            from: self.vault.to_account_info(),
            to: self.signer.to_account_info(),
        };

        let pda_signer_seeds = [
            b"vault",
            self.vault_state.to_account_info().key.as_ref(),
            &[self.vault_state.vault_bump]
        ];

        let signer_seeds = &[&pda_signer_seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_account, signer_seeds);

        transfer(cpi_ctx, self.vault.lamports())?;

        Ok(())
    }
}


#[derive(InitSpace)]
#[account]
pub struct VaultState {
    pub vault_bump: u8,
    pub state_bump: u8,
}
