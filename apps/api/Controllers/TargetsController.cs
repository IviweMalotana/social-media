using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

public record TargetDto(
    Guid Id, string Name, string MetricKey, string Unit,
    decimal TargetValue, decimal Current, bool IsAuto, bool LowerIsBetter,
    DateTimeOffset StartDate, DateTimeOffset EndDate,
    decimal ExpectedByNow, bool OnTrack, string? Notes);

public record CreateTargetRequest(
    string Name, string MetricKey, string Unit, decimal TargetValue,
    DateTimeOffset StartDate, DateTimeOffset EndDate, bool LowerIsBetter, string? Notes);

public record UpdateTargetRequest(decimal? TargetValue, decimal? ManualValue, string? Notes);

[ApiController]
[Route("api/targets")]
[Authorize]
public class TargetsController(AppDbContext db) : ControllerBase
{
    private static readonly string[] AutoMetrics =
        ["social_clicks", "social_impressions", "posts_published"];

    [HttpGet]
    public async Task<IReadOnlyList<TargetDto>> List()
    {
        var workspaceId = User.WorkspaceId();
        var targets = await db.Targets
            .Where(t => t.WorkspaceId == workspaceId)
            .OrderBy(t => t.EndDate).ThenBy(t => t.CreatedAt)
            .ToListAsync();

        var result = new List<TargetDto>();
        foreach (var target in targets)
            result.Add(await ToDtoAsync(target, workspaceId));
        return result;
    }

    [HttpPost]
    public async Task<ActionResult<TargetDto>> Create(CreateTargetRequest request)
    {
        var workspaceId = User.WorkspaceId();
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Give the target a name." });
        if (request.EndDate <= request.StartDate)
            return BadRequest(new { error = "End date must be after the start date." });

        var target = new Target
        {
            WorkspaceId = workspaceId,
            Name = request.Name.Trim(),
            MetricKey = request.MetricKey.Trim().ToLowerInvariant(),
            Unit = request.Unit.Trim(),
            TargetValue = request.TargetValue,
            LowerIsBetter = request.LowerIsBetter,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Notes = request.Notes,
        };
        db.Targets.Add(target);
        await db.SaveChangesAsync();
        return await ToDtoAsync(target, workspaceId);
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<TargetDto>> Update(Guid id, UpdateTargetRequest request)
    {
        var workspaceId = User.WorkspaceId();
        var target = await db.Targets.FirstOrDefaultAsync(t => t.Id == id && t.WorkspaceId == workspaceId);
        if (target is null) return NotFound();

        if (request.TargetValue is { } tv) target.TargetValue = tv;
        if (request.ManualValue is { } mv) target.ManualValue = mv;
        if (request.Notes is not null) target.Notes = request.Notes;
        await db.SaveChangesAsync();
        return await ToDtoAsync(target, workspaceId);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var target = await db.Targets.FirstOrDefaultAsync(t => t.Id == id && t.WorkspaceId == workspaceId);
        if (target is null) return NotFound();
        db.Targets.Remove(target);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Seeds the 90-day baseline-finding starter set: instrument-panel numbers first
    /// (sessions, first orders, measured AOV), with the app-measurable social metrics
    /// tracked automatically. Skips any metric key that already has a target.
    /// </summary>
    [HttpPost("seed-starter")]
    public async Task<ActionResult<object>> SeedStarter()
    {
        var workspaceId = User.WorkspaceId();
        var now = DateTimeOffset.UtcNow;
        var end = now.AddDays(90);

        var seeds = new[]
        {
            new Target { WorkspaceId = workspaceId, Name = "Site sessions (90 days)", MetricKey = "sessions", Unit = "visits", TargetValue = 1000, StartDate = now, EndDate = end, Notes = "Any mix of channels. Update weekly from Google Analytics." },
            new Target { WorkspaceId = workspaceId, Name = "First orders", MetricKey = "orders", Unit = "orders", TargetValue = 12, StartDate = now, EndDate = end, Notes = "10–15 orders establishes your real AOV and conversion rate." },
            new Target { WorkspaceId = workspaceId, Name = "Average order value", MetricKey = "aov", Unit = "R", TargetValue = 400, StartDate = now, EndDate = end, Notes = "Measure from your first orders — wholesale tiers should beat Etsy's R270." },
            new Target { WorkspaceId = workspaceId, Name = "Cart-recovery emails live", MetricKey = "cart_recovery", Unit = "done", TargetValue = 1, StartDate = now, EndDate = now.AddDays(14), Notes = "Install before spending on ads — ~20% of Etsy revenue was recoverable near-misses." },
            new Target { WorkspaceId = workspaceId, Name = "Cost per visit (paid test)", MetricKey = "cost_per_visit", Unit = "R", TargetValue = 10, LowerIsBetter = true, StartDate = now, EndDate = end, Notes = "One platform, R2–3k over 4–6 weeks. Record blended cost per landed visit." },
            new Target { WorkspaceId = workspaceId, Name = "Social clicks to site", MetricKey = "social_clicks", Unit = "clicks", TargetValue = 250, StartDate = now, EndDate = end, Notes = "Auto-tracked from published posts. Social's job: proof-of-life + retargeting fuel." },
            new Target { WorkspaceId = workspaceId, Name = "Posts published", MetricKey = "posts_published", Unit = "posts", TargetValue = 36, StartDate = now, EndDate = end, Notes = "Auto-tracked. ~3 per week keeps the profiles alive for buyers checking you out." },
        };

        var existingKeys = await db.Targets
            .Where(t => t.WorkspaceId == workspaceId)
            .Select(t => t.MetricKey)
            .ToListAsync();
        var created = seeds.Where(s => !existingKeys.Contains(s.MetricKey)).ToList();
        db.Targets.AddRange(created);
        await db.SaveChangesAsync();
        return new { created = created.Count };
    }

    private async Task<TargetDto> ToDtoAsync(Target target, Guid workspaceId)
    {
        var isAuto = AutoMetrics.Contains(target.MetricKey);
        var current = isAuto
            ? await ComputeAutoAsync(target, workspaceId)
            : target.ManualValue;

        var totalDays = Math.Max((target.EndDate - target.StartDate).TotalDays, 1);
        var elapsed = Math.Clamp((DateTimeOffset.UtcNow - target.StartDate).TotalDays / totalDays, 0, 1);
        var expected = Math.Round(target.TargetValue * (decimal)elapsed, 1);
        // Lower-is-better metrics (cost per visit) are on track while under target.
        var onTrack = target.LowerIsBetter
            ? current <= target.TargetValue || current == 0
            : current >= expected;

        return new TargetDto(
            target.Id, target.Name, target.MetricKey, target.Unit,
            target.TargetValue, current, isAuto, target.LowerIsBetter,
            target.StartDate, target.EndDate, expected, onTrack, target.Notes);
    }

    private async Task<decimal> ComputeAutoAsync(Target target, Guid workspaceId)
    {
        switch (target.MetricKey)
        {
            case "posts_published":
                return await db.PostTargets
                    .Where(t => t.Post!.WorkspaceId == workspaceId
                                && t.Status == TargetStatus.Published
                                && t.PublishedAt >= target.StartDate
                                && t.PublishedAt <= target.EndDate)
                    .CountAsync();
            case "social_clicks":
                return await db.PostTargets
                    .Where(t => t.Post!.WorkspaceId == workspaceId
                                && t.PublishedAt >= target.StartDate
                                && t.PublishedAt <= target.EndDate)
                    .SumAsync(t => (decimal)t.Clicks);
            case "social_impressions":
                return await db.PostTargets
                    .Where(t => t.Post!.WorkspaceId == workspaceId
                                && t.PublishedAt >= target.StartDate
                                && t.PublishedAt <= target.EndDate)
                    .SumAsync(t => (decimal)t.Impressions);
            default:
                return 0;
        }
    }
}
