use anchor_lang::prelude::*;
use veritas::program::Veritas;
use veritas::cpi::accounts::UpdateScore; // Example if we were CPI-ing into Veritas, but we are reading efficiently

declare_id!("7dr4ztcm3UKiBxgbmKPxE7uiXxag28g69ib2exu7XuRU");

#[program]
pub mod airdrop_guard {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, min_score: u8) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.min_score_required = min_score;
        config.treasury = ctx.accounts.treasury.key();
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let trust_account = &ctx.accounts.trust_account;
        let config = &ctx.accounts.config;

        // 1. Verify Trust Score
        require!(
            trust_account.score >= config.min_score_required,
            AirdropError::LowTrustScore
        );

        // 2. Transfer SOL
        let amount = 100_000_000; // 0.1 SOL for demo
        
        // Manual SOL transfer via System Program
        let treasury = &ctx.accounts.treasury;
        let claimer = &ctx.accounts.claimer;
        
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &treasury.key(),
            &claimer.key(),
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                treasury.to_account_info(),
                claimer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 1 + 32)]
    pub config: Account<'info, AirdropConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Safe treasury
    pub treasury: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    
    #[account(
        seeds = [b"trust", claimer.key().as_ref()],
        bump,
        seeds::program = veritas_program.key()
    )]
    pub trust_account: Account<'info, veritas::TrustAccount>,
    
    #[account(has_one = treasury)]
    pub config: Account<'info, AirdropConfig>,
    
    #[account(mut)]
    pub treasury: Signer<'info>, // Treasury must sign or use PDA (simpler with signer for demo)
    
    pub veritas_program: Program<'info, Veritas>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct AirdropConfig {
    pub authority: Pubkey,
    pub min_score_required: u8,
    pub treasury: Pubkey,
}

#[error_code]
pub enum AirdropError {
    #[msg("Trust score too low for airdrop")]
    LowTrustScore,
}
