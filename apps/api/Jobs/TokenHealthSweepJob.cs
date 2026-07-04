using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Jobs;

/// <summary>
/// Recurring job (hourly): refreshes tokens that support it before they expire
/// (TikTok lives 24h, Pinterest ~30d), then validates health flags so the UI can
/// prompt a reconnect before publishing ever hits a dead token.
/// </summary>
public class TokenHealthSweepJob(
    AppDbContext db,
    AdapterRegistry adapters,
    ITokenVault vault,
    ILogger<TokenHealthSweepJob> logger)
{
    public async Task RunAsync()
    {
        var refreshWindow = DateTimeOffset.UtcNow.AddHours(12);
        var expiringSoon = DateTimeOffset.UtcNow.AddDays(7);
        var accounts = await db.ConnectedAccounts
            .Where(a => a.Health != AccountHealth.Revoked)
            .ToListAsync();

        foreach (var account in accounts)
        {
            var adapter = adapters.For(account.Platform);

            // Refresh first when the token is inside the refresh window and we can.
            if (account.TokenExpiresAt is { } expiry &&
                expiry <= refreshWindow &&
                account.EncryptedRefreshToken is { } encryptedRefresh)
            {
                try
                {
                    var refreshed = await adapter.RefreshTokenAsync(
                        account, vault.Decrypt(encryptedRefresh));
                    if (refreshed is not null)
                    {
                        account.EncryptedAccessToken = vault.Encrypt(refreshed.AccessToken);
                        account.EncryptedRefreshToken = refreshed.RefreshToken is null
                            ? account.EncryptedRefreshToken
                            : vault.Encrypt(refreshed.RefreshToken);
                        account.TokenExpiresAt = refreshed.ExpiresAt;
                        account.Health = AccountHealth.Healthy;
                        logger.LogInformation("Refreshed token for {Platform} account {Id}.",
                            account.Platform, account.Id);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Token refresh failed for account {Id} ({Platform}).",
                        account.Id, account.Platform);
                }
            }

            if (account.TokenExpiresAt is { } exp)
            {
                account.Health = exp <= DateTimeOffset.UtcNow ? AccountHealth.Expired
                    : exp <= expiringSoon ? AccountHealth.ExpiringSoon
                    : AccountHealth.Healthy;
            }

            try
            {
                var health = await adapter.ValidateTokenAsync(
                    account, vault.Decrypt(account.EncryptedAccessToken));
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
