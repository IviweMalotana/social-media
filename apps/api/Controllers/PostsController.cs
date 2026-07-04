using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Jobs;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Controllers;

public record CreatePostRequest(
    string Caption,
    List<Guid> MediaAssetIds,
    DateTimeOffset? ScheduledAt,
    List<PostTargetRequest> Targets);

public record PostTargetRequest(Guid ConnectedAccountId, string? CaptionOverride);

public record PostTargetDto(
    Guid Id, Guid ConnectedAccountId, Platform Platform, string AccountName,
    TargetStatus Status, string? ExternalPostUrl, string? ErrorMessage,
    long Impressions, long Likes, long Comments, long Shares, long Clicks);

public record PostDto(
    Guid Id, string Caption, List<Guid> MediaAssetIds, PostStatus Status,
    DateTimeOffset? ScheduledAt, DateTimeOffset CreatedAt, List<PostTargetDto> Targets);

public record ValidateDraftRequest(string Caption, List<Guid> MediaAssetIds, DateTimeOffset? ScheduledAt, List<Platform> Platforms);

[ApiController]
[Route("api/posts")]
[Authorize]
public class PostsController(
    AppDbContext db,
    AdapterRegistry adapters,
    IBackgroundJobClient jobs) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<PostDto>> List([FromQuery] PostStatus? status)
    {
        var workspaceId = User.WorkspaceId();
        var query = db.Posts
            .Include(p => p.Targets).ThenInclude(t => t.ConnectedAccount)
            .Where(p => p.WorkspaceId == workspaceId);
        if (status is { } s) query = query.Where(p => p.Status == s);

        var posts = await query.OrderByDescending(p => p.ScheduledAt ?? p.CreatedAt).Take(200).ToListAsync();
        return posts.Select(ToDto).ToList();
    }

    /// <summary>Compose-time validation across all selected platforms — fail in the editor, not at 3am.</summary>
    [HttpPost("validate")]
    public async Task<ActionResult<Dictionary<Platform, DraftValidationResult>>> Validate(ValidateDraftRequest request)
    {
        var workspaceId = User.WorkspaceId();
        var media = await db.MediaAssets
            .Where(m => m.WorkspaceId == workspaceId && request.MediaAssetIds.Contains(m.Id))
            .ToListAsync();
        var draft = new PostDraft(request.Caption, media, request.ScheduledAt);

        return request.Platforms.Distinct()
            .ToDictionary(p => p, p => adapters.For(p).ValidateDraft(draft));
    }

    [HttpPost]
    public async Task<ActionResult<PostDto>> Create(CreatePostRequest request)
    {
        var workspaceId = User.WorkspaceId();
        if (request.Targets.Count == 0)
            return BadRequest(new { error = "A post needs at least one target account." });

        var accountIds = request.Targets.Select(t => t.ConnectedAccountId).Distinct().ToList();
        var accounts = await db.ConnectedAccounts
            .Where(a => a.WorkspaceId == workspaceId && accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id);

        if (accounts.Count != accountIds.Count)
            return BadRequest(new { error = "One or more target accounts do not belong to this workspace." });

        // Blocking compose-time issues stop creation.
        var media = await db.MediaAssets
            .Where(m => m.WorkspaceId == workspaceId && request.MediaAssetIds.Contains(m.Id))
            .ToListAsync();
        var draft = new PostDraft(request.Caption, media, request.ScheduledAt);
        var blocking = accounts.Values
            .Select(a => a.Platform).Distinct()
            .SelectMany(p => adapters.For(p).ValidateDraft(draft).Issues.Where(i => i.IsBlocking)
                .Select(i => $"{p}: {i.Message}"))
            .ToList();
        if (blocking.Count > 0)
            return BadRequest(new { error = "Draft fails platform rules.", issues = blocking });

        var post = new Post
        {
            WorkspaceId = workspaceId,
            AuthorId = User.UserId(),
            Caption = request.Caption,
            MediaAssetIds = string.Join(',', request.MediaAssetIds),
            ScheduledAt = request.ScheduledAt,
            Status = request.ScheduledAt is null ? PostStatus.Draft : PostStatus.Scheduled,
        };
        foreach (var t in request.Targets)
        {
            post.Targets.Add(new PostTarget
            {
                ConnectedAccountId = t.ConnectedAccountId,
                Platform = accounts[t.ConnectedAccountId].Platform,
                CaptionOverride = t.CaptionOverride,
                Status = request.ScheduledAt is null ? TargetStatus.Pending : TargetStatus.Scheduled,
            });
        }
        db.Posts.Add(post);
        await db.SaveChangesAsync();

        if (post.ScheduledAt is { } at)
            EnqueueTargets(post, at);
        await db.SaveChangesAsync();

        foreach (var target in post.Targets)
            target.ConnectedAccount = accounts[target.ConnectedAccountId];
        return CreatedAtAction(nameof(Get), new { id = post.Id }, ToDto(post));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PostDto>> Get(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var post = await db.Posts
            .Include(p => p.Targets).ThenInclude(t => t.ConnectedAccount)
            .FirstOrDefaultAsync(p => p.Id == id && p.WorkspaceId == workspaceId);
        return post is null ? NotFound() : ToDto(post);
    }

    /// <summary>Cancel a scheduled post before it publishes.</summary>
    [HttpPost("{id:guid}/cancel")]
    public async Task<ActionResult<PostDto>> Cancel(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var post = await db.Posts
            .Include(p => p.Targets).ThenInclude(t => t.ConnectedAccount)
            .FirstOrDefaultAsync(p => p.Id == id && p.WorkspaceId == workspaceId);
        if (post is null) return NotFound();
        if (post.Status is not (PostStatus.Draft or PostStatus.Scheduled))
            return Conflict(new { error = $"Cannot cancel a post in status {post.Status}." });

        foreach (var target in post.Targets.Where(t => t.Status is TargetStatus.Pending or TargetStatus.Scheduled))
        {
            if (target.HangfireJobId is { } jobId) BackgroundJob.Delete(jobId);
            target.Status = TargetStatus.Cancelled;
        }
        post.Status = PostStatus.Draft;
        post.ScheduledAt = null;
        post.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return ToDto(post);
    }

    private void EnqueueTargets(Post post, DateTimeOffset at)
    {
        foreach (var target in post.Targets.Where(t => t.Status == TargetStatus.Scheduled))
        {
            target.HangfireJobId = jobs.Schedule<PublishPostJob>(j => j.RunAsync(target.Id), at);
        }
    }

    private static PostDto ToDto(Post p) => new(
        p.Id,
        p.Caption,
        p.MediaAssetIds.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(Guid.Parse).ToList(),
        p.Status,
        p.ScheduledAt,
        p.CreatedAt,
        p.Targets.Select(t => new PostTargetDto(
            t.Id, t.ConnectedAccountId, t.Platform,
            t.ConnectedAccount?.DisplayName ?? "",
            t.Status, t.ExternalPostUrl, t.ErrorMessage,
            t.Impressions, t.Likes, t.Comments, t.Shares, t.Clicks)).ToList());
}
