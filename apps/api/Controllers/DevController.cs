using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

/// <summary>
/// Development-only helpers (404 outside Development). Sandbox accounts let the
/// composer, calendar, and publish pipeline be exercised before the platform app
/// approvals land — publishing a sandbox account fails gracefully at the adapter,
/// which is itself a useful path to see in the UI.
/// </summary>
[ApiController]
[Route("api/dev")]
[Authorize]
public class DevController(AppDbContext db, ITokenVault vault, IHostEnvironment env) : ControllerBase
{
    [HttpPost("sandbox-accounts")]
    public async Task<IActionResult> SeedSandboxAccounts()
    {
        if (!env.IsDevelopment()) return NotFound();

        var workspaceId = User.WorkspaceId();
        var seeds = new (Platform Platform, string ExternalId, string Name)[]
        {
            (Platform.Facebook, "sandbox-page-1", "Sandbox Page"),
            (Platform.Instagram, "sandbox-ig-1", "@sandbox.shop"),
            (Platform.Pinterest, "sandbox-pin-1", "Sandbox Boards"),
        };

        var created = 0;
        foreach (var seed in seeds)
        {
            var exists = await db.ConnectedAccounts.AnyAsync(a =>
                a.WorkspaceId == workspaceId && a.Platform == seed.Platform && a.ExternalId == seed.ExternalId);
            if (exists) continue;

            db.ConnectedAccounts.Add(new ConnectedAccount
            {
                WorkspaceId = workspaceId,
                Platform = seed.Platform,
                ExternalId = seed.ExternalId,
                DisplayName = seed.Name,
                EncryptedAccessToken = vault.Encrypt("sandbox-token"),
                Scopes = "sandbox",
            });
            created++;
        }
        await db.SaveChangesAsync();
        return Ok(new { created });
    }
}
