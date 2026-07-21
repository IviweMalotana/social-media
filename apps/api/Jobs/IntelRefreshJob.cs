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
