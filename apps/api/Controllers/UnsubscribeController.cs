using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

/// <summary>
/// Public unsubscribe endpoint reached from email footers and the RFC 8058
/// List-Unsubscribe-Post header. Token-based, no auth — it must work for anyone.
/// </summary>
[ApiController]
public class UnsubscribeController(AppDbContext db) : ControllerBase
{
    private const string Page = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Unsubscribed</title>
        <body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#222">
        <h1 style="font-size:22px">You're unsubscribed.</h1>
        <p>You won't hear from us again. If this was a mistake, just reply to any of our
        earlier emails and we'll add you back.</p>
        <p style="color:#888">Be Different Packaging</p>
        """;

    [HttpGet("/api/unsubscribe/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(string token)
    {
        await ProcessAsync(token);
        // Same page whether or not the token matched — no probing for valid tokens.
        return Content(Page, "text/html");
    }

    /// <summary>One-click unsubscribe target (mail clients POST here, no body needed).</summary>
    [HttpPost("/api/unsubscribe/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> Post(string token)
    {
        await ProcessAsync(token);
        return Ok();
    }

    private async Task ProcessAsync(string token)
    {
        var prospect = await db.Prospects.FirstOrDefaultAsync(p => p.UnsubscribeToken == token);
        if (prospect is null) return;

        prospect.Status = ProspectStatus.OptedOut;
        prospect.NextFollowUpAt = null;

        var email = prospect.Email.Trim().ToLowerInvariant();
        if (email != "" && !await db.SuppressionEntries.AnyAsync(s =>
                s.WorkspaceId == prospect.WorkspaceId && s.Email == email))
            db.SuppressionEntries.Add(new SuppressionEntry
            {
                WorkspaceId = prospect.WorkspaceId,
                Email = email,
                Reason = "unsubscribed",
            });

        // Stop every campaign they're in and pull their queued drafts.
        var enrollments = await db.Enrollments
            .Where(e => e.ProspectId == prospect.Id && e.Status == EnrollmentStatus.Active)
            .ToListAsync();
        foreach (var enrollment in enrollments)
        {
            enrollment.Status = EnrollmentStatus.Suppressed;
            enrollment.NextSendAt = null;
        }
        var pending = await db.CampaignMessages
            .Where(m => m.ProspectId == prospect.Id &&
                        (m.Status == MessageStatus.Drafted || m.Status == MessageStatus.Approved))
            .ToListAsync();
        foreach (var message in pending)
        {
            message.Status = MessageStatus.Rejected;
            message.Error = "Prospect unsubscribed.";
        }

        await db.SaveChangesAsync();
    }
}

public record AddSuppressionRequest(string Email, string? Reason);

/// <summary>The do-not-contact list — every send checks it, nothing bypasses it.</summary>
[ApiController]
[Route("api/suppressions")]
[Authorize]
public class SuppressionsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List()
    {
        var workspaceId = User.WorkspaceId();
        return await db.SuppressionEntries
            .Where(s => s.WorkspaceId == workspaceId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(200)
            .Select(s => new { s.Id, s.Email, s.Reason, s.CreatedAt })
            .ToListAsync();
    }

    [HttpPost]
    public async Task<IActionResult> Add(AddSuppressionRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (email == "" || !email.Contains('@'))
            return BadRequest(new { error = "A valid email address is required." });
        var workspaceId = User.WorkspaceId();
        if (await db.SuppressionEntries.AnyAsync(s => s.WorkspaceId == workspaceId && s.Email == email))
            return Conflict(new { error = "Already on the suppression list." });
        db.SuppressionEntries.Add(new SuppressionEntry
        {
            WorkspaceId = workspaceId,
            Email = email,
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? "manual" : request.Reason.Trim(),
        });
        await db.SaveChangesAsync();
        return Ok(new { added = email });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Remove(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var entry = await db.SuppressionEntries
            .FirstOrDefaultAsync(s => s.Id == id && s.WorkspaceId == workspaceId);
        if (entry is null) return NotFound();
        db.SuppressionEntries.Remove(entry);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
