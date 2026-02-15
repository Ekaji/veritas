use anchor_lang::prelude::*;

declare_id!("8r7dBmeeYTYiXtACHrFSgTYcQtUySu4WA1moGaA8uXMZ");

#[program]
pub mod veritas {
    use super::*;

    pub fn initialize_trust_account(ctx: Context<InitializeTrustAccount>) -> Result<()> {
        let trust_account = &mut ctx.accounts.trust_account;
        trust_account.address = ctx.accounts.wallet.key();
        trust_account.score = 100; // Default max trust
        trust_account.last_updated = Clock::get()?.unix_timestamp;
        trust_account.flags = 0;
        Ok(())
    }

    pub fn update_score(ctx: Context<UpdateScore>, score: u8, flags: u32) -> Result<()> {
        require!(score <= 100, VeritasError::InvalidScore);

        let trust_account = &mut ctx.accounts.trust_account;
        trust_account.score = score;
        trust_account.flags = flags;
        trust_account.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTrustAccount<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 8 + 4,
        seeds = [b"trust", wallet.key().as_ref()],
        bump
    )]
    pub trust_account: Account<'info, TrustAccount>,
    
    /// CHECK: The wallet being scored. Only used for PDA derivation.
    pub wallet: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>, // Agent Authority paying for init
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateScore<'info> {
    #[account(
        mut,
        seeds = [b"trust", trust_account.address.as_ref()],
        bump
    )]
    pub trust_account: Account<'info, TrustAccount>,
    
    #[account(
        // In real app, check against config or hardcoded pubkey
        // address = AGENT_PUBKEY
    )]
    pub authority: Signer<'info>,
}

#[account]
pub struct TrustAccount {
    pub address: Pubkey,
    pub score: u8,
    pub last_updated: i64,
    pub flags: u32,
}

#[error_code]
pub enum VeritasError {
    #[msg("Score must be between 0 and 100")]
    InvalidScore,
}
