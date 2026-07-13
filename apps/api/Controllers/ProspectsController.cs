using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record SendProspectEmailRequest(string Subject, string Body);

public record ProspectDto(
    Guid Id, string CompanyName, string ContactName, string Email, string Segment,
    string City, string Country, ProspectStatus Status, int EmailsSent, bool HasReplied,
    decimal MonthlyValue, DateTimeOffset? LastContactedAt, DateTimeOffset? NextFollowUpAt,
    string? Notes);

public record CreateProspectRequest(
    string CompanyName, string? ContactName, string? Email, string? Segment,
    string? City, string? Country, string? Notes);

public record UpdateProspectRequest(
    ProspectStatus? Status, decimal? MonthlyValue, string? Notes,
    string? ContactName, string? Email, DateTimeOffset? NextFollowUpAt);

public record OutreachStats(
    int Total, int Contacted, int Replies, decimal ReplyRatePercent,
    int Interested, int Won, decimal RecurringMonthlyRevenue, int EmailsSent,
    int DueFollowUps);

[ApiController]
[Route("api/prospects")]
[Authorize]
public class ProspectsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<ProspectDto>> List([FromQuery] ProspectStatus? status)
    {
        var workspaceId = User.WorkspaceId();
        var query = db.Prospects.Where(p => p.WorkspaceId == workspaceId);
        if (status is { } s) query = query.Where(p => p.Status == s);
        var prospects = await query
            .OrderBy(p => p.NextFollowUpAt == null)
            .ThenBy(p => p.NextFollowUpAt)
            .ThenByDescending(p => p.CreatedAt)
            .Take(1000)
            .ToListAsync();
        return prospects.Select(ToDto).ToList();
    }

    [HttpGet("stats")]
    public async Task<OutreachStats> Stats()
    {
        var workspaceId = User.WorkspaceId();
        var all = await db.Prospects.Where(p => p.WorkspaceId == workspaceId).ToListAsync();
        var contacted = all.Count(p => p.EmailsSent > 0);
        var replies = all.Count(p => p.HasReplied);
        var now = DateTimeOffset.UtcNow;
        return new OutreachStats(
            Total: all.Count,
            Contacted: contacted,
            Replies: replies,
            ReplyRatePercent: contacted == 0 ? 0 : Math.Round(replies * 100m / contacted, 1),
            Interested: all.Count(p => p.Status is ProspectStatus.Interested or ProspectStatus.SampleSent),
            Won: all.Count(p => p.Status == ProspectStatus.Won),
            RecurringMonthlyRevenue: all.Where(p => p.Status == ProspectStatus.Won).Sum(p => p.MonthlyValue),
            EmailsSent: all.Sum(p => p.EmailsSent),
            DueFollowUps: all.Count(p =>
                p.NextFollowUpAt <= now &&
                p.Status is ProspectStatus.New or ProspectStatus.Contacted or ProspectStatus.Replied
                    or ProspectStatus.Interested or ProspectStatus.SampleSent));
    }

    [HttpPost]
    public async Task<ActionResult<ProspectDto>> Create(CreateProspectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CompanyName))
            return BadRequest(new { error = "Company name is required." });
        var prospect = NewProspect(User.WorkspaceId(), request);
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        return ToDto(prospect);
    }

    /// <summary>Bulk import — rows from an Apollo/Hunter CSV export, deduped by email.</summary>
    [HttpPost("bulk")]
    public async Task<ActionResult<object>> Bulk(List<CreateProspectRequest> rows)
    {
        var workspaceId = User.WorkspaceId();
        var existingEmails = await db.Prospects
            .Where(p => p.WorkspaceId == workspaceId && p.Email != "")
            .Select(p => p.Email.ToLower())
            .ToListAsync();
        var seen = new HashSet<string>(existingEmails);

        var created = 0;
        foreach (var row in rows.Where(r => !string.IsNullOrWhiteSpace(r.CompanyName)))
        {
            var email = row.Email?.Trim().ToLowerInvariant() ?? "";
            if (email != "" && !seen.Add(email)) continue; // dedupe
            db.Prospects.Add(NewProspect(workspaceId, row));
            created++;
        }
        await db.SaveChangesAsync();
        return new { created, skipped = rows.Count - created };
    }

    /// <summary>
    /// Record that an outreach email went out (from the sending tool): bumps the
    /// counter, stamps last-contacted, schedules the follow-up 3 days out per the
    /// 3-emails-3-days-apart cadence, and clears follow-up after the final email.
    /// </summary>
    [HttpPost("{id:guid}/log-email")]
    public async Task<ActionResult<ProspectDto>> LogEmail(Guid id)
    {
        var prospect = await FindAsync(id);
        if (prospect is null) return NotFound();

        prospect.EmailsSent++;
        prospect.LastContactedAt = DateTimeOffset.UtcNow;
        prospect.NextFollowUpAt = prospect.EmailsSent >= 3
            ? null // sequence complete — stop per playbook
            : DateTimeOffset.UtcNow.AddDays(prospect.EmailsSent == 1 ? 3 : 4);
        if (prospect.Status == ProspectStatus.New) prospect.Status = ProspectStatus.Contacted;
        await db.SaveChangesAsync();
        return ToDto(prospect);
    }

    /// <summary>
    /// Sends the outreach email directly via the configured transport (Resend HTTPS).
    /// Applies the compliance footer, daily cap, opt-out suppression, and the same
    /// cadence bookkeeping as log-email.
    /// </summary>
    [HttpPost("{id:guid}/send-email")]
    public async Task<IActionResult> SendEmail(
        Guid id, SendProspectEmailRequest request, [FromServices] EmailService email, CancellationToken ct)
    {
        var prospect = await FindAsync(id);
        if (prospect is null) return NotFound();

        var (code, payload) = await email.SendToProspectAsync(
            User.WorkspaceId(), prospect, request.Subject, request.Body, ct);
        return StatusCode(code, payload);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<ProspectDto>> Update(Guid id, UpdateProspectRequest request)
    {
        var prospect = await FindAsync(id);
        if (prospect is null) return NotFound();

        if (request.Status is { } status)
        {
            prospect.Status = status;
            if (status is ProspectStatus.Replied or ProspectStatus.Interested
                or ProspectStatus.SampleSent or ProspectStatus.Won)
                prospect.HasReplied = true;
            if (status is ProspectStatus.Won or ProspectStatus.Lost or ProspectStatus.OptedOut)
                prospect.NextFollowUpAt = null;
        }
        if (request.MonthlyValue is { } value) prospect.MonthlyValue = value;
        if (request.Notes is not null) prospect.Notes = request.Notes;
        if (request.ContactName is not null) prospect.ContactName = request.ContactName;
        if (request.Email is not null) prospect.Email = request.Email.Trim();
        if (request.NextFollowUpAt is { } next) prospect.NextFollowUpAt = next;
        await db.SaveChangesAsync();
        return ToDto(prospect);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var prospect = await FindAsync(id);
        if (prospect is null) return NotFound();
        db.Prospects.Remove(prospect);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<Prospect?> FindAsync(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        return await db.Prospects.FirstOrDefaultAsync(p => p.Id == id && p.WorkspaceId == workspaceId);
    }

    private static Prospect NewProspect(Guid workspaceId, CreateProspectRequest request) => new()
    {
        WorkspaceId = workspaceId,
        CompanyName = request.CompanyName.Trim(),
        ContactName = request.ContactName?.Trim() ?? "",
        Email = request.Email?.Trim() ?? "",
        Segment = string.IsNullOrWhiteSpace(request.Segment) ? "hotel" : request.Segment.Trim().ToLowerInvariant(),
        City = request.City?.Trim() ?? "",
        Country = string.IsNullOrWhiteSpace(request.Country) ? "ZA" : request.Country.Trim().ToUpperInvariant(),
        Notes = request.Notes,
    };

    private static ProspectDto ToDto(Prospect p) => new(
        p.Id, p.CompanyName, p.ContactName, p.Email, p.Segment, p.City, p.Country,
        p.Status, p.EmailsSent, p.HasReplied, p.MonthlyValue,
        p.LastContactedAt, p.NextFollowUpAt, p.Notes);
}
