using Hangfire;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Jobs;

/// <summary>
/// Publishes one PostTarget at its scheduled time. Idempotent: re-checks status before
/// doing anything, so Hangfire retries and duplicate enqueues are safe.
/// </summary>
public class PublishPostJob(
    AppDbContext db,
    AdapterRegistry adapters,
    ITokenVault vault,
    ILogger<PublishPostJob> logger)
{
    [AutomaticRetry(Attempts = 4, DelaysInSeconds = [60, 300, 900, 3600])]
    public async Task RunAsync(Guid postTargetId)
    {
        var target = await db.PostTargets
            .Include(t => t.Post)
            .Include(t => t.ConnectedAccount)
            .FirstOrDefaultAsync(t => t.Id == postTargetId);

        if (target is null)
        {
            logger.LogWarning("PostTarget {Id} no longer exists — skipping.", postTargetId);
            return;
        }

        // Idempotency gate: only a Scheduled target may publish.
        if (target.Status is not (TargetStatus.Scheduled or TargetStatus.Publishing))
        {
            logger.LogInformation("PostTarget {Id} is {Status} — nothing to do.", postTargetId, target.Status);
            return;
        }

        if (target.ConnectedAccount is null || target.Post is null)
        {
            await MarkFailedAsync(target, "Connected account or post was deleted before publishing.");
            return;
        }

        target.Status = TargetStatus.Publishing;
        await db.SaveChangesAsync();

        var adapter = adapters.For(target.Platform);
        var accessToken = vault.Decrypt(target.ConnectedAccount.EncryptedAccessToken);
        var mediaIds = target.Post.MediaAssetIds
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(Guid.Parse)
            .ToList();
        var media = await db.MediaAssets.Where(m => mediaIds.Contains(m.Id)).ToListAsync();
        var draft = new PostDraft(
            target.CaptionOverride ?? target.Post.Caption,
            media,
            target.Post.ScheduledAt);

        var result = await adapter.PublishAsync(target, draft, accessToken);

        db.PublishAttempts.Add(new PublishAttempt
        {
            PostTargetId = target.Id,
            Success = result.Success,
            // On success, Error can carry a non-fatal note (e.g. TikTok pre-audit private posting).
            Detail = result.Success
                ? $"Published as {result.ExternalPostId}{(result.Error is { } note ? $" — {note}" : "")}"
                : result.Error ?? "Unknown error",
        });

        if (result.Success)
        {
            target.Status = TargetStatus.Published;
            target.ExternalPostId = result.ExternalPostId;
            target.ExternalPostUrl = result.ExternalPostUrl;
            target.PublishedAt = DateTimeOffset.UtcNow;
            target.ErrorMessage = null;
            await db.SaveChangesAsync();
            await RollUpPostStatusAsync(target.PostId);
        }
        else
        {
            target.ErrorMessage = result.Error;
            await db.SaveChangesAsync();
            // Throw so Hangfire retries with backoff; final failure lands in the catch-all state.
            throw new PublishFailedException(result.Error ?? "Publish failed.");
        }
    }

    private async Task MarkFailedAsync(PostTarget target, string reason)
    {
        target.Status = TargetStatus.Failed;
        target.ErrorMessage = reason;
        await db.SaveChangesAsync();
        await RollUpPostStatusAsync(target.PostId);
    }

    private async Task RollUpPostStatusAsync(Guid postId)
    {
        var post = await db.Posts.Include(p => p.Targets).FirstOrDefaultAsync(p => p.Id == postId);
        if (post is null) return;

        var statuses = post.Targets.Select(t => t.Status).ToList();
        post.Status = statuses.All(s => s == TargetStatus.Published) ? PostStatus.Published
            : statuses.Any(s => s == TargetStatus.Published) ? PostStatus.PartiallyPublished
            : statuses.All(s => s == TargetStatus.Failed) ? PostStatus.Failed
            : post.Status;
        post.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
    }
}

public class PublishFailedException(string message) : Exception(message);
