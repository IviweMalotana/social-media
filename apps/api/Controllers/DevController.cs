using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

/// <summary>
/// Demo/sandbox helpers. Enabled in Development, or anywhere with
/// Features:SandboxAccounts=true — so the live site can be exercised end-to-end
/// (compose, tailor, schedule, calendar) before any platform approvals land.
/// Publishing a demo account fails gracefully at the adapter.
/// </summary>
[ApiController]
[Route("api/dev")]
[Authorize]
public class DevController(AppDbContext db, ITokenVault vault, IHostEnvironment env, IConfiguration config) : ControllerBase
{
    [HttpPost("sandbox-accounts")]
    public async Task<IActionResult> SeedSandboxAccounts()
    {
        if (!env.IsDevelopment() && !config.GetValue("Features:SandboxAccounts", false))
            return NotFound();

        var workspaceId = User.WorkspaceId();
        var seeds = new (Platform Platform, string ExternalId, string Name)[]
        {
            (Platform.Facebook, "sandbox-page-1", "Sandbox Page"),
            (Platform.Instagram, "sandbox-ig-1", "@sandbox.shop"),
            (Platform.Pinterest, "sandbox-pin-1", "Sandbox Boards"),
            (Platform.TikTok, "sandbox-tt-1", "@sandbox.tiktok"),
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
