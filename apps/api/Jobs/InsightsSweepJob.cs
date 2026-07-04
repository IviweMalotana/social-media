using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Jobs;

/// <summary>
/// Recurring job (every 6h): pulls per-post metrics for targets published in the last
/// 30 days. Failures are per-target and non-fatal — one revoked account never blocks
/// the rest of the sweep.
/// </summary>
public class InsightsSweepJob(
    AppDbContext db,
    AdapterRegistry adapters,
    ITokenVault vault,
    ILogger<InsightsSweepJob> logger)
{
    public async Task RunAsync()
    {
        var since = DateTimeOffset.UtcNow.AddDays(-30);
        var targets = await db.PostTargets
            .Include(t => t.ConnectedAccount)
            .Where(t => t.Status == TargetStatus.Published
                        && t.ExternalPostId != null
                        && t.PublishedAt >= since
                        && t.ConnectedAccount!.Health != AccountHealth.Revoked)
            .ToListAsync();

        foreach (var target in targets)
        {
            try
            {
                var adapter = adapters.For(target.Platform);
                var token = vault.Decrypt(target.ConnectedAccount!.EncryptedAccessToken);
                var insights = await adapter.FetchInsightsAsync(target, token);

                target.Impressions = insights.Impressions;
                target.Likes = insights.Likes;
                target.Comments = insights.Comments;
                target.Shares = insights.Shares;
                target.Clicks = insights.Clicks;
                target.InsightsUpdatedAt = DateTimeOffset.UtcNow;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Insights fetch failed for target {Id} ({Platform}).",
                    target.Id, target.Platform);
            }
        }

        await db.SaveChangesAsync();
    }
}
