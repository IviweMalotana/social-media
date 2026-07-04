using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Jobs;

/// <summary>
/// Recurring job: flags accounts whose tokens are near expiry and asks each adapter to
/// validate/refresh. Runs hourly (registered in Program.cs).
/// </summary>
public class TokenHealthSweepJob(
    AppDbContext db,
    AdapterRegistry adapters,
    ITokenVault vault,
    ILogger<TokenHealthSweepJob> logger)
{
    public async Task RunAsync()
    {
        var soon = DateTimeOffset.UtcNow.AddDays(7);
        var accounts = await db.ConnectedAccounts
            .Where(a => a.Health != AccountHealth.Revoked)
            .ToListAsync();

        foreach (var account in accounts)
        {
            if (account.TokenExpiresAt is { } expiry)
            {
                account.Health = expiry <= DateTimeOffset.UtcNow ? AccountHealth.Expired
                    : expiry <= soon ? AccountHealth.ExpiringSoon
                    : AccountHealth.Healthy;
            }

            try
            {
                var adapter = adapters.For(account.Platform);
                var token = vault.Decrypt(account.EncryptedAccessToken);
                var health = await adapter.ValidateTokenAsync(account, token);
                account.Health = health.Health;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Token validation failed for account {Id} ({Platform}).",
                    account.Id, account.Platform);
            }
        }

        await db.SaveChangesAsync();
    }
}
