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
    IConfiguration config) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<ConnectedAccountDto>> List()
    {
        var workspaceId = User.WorkspaceId();
        return await db.ConnectedAccounts
            .Where(a => a.WorkspaceId == workspaceId)
            .OrderBy(a => a.Platform)
            .Select(a => new ConnectedAccountDto(
                a.Id, a.Platform, a.ExternalId, a.DisplayName, a.AvatarUrl, a.Health, a.ConnectedAt))
            .ToListAsync();
    }

    /// <summary>Start OAuth: returns the platform authorization URL to redirect the user to.</summary>
    [HttpGet("connect/{platform}")]
    public ActionResult<object> Connect(Platform platform)
    {
        var workspaceId = User.WorkspaceId();
        var state = Guid.NewGuid().ToString("N"); // CSRF token; persisted server-side in Phase 1
        var redirectUri = $"{config["App:BaseUrl"] ?? "http://localhost:5000"}/api/connections/callback/{platform}";
        var url = adapters.For(platform).GetAuthorizationUrl(new ConnectContext(workspaceId, redirectUri, state));
        return new { authorizationUrl = url, state };
    }

    /// <summary>OAuth callback: exchanges the code and stores the account with encrypted tokens.</summary>
    [HttpGet("callback/{platform}")]
    [AllowAnonymous] // platform redirects arrive without our bearer token; state ties back to the workspace
    public async Task<IActionResult> Callback(Platform platform, [FromQuery] string code, [FromQuery] string state)
    {
        // Phase 1 completes this flow per platform: validate state, exchange the code,
        // then persist. The persistence path below is final.
        var adapter = adapters.For(platform);
        var redirectUri = $"{config["App:BaseUrl"] ?? "http://localhost:5000"}/api/connections/callback/{platform}";

        ConnectionResult result;
        try
        {
            result = await adapter.CompleteConnectionAsync(
                code, new ConnectContext(Guid.Empty, redirectUri, state));
        }
        catch (NotImplementedException ex)
        {
            return StatusCode(501, new { error = ex.Message });
        }

        var account = new ConnectedAccount
        {
            WorkspaceId = Guid.Empty, // resolved from persisted state in Phase 1
            Platform = platform,
            ExternalId = result.ExternalId,
            DisplayName = result.DisplayName,
            AvatarUrl = result.AvatarUrl,
            EncryptedAccessToken = vault.Encrypt(result.AccessToken),
            EncryptedRefreshToken = result.RefreshToken is null ? null : vault.Encrypt(result.RefreshToken),
            TokenExpiresAt = result.ExpiresAt,
            Scopes = result.Scopes,
        };
        db.ConnectedAccounts.Add(account);
        await db.SaveChangesAsync();
        return Redirect("/connections?connected=" + platform);
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
}
