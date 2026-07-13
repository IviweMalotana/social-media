using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record StepInput(int DelayDays, string Subject, string Body);

public record CreateCampaignRequest(
    string Name, string? Segment, string? Country, List<StepInput> Steps);

public record UpdateCampaignRequest(CampaignStatus? Status, string? Name);

public record EnrollRequest(List<Guid>? ProspectIds);

public record GenerateDraftsRequest(bool UseAi);

public record UpdateMessageRequest(string? Subject, string? Body, string? Action);

public record CampaignSummary(
    Guid Id, string Name, string Segment, string Country, CampaignStatus Status,
    string SendWindow, int StepCount, int Enrolled, int ActiveEnrollments,
    int DraftedCount, int ApprovedCount, int SentCount, DateTimeOffset CreatedAt);

[ApiController]
[Route("api/campaigns")]
[Authorize]
public class CampaignsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<CampaignSummary>> List()
    {
        var workspaceId = User.WorkspaceId();
        var campaigns = await db.Campaigns
            .Where(c => c.WorkspaceId == workspaceId)
            .Include(c => c.Steps)
            .Include(c => c.Enrollments)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();
        var messages = await db.CampaignMessages
            .Where(m => m.WorkspaceId == workspaceId)
            .GroupBy(m => new { m.CampaignId, m.Status })
            .Select(g => new { g.Key.CampaignId, g.Key.Status, Count = g.Count() })
            .ToListAsync();

        return campaigns.Select(c => new CampaignSummary(
            c.Id, c.Name, c.Segment, c.Country, c.Status,
            SendWindows.Describe(c.Country),
            c.Steps.Count,
            c.Enrollments.Count,
            c.Enrollments.Count(e => e.Status == EnrollmentStatus.Active),
            messages.FirstOrDefault(m => m.CampaignId == c.Id && m.Status == MessageStatus.Drafted)?.Count ?? 0,
            messages.FirstOrDefault(m => m.CampaignId == c.Id && m.Status == MessageStatus.Approved)?.Count ?? 0,
            messages.FirstOrDefault(m => m.CampaignId == c.Id && m.Status == MessageStatus.Sent)?.Count ?? 0,
            c.CreatedAt)).ToList();
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateCampaignRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Campaign name is required." });
        if (request.Steps is not { Count: > 0 })
            return BadRequest(new { error = "A campaign needs at least one sequence step." });
        if (request.Steps.Any(s => string.IsNullOrWhiteSpace(s.Subject) || string.IsNullOrWhiteSpace(s.Body)))
            return BadRequest(new { error = "Every step needs a subject and a body." });

        var campaign = new Campaign
        {
            WorkspaceId = User.WorkspaceId(),
            Name = request.Name.Trim(),
            Segment = string.IsNullOrWhiteSpace(request.Segment) ? "hotel" : request.Segment.Trim().ToLowerInvariant(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? "ZA" : request.Country.Trim().ToUpperInvariant(),
            Steps = request.Steps.Select((s, i) => new SequenceStep
            {
                StepNumber = i + 1,
                DelayDays = Math.Max(0, s.DelayDays),
                Subject = s.Subject.Trim(),
                Body = s.Body.Trim(),
            }).ToList(),
        };
        db.Campaigns.Add(campaign);
        await db.SaveChangesAsync();
        return Ok(new { campaign.Id });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var campaign = await FindAsync(id, includeSteps: true);
        if (campaign is null) return NotFound();

        var enrollments = await db.Enrollments
            .Where(e => e.CampaignId == id)
            .Include(e => e.Prospect)
            .OrderBy(e => e.EnrolledAt)
            .Take(500)
            .ToListAsync();

        return Ok(new
        {
            campaign.Id,
            campaign.Name,
            campaign.Segment,
            campaign.Country,
            campaign.Status,
            sendWindow = SendWindows.Describe(campaign.Country),
            windowOpenNow = SendWindows.IsOpen(campaign.Country, DateTimeOffset.UtcNow),
            steps = campaign.Steps.OrderBy(s => s.StepNumber)
                .Select(s => new { s.Id, s.StepNumber, s.DelayDays, s.Subject, s.Body }),
            enrollments = enrollments.Select(e => new
            {
                e.Id,
                e.ProspectId,
                company = e.Prospect?.CompanyName ?? "(deleted)",
                contact = e.Prospect?.ContactName ?? "",
                email = e.Prospect?.Email ?? "",
                e.Status,
                e.CurrentStep,
                e.NextSendAt,
            }),
        });
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateCampaignRequest request)
    {
        var campaign = await FindAsync(id, includeSteps: true);
        if (campaign is null) return NotFound();

        if (request.Name is { Length: > 0 } name) campaign.Name = name.Trim();
        if (request.Status is { } status)
        {
            if (status == CampaignStatus.Active && campaign.Steps.Count == 0)
                return BadRequest(new { error = "Add sequence steps before activating." });
            campaign.Status = status;
        }
        await db.SaveChangesAsync();
        return Ok(new { campaign.Id, campaign.Status });
    }

    /// <summary>Replaces the sequence — only while the campaign is still a Draft.</summary>
    [HttpPut("{id:guid}/steps")]
    public async Task<IActionResult> ReplaceSteps(Guid id, List<StepInput> steps)
    {
        var campaign = await FindAsync(id, includeSteps: true);
        if (campaign is null) return NotFound();
        if (campaign.Status != CampaignStatus.Draft)
            return Conflict(new { error = "Steps are locked once a campaign leaves Draft — pause won't unlock them; create a new campaign to change copy." });
        if (steps is not { Count: > 0 } ||
            steps.Any(s => string.IsNullOrWhiteSpace(s.Subject) || string.IsNullOrWhiteSpace(s.Body)))
            return BadRequest(new { error = "Every step needs a subject and a body." });

        db.SequenceSteps.RemoveRange(campaign.Steps);
        campaign.Steps = steps.Select((s, i) => new SequenceStep
        {
            CampaignId = id,
            StepNumber = i + 1,
            DelayDays = Math.Max(0, s.DelayDays),
            Subject = s.Subject.Trim(),
            Body = s.Body.Trim(),
        }).ToList();
        await db.SaveChangesAsync();
        return Ok(new { count = campaign.Steps.Count });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var campaign = await FindAsync(id);
        if (campaign is null) return NotFound();
        var messages = await db.CampaignMessages.Where(m => m.CampaignId == id).ToListAsync();
        db.CampaignMessages.RemoveRange(messages);
        db.Campaigns.Remove(campaign); // steps + enrollments cascade
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Enrolls prospects. With no explicit ids: every prospect in the campaign's
    /// segment + market who is New/Contacted, has an email, isn't suppressed or opted
    /// out, and isn't already enrolled.
    /// </summary>
    [HttpPost("{id:guid}/enroll")]
    public async Task<IActionResult> Enroll(Guid id, EnrollRequest request)
    {
        var workspaceId = User.WorkspaceId();
        var campaign = await FindAsync(id, includeSteps: true);
        if (campaign is null) return NotFound();
        if (campaign.Steps.Count == 0)
            return BadRequest(new { error = "Add sequence steps before enrolling prospects." });

        var alreadyEnrolled = await db.Enrollments
            .Where(e => e.CampaignId == id)
            .Select(e => e.ProspectId)
            .ToListAsync();
        var suppressed = await db.SuppressionEntries
            .Where(s => s.WorkspaceId == workspaceId)
            .Select(s => s.Email)
            .ToListAsync();
        var suppressedSet = new HashSet<string>(suppressed);

        var query = db.Prospects.Where(p =>
            p.WorkspaceId == workspaceId &&
            p.Email != "" &&
            p.Status != ProspectStatus.OptedOut &&
            !alreadyEnrolled.Contains(p.Id));
        query = request.ProspectIds is { Count: > 0 } ids
            ? query.Where(p => ids.Contains(p.Id))
            : query.Where(p =>
                p.Segment == campaign.Segment &&
                p.Country == campaign.Country &&
                (p.Status == ProspectStatus.New || p.Status == ProspectStatus.Contacted) &&
                p.EmailsSent == 0);

        var prospects = await query.Take(500).ToListAsync();
        var firstStep = campaign.Steps.OrderBy(s => s.StepNumber).First();
        var now = DateTimeOffset.UtcNow;
        var enrolled = 0;
        foreach (var prospect in prospects)
        {
            if (suppressedSet.Contains(prospect.Email.Trim().ToLowerInvariant())) continue;
            db.Enrollments.Add(new Enrollment
            {
                CampaignId = id,
                ProspectId = prospect.Id,
                NextSendAt = now.AddDays(firstStep.DelayDays),
            });
            enrolled++;
        }
        await db.SaveChangesAsync();
        return Ok(new { enrolled });
    }

    /// <summary>
    /// Drafts the next-step email for every active enrollment that doesn't have one
    /// yet. Optionally personalizes with Claude (facts-only). Everything created here
    /// is Drafted — a human must approve each message before the engine will send it.
    /// </summary>
    [HttpPost("{id:guid}/generate-drafts")]
    public async Task<IActionResult> GenerateDrafts(
        Guid id, GenerateDraftsRequest request,
        [FromServices] ContentGenerator generator, CancellationToken ct)
    {
        var workspaceId = User.WorkspaceId();
        var campaign = await FindAsync(id, includeSteps: true);
        if (campaign is null) return NotFound();
        if (request.UseAi && !generator.IsConfigured)
            return StatusCode(503, new { error = "AI drafting needs Anthropic__ApiKey on the API service. Uncheck AI to use plain template merge." });

        var steps = campaign.Steps.OrderBy(s => s.StepNumber).ToList();
        var enrollments = await db.Enrollments
            .Where(e => e.CampaignId == id && e.Status == EnrollmentStatus.Active)
            .Include(e => e.Prospect)
            .ToListAsync();
        var pendingSteps = await db.CampaignMessages
            .Where(m => m.CampaignId == id && m.Status != MessageStatus.Rejected && m.Status != MessageStatus.Failed)
            .Select(m => new { m.EnrollmentId, m.StepNumber })
            .ToListAsync();
        var covered = new HashSet<(Guid, int)>(pendingSteps.Select(p => (p.EnrollmentId, p.StepNumber)));

        var drafted = 0;
        var aiFailures = 0;
        // Bounded per call: keeps AI cost/latency sane; run it again for the rest.
        foreach (var enrollment in enrollments.Take(200))
        {
            if (drafted >= 25) break;
            var nextStepNumber = enrollment.CurrentStep + 1;
            if (nextStepNumber > steps.Count) continue;
            if (covered.Contains((enrollment.Id, nextStepNumber))) continue;
            var prospect = enrollment.Prospect;
            if (prospect is null || prospect.Status == ProspectStatus.OptedOut) continue;

            var step = steps[nextStepNumber - 1];
            var subject = TemplateMerge.Fill(step.Subject, prospect);
            var body = TemplateMerge.Fill(step.Body, prospect);
            var usedAi = false;

            if (request.UseAi)
            {
                try
                {
                    var polished = await generator.PersonalizeEmailAsync(
                        subject, body, prospect.CompanyName, prospect.ContactName,
                        prospect.Segment, prospect.City, prospect.Country, prospect.Notes, ct);
                    subject = polished.Subject;
                    body = polished.Body;
                    usedAi = true;
                }
                catch (Exception) when (aiFailures < 3)
                {
                    aiFailures++; // fall back to the plain merge for this one
                }
            }

            db.CampaignMessages.Add(new CampaignMessage
            {
                WorkspaceId = workspaceId,
                CampaignId = id,
                EnrollmentId = enrollment.Id,
                ProspectId = prospect.Id,
                StepNumber = nextStepNumber,
                Subject = subject,
                Body = body,
                DraftedByAi = usedAi,
            });
            drafted++;
        }
        await db.SaveChangesAsync();
        return Ok(new { drafted, aiFailures });
    }

    /// <summary>The review queue (across campaigns unless filtered).</summary>
    [HttpGet("messages")]
    public async Task<IActionResult> Messages(
        [FromQuery] MessageStatus? status, [FromQuery] Guid? campaignId)
    {
        var workspaceId = User.WorkspaceId();
        var query = db.CampaignMessages.Where(m => m.WorkspaceId == workspaceId);
        if (status is { } s) query = query.Where(m => m.Status == s);
        if (campaignId is { } c) query = query.Where(m => m.CampaignId == c);

        var messages = await query
            .OrderBy(m => m.CreatedAt)
            .Take(100)
            .ToListAsync();
        var prospectIds = messages.Select(m => m.ProspectId).Distinct().ToList();
        var prospects = await db.Prospects
            .Where(p => prospectIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);
        var campaignIds = messages.Select(m => m.CampaignId).Distinct().ToList();
        var names = await db.Campaigns
            .Where(c2 => campaignIds.Contains(c2.Id))
            .ToDictionaryAsync(c2 => c2.Id, c2 => c2.Name);

        return Ok(messages.Select(m => new
        {
            m.Id,
            m.CampaignId,
            campaign = names.GetValueOrDefault(m.CampaignId, ""),
            m.StepNumber,
            m.Subject,
            m.Body,
            m.Status,
            m.DraftedByAi,
            m.Error,
            m.CreatedAt,
            m.SentAt,
            company = prospects.GetValueOrDefault(m.ProspectId)?.CompanyName ?? "(deleted)",
            contact = prospects.GetValueOrDefault(m.ProspectId)?.ContactName ?? "",
            email = prospects.GetValueOrDefault(m.ProspectId)?.Email ?? "",
            needsEdit = m.Body.Contains('[') && m.Body.Contains(']'),
        }));
    }

    /// <summary>Edit / approve / reject one queued message.</summary>
    [HttpPatch("messages/{messageId:guid}")]
    public async Task<IActionResult> UpdateMessage(Guid messageId, UpdateMessageRequest request)
    {
        var workspaceId = User.WorkspaceId();
        var message = await db.CampaignMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.WorkspaceId == workspaceId);
        if (message is null) return NotFound();
        if (message.Status == MessageStatus.Sent)
            return Conflict(new { error = "Already sent." });

        if (request.Subject is { Length: > 0 }) message.Subject = request.Subject.Trim();
        if (request.Body is { Length: > 0 }) message.Body = request.Body.Trim();

        switch (request.Action?.ToLowerInvariant())
        {
            case "approve":
                if (message.Body.Contains('[') && message.Body.Contains(']'))
                    return BadRequest(new { error = "There's still an unfilled [placeholder] in the body — edit it before approving." });
                message.Status = MessageStatus.Approved;
                message.ApprovedAt = DateTimeOffset.UtcNow;
                message.Error = null;
                break;
            case "reject":
                message.Status = MessageStatus.Rejected;
                break;
            case null or "" or "save":
                break;
            default:
                return BadRequest(new { error = "Action must be approve, reject, or save." });
        }
        await db.SaveChangesAsync();
        return Ok(new { message.Id, message.Status });
    }

    private async Task<Campaign?> FindAsync(Guid id, bool includeSteps = false)
    {
        var workspaceId = User.WorkspaceId();
        var query = db.Campaigns.Where(c => c.Id == id && c.WorkspaceId == workspaceId);
        if (includeSteps) query = query.Include(c => c.Steps);
        return await query.FirstOrDefaultAsync();
    }
}
