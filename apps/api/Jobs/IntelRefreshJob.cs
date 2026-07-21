using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Jobs;

/// <summary>
/// The recurring intelligence pull. Every run picks the verticals whose cadence
/// says they're due (daily ≈ every 20h, weekly ≈ every 6.5d, manual = never) and
/// refreshes at most a few per run so a big backlog can't burn a day of API
/// budget in one sweep. Individual failures are recorded on the vertical and
/// never take down the run.
/// </summary>
public class IntelRefreshJob(
    AppDbContext db,
    IntelResearcher researcher,
    ILogger<IntelRefreshJob> logger)
{
    /// <summary>Max research pulls per sweep — bounds cost; sweeps run every 6h.</summary>
    private const int MaxPerRun = 3;

    public Task RunAsync() => RunAsync(DateTimeOffset.UtcNow);

    public async Task RunAsync(DateTimeOffset now)
    {
        if (!researcher.IsConfigured)
        {
            logger.LogInformation("Intel refresh skipped: Anthropic:ApiKey not configured.");
            return;
        }

        var dailyCutoff = now.AddHours(-20);
        var weeklyCutoff = now.AddDays(-6.5);
        var due = await db.BuyerVerticals
            .Where(v => !v.Suggested)
            .Where(v => v.Cadence != "manual" && v.ResearchStatus != "running")
            .Where(v => v.LastResearchedAt == null ||
                        (v.Cadence == "daily" && v.LastResearchedAt < dailyCutoff) ||
                        (v.Cadence == "weekly" && v.LastResearchedAt < weeklyCutoff))
            .OrderByDescending(v => v.Pinned)
            .ThenBy(v => v.LastResearchedAt ?? DateTimeOffset.MinValue)
            .Take(MaxPerRun)
            .ToListAsync();

        foreach (var vertical in due)
            await ResearchOneAsync(vertical.Id);
    }

    /// <summary>
    /// Discovery: digs the web for buyer types NOT already on the list and files
    /// them as suggestions awaiting approval. Runs weekly, or on demand from the
    /// Intel page. Dedupes against every existing name (approved or suggested).
    /// </summary>
    public async Task DiscoverAsync(Guid workspaceId)
    {
        if (!researcher.IsConfigured) return;

        var existing = await db.BuyerVerticals
            .Where(v => v.WorkspaceId == workspaceId)
            .Select(v => v.Name)
            .ToListAsync();

        try
        {
            var candidates = await researcher.DiscoverAsync(existing);
            var known = existing.Select(n => n.ToLowerInvariant().Trim()).ToHashSet();
            var added = 0;
            foreach (var c in candidates)
            {
                if (!known.Add(c.Name.ToLowerInvariant().Trim())) continue;
                db.BuyerVerticals.Add(new BuyerVertical
                {
                    WorkspaceId = workspaceId,
                    Name = c.Name,
                    Category = c.Category,
                    Suggested = true,
                    Cadence = "manual", // never auto-briefed until approved
                    DiscoveryJson = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        evidence = c.Evidence,
                        whyFit = c.WhyFit,
                        suggestedFormats = c.SuggestedFormats,
                        source = c.Source,
                    }),
                });
                added++;
            }
            await db.SaveChangesAsync();
            logger.LogInformation("Discovery added {Count} suggested verticals", added);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Vertical discovery failed");
        }
    }

    /// <summary>
    /// Weekly discovery sweep across all workspaces that have any intel activity.
    /// </summary>
    public async Task DiscoverAllAsync()
    {
        var workspaceIds = await db.BuyerVerticals
            .Select(v => v.WorkspaceId).Distinct().ToListAsync();
        foreach (var workspaceId in workspaceIds)
            await DiscoverAsync(workspaceId);
    }

    /// <summary>
    /// Researches a single vertical — also the entry point for the "refresh now"
    /// button (enqueued as a background job so the HTTP request returns fast).
    /// </summary>
    public async Task ResearchOneAsync(Guid verticalId)
    {
        var vertical = await db.BuyerVerticals.FirstOrDefaultAsync(v => v.Id == verticalId);
        if (vertical is null || !researcher.IsConfigured) return;

        vertical.ResearchStatus = "running";
        vertical.LastError = null;
        await db.SaveChangesAsync();

        try
        {
            var result = await researcher.ResearchAsync(
                vertical.Name, vertical.Category, vertical.Notes);

            db.IntelBriefs.Add(new IntelBrief
            {
                BuyerVerticalId = vertical.Id,
                WorkspaceId = vertical.WorkspaceId,
                BriefJson = result.BriefJson,
                SourcesJson = result.SourcesJson,
                Model = result.Model,
            });
            vertical.LastResearchedAt = DateTimeOffset.UtcNow;
            vertical.ResearchStatus = "idle";
            await db.SaveChangesAsync();
            logger.LogInformation("Intel refreshed for {Vertical}", vertical.Name);
        }
        catch (Exception ex)
        {
            vertical.ResearchStatus = "failed";
            vertical.LastError = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
            await db.SaveChangesAsync();
            logger.LogError(ex, "Intel research failed for {Vertical}", vertical.Name);
        }
    }
}
