using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record AnnouncementRequest(
    string Subject, string Body, List<ProspectStatus>? Statuses, string? Country);

public record AnnouncementTestRequest(string ToEmail, string Subject, string Body);

/// <summary>
/// One-off product/stock announcements to ENGAGED B2B contacts only — prospects who
/// replied, asked for samples, or became customers. Cold prospects (New/Contacted
/// without a reply) are excluded by rule: announcements to strangers are spam.
/// </summary>
[ApiController]
[Route("api/announcements")]
[Authorize]
public class AnnouncementsController(AppDbContext db, EmailService email) : ControllerBase
{
    /// <summary>Statuses an announcement may ever target.</summary>
    private static readonly ProspectStatus[] EngagedStatuses =
    [
        ProspectStatus.Replied, ProspectStatus.Interested,
        ProspectStatus.SampleSent, ProspectStatus.Won,
    ];

    /// <summary>How long the same subject is considered "already sent" to an address.</summary>
    private static readonly TimeSpan DedupeWindow = TimeSpan.FromDays(30);

    [HttpGet("audience")]
    public async Task<object> Audience([FromQuery] string? statuses, [FromQuery] string? country)
    {
        var (eligible, _) = await EligibleAsync(ParseStatuses(statuses), country);
        return new
        {
            count = eligible.Count,
            allowedStatuses = EngagedStatuses.Select(s => s.ToString()),
            sentLast24h = await email.SentTodayAsync(User.WorkspaceId()),
            dailyCap = email.DailyCap,
        };
    }

    [HttpPost("test")]
    public async Task<IActionResult> Test(AnnouncementTestRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ToEmail) || !request.ToEmail.Contains('@'))
            return BadRequest(new { error = "A valid test address is required." });
        if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Subject and body are required." });
        var (code, payload) = await email.SendTestAsync(
            User.WorkspaceId(), request.ToEmail, request.Subject, request.Body, ct);
        return StatusCode(code, payload);
    }

    [HttpPost]
    public async Task<IActionResult> Send(AnnouncementRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Subject and body are required." });
        if (request.Body.Contains('[') && request.Body.Contains(']'))
            return BadRequest(new { error = "The body still contains an unfilled [placeholder]." });

        var workspaceId = User.WorkspaceId();
        var (eligible, requested) = await EligibleAsync(request.Statuses, request.Country);
        if (requested.Length == 0)
            return BadRequest(new { error = "Statuses must be engaged ones: Replied, Interested, SampleSent, Won." });

        // Rerun-safe: skip anyone who already received this exact subject recently,
        // so hitting the daily cap today and re-sending tomorrow never double-sends.
        var since = DateTimeOffset.UtcNow - DedupeWindow;
        var subject = request.Subject.Trim();
        var alreadySent = await db.EmailLogs
            .Where(l => l.WorkspaceId == workspaceId && l.Subject == subject &&
                        l.Status == "sent" && l.CreatedAt >= since)
            .Select(l => l.ToAddress.ToLower())
            .ToListAsync(ct);
        var alreadySet = new HashSet<string>(alreadySent);

        int sent = 0, skipped = 0, blocked = 0;
        var capReached = false;
        foreach (var prospect in eligible)
        {
            if (alreadySet.Contains(prospect.Email.Trim().ToLowerInvariant()))
            {
                skipped++;
                continue;
            }
            var (code, _) = await email.SendAnnouncementAsync(
                workspaceId, prospect, subject, request.Body, ct);
            if (code == 200) sent++;
            else if (code == 429) { capReached = true; break; }
            else blocked++;
        }

        var remaining = eligible.Count - sent - skipped - blocked;
        return Ok(new
        {
            sent,
            skippedAlreadySent = skipped,
            blocked,
            capReached,
            remaining,
            note = capReached
                ? $"Daily cap hit — run the same announcement again tomorrow; the {remaining} remaining contacts won't be double-sent."
                : null,
        });
    }

    private ProspectStatus[] ParseStatuses(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return EngagedStatuses;
        var parsed = csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => Enum.TryParse<ProspectStatus>(s, true, out var v) ? v : (ProspectStatus?)null)
            .Where(v => v.HasValue)
            .Select(v => v!.Value);
        return parsed.Where(EngagedStatuses.Contains).ToArray();
    }

    private async Task<(List<Prospect> Eligible, ProspectStatus[] Requested)> EligibleAsync(
        IEnumerable<ProspectStatus>? statuses, string? country)
    {
        var requested = (statuses ?? EngagedStatuses).Where(EngagedStatuses.Contains).Distinct().ToArray();
        if (requested.Length == 0) return ([], requested);

        var workspaceId = User.WorkspaceId();
        var query = db.Prospects.Where(p =>
            p.WorkspaceId == workspaceId &&
            p.Email != "" &&
            requested.Contains(p.Status));
        if (!string.IsNullOrEmpty(country))
            query = query.Where(p => p.Country == country.ToUpper());

        var prospects = await query.OrderBy(p => p.CreatedAt).Take(1000).ToListAsync();

        var suppressed = new HashSet<string>(await db.SuppressionEntries
            .Where(s => s.WorkspaceId == workspaceId)
            .Select(s => s.Email)
            .ToListAsync());
        return (prospects.Where(p => !suppressed.Contains(p.Email.Trim().ToLowerInvariant())).ToList(),
            requested);
    }
}
