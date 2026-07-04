using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Controllers;

public record ConnectedAccountDto(
    Guid Id, Platform Platform, string ExternalId, string DisplayName,
    string? AvatarUrl, AccountHealth Health, DateTimeOffset ConnectedAt);

[ApiController]
[Route("api/connections")]
[Authorize]
public class ConnectionsController(
    AppDbContext db,
    AdapterRegistry adapters,
    ITokenVault vault,
    IConfiguration config,
    ILogger<ConnectionsController> logger) : ControllerBase
{
    private string ApiBaseUrl => (config["App:BaseUrl"] ?? "http://localhost:5128").TrimEnd('/');
    private string WebOrigin => (config["App:WebOrigin"] ?? "http://localhost:5173").TrimEnd('/');

    [HttpGet]
    public async Task<IReadOnlyList<ConnectedAccountDto>> List()
    {
        var workspaceId = User.WorkspaceId();
        return await db.ConnectedAccounts
            .Where(a => a.WorkspaceId == workspaceId)
            .OrderBy(a => a.Platform).ThenBy(a => a.DisplayName)
            .Select(a => new ConnectedAccountDto(
                a.Id, a.Platform, a.ExternalId, a.DisplayName, a.AvatarUrl, a.Health, a.ConnectedAt))
            .ToListAsync();
    }

    /// <summary>Start OAuth: persists a CSRF state and returns the authorization URL.</summary>
    [HttpGet("connect/{platform}")]
    public async Task<ActionResult<object>> Connect(Platform platform)
    {
        var workspaceId = User.WorkspaceId();
        var state = new OAuthState
        {
            Id = Guid.NewGuid().ToString("N"),
            WorkspaceId = workspaceId,
            Platform = platform,
        };
        db.OAuthStates.Add(state);
        await db.SaveChangesAsync();

        var url = adapters.For(platform).GetAuthorizationUrl(
            new ConnectContext(workspaceId, RedirectUri(platform), state.Id));
        return new { authorizationUrl = url, state = state.Id };
    }

    /// <summary>
    /// OAuth callback: validates state, exchanges the code, and upserts every account
    /// the grant covers (Meta returns all managed Pages / IG accounts in one grant).
    /// </summary>
    [HttpGet("callback/{platform}")]
    [AllowAnonymous] // platform redirects arrive without our bearer token; state ties back to the workspace
    public async Task<IActionResult> Callback(
        Platform platform,
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        [FromQuery(Name = "error_description")] string? errorDescription)
    {
        if (!string.IsNullOrEmpty(error))
            return WebRedirect($"error={Uri.EscapeDataString(errorDescription ?? error)}");
        if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
            return WebRedirect("error=Missing%20code%20or%20state");

        // Consume the state — single use, bound to workspace + platform, time-boxed.
        var stored = await db.OAuthStates.FirstOrDefaultAsync(s => s.Id == state && s.Platform == platform);
        if (stored is null || stored.ExpiresAt < DateTimeOffset.UtcNow)
            return WebRedirect("error=Connection%20request%20expired%20—%20please%20try%20again");
        db.OAuthStates.Remove(stored);
        await db.SaveChangesAsync();

        IReadOnlyList<ConnectionResult> results;
        try
        {
            results = await adapters.For(platform).CompleteConnectionAsync(
                code, new ConnectContext(stored.WorkspaceId, RedirectUri(platform), state));
        }
        catch (NotImplementedException ex)
        {
            return WebRedirect($"error={Uri.EscapeDataString(ex.Message)}");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "OAuth completion failed for {Platform}.", platform);
            return WebRedirect($"error={Uri.EscapeDataString(ex.Message)}");
        }

        if (results.Count == 0)
            return WebRedirect($"error={Uri.EscapeDataString($"No connectable {platform} accounts found on this profile.")}");

        foreach (var result in results)
        {
            var existing = await db.ConnectedAccounts.FirstOrDefaultAsync(a =>
                a.WorkspaceId == stored.WorkspaceId &&
                a.Platform == platform &&
                a.ExternalId == result.ExternalId);

            if (existing is null)
            {
                db.ConnectedAccounts.Add(new ConnectedAccount
                {
                    WorkspaceId = stored.WorkspaceId,
                    Platform = platform,
                    ExternalId = result.ExternalId,
                    DisplayName = result.DisplayName,
                    AvatarUrl = result.AvatarUrl,
                    EncryptedAccessToken = vault.Encrypt(result.AccessToken),
                    EncryptedRefreshToken = result.RefreshToken is null ? null : vault.Encrypt(result.RefreshToken),
                    TokenExpiresAt = result.ExpiresAt,
                    Scopes = result.Scopes,
                });
            }
            else
            {
                // Reconnect: refresh tokens and identity, clear stale health flags.
                existing.DisplayName = result.DisplayName;
                existing.AvatarUrl = result.AvatarUrl;
                existing.EncryptedAccessToken = vault.Encrypt(result.AccessToken);
                existing.EncryptedRefreshToken = result.RefreshToken is null ? null : vault.Encrypt(result.RefreshToken);
                existing.TokenExpiresAt = result.ExpiresAt;
                existing.Scopes = result.Scopes;
                existing.Health = AccountHealth.Healthy;
            }
        }
        await db.SaveChangesAsync();

        return WebRedirect($"connected={platform}&accounts={results.Count}");
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Disconnect(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var account = await db.ConnectedAccounts
            .FirstOrDefaultAsync(a => a.Id == id && a.WorkspaceId == workspaceId);
        if (account is null) return NotFound();

        db.ConnectedAccounts.Remove(account);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private string RedirectUri(Platform platform) => $"{ApiBaseUrl}/api/connections/callback/{platform}";

    private RedirectResult WebRedirect(string query) => Redirect($"{WebOrigin}/connections?{query}");
}
