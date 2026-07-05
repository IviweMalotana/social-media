namespace SocialMedia.Api.Domain;

public class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public required string DisplayName { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<WorkspaceMember> Memberships { get; set; } = [];
}

/// <summary>The tenant. Every query in the API is scoped to one workspace.</summary>
public class Workspace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<WorkspaceMember> Members { get; set; } = [];
    public List<ConnectedAccount> ConnectedAccounts { get; set; } = [];
}

public class WorkspaceMember
{
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public Guid UserId { get; set; }
    public AppUser? User { get; set; }
    public WorkspaceRole Role { get; set; } = WorkspaceRole.Editor;
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A social account connected via OAuth (an IG business account, a FB page, a TikTok
/// creator, a Pinterest profile, a WABA, a Google Ads customer). Tokens are stored
/// encrypted by ITokenVault and are never exposed through the API.
/// </summary>
public class ConnectedAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public Platform Platform { get; set; }
    public required string ExternalId { get; set; }
    public required string DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public required string EncryptedAccessToken { get; set; }
    public string? EncryptedRefreshToken { get; set; }
    public DateTimeOffset? TokenExpiresAt { get; set; }
    public string Scopes { get; set; } = "";
    public AccountHealth Health { get; set; } = AccountHealth.Healthy;
    public DateTimeOffset ConnectedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<PostTarget> Targets { get; set; } = [];
}

public class MediaAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public long SizeBytes { get; set; }
    /// <summary>Key in object storage (R2/S3). Phase 0 stores locally under wwwroot/media.</summary>
    public required string StorageKey { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public double? DurationSeconds { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>The draft the user composes once; fan-out lives in PostTargets.</summary>
public class Post
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Guid AuthorId { get; set; }
    public string Caption { get; set; } = "";
    /// <summary>Comma-separated MediaAsset ids, in display order.</summary>
    public string MediaAssetIds { get; set; } = "";
    public PostStatus Status { get; set; } = PostStatus.Draft;
    public DateTimeOffset? ScheduledAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<PostTarget> Targets { get; set; } = [];
}

/// <summary>One (post × connected account) publish unit with per-platform overrides.</summary>
public class PostTarget
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PostId { get; set; }
    public Post? Post { get; set; }
    public Guid ConnectedAccountId { get; set; }
    public ConnectedAccount? ConnectedAccount { get; set; }
    public Platform Platform { get; set; }
    public string? CaptionOverride { get; set; }
    public TargetStatus Status { get; set; } = TargetStatus.Pending;
    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? ErrorMessage { get; set; }
    public string? HangfireJobId { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }

    // Latest insights snapshot, refreshed by InsightsSweepJob for ~30 days after publish.
    public long Impressions { get; set; }
    public long Likes { get; set; }
    public long Comments { get; set; }
    public long Shares { get; set; }
    public long Clicks { get; set; }
    public DateTimeOffset? InsightsUpdatedAt { get; set; }

    public List<PublishAttempt> Attempts { get; set; } = [];
}

/// <summary>
/// Short-lived CSRF state for an in-flight OAuth connection. Created when the user
/// starts a connect, consumed (deleted) by the callback, expired rows are ignored.
/// </summary>
public class OAuthState
{
    /// <summary>The opaque state string sent to the platform.</summary>
    public required string Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Platform Platform { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(15);
}

/// <summary>
/// A data-deletion request received from a platform (Meta sends these when a user
/// removes the app or asks Facebook to delete their data). Connected accounts are
/// disconnected immediately; the row is the auditable confirmation trail.
/// </summary>
public class DataDeletionRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Platform Platform { get; set; }
    /// <summary>Platform-side user id the request concerns (app-scoped for Meta).</summary>
    public required string ExternalUserId { get; set; }
    public string Status { get; set; } = "received";
    public DateTimeOffset ReceivedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

/// <summary>Audit log of every publish try — idempotency evidence and debugging.</summary>
public class PublishAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PostTargetId { get; set; }
    public PostTarget? PostTarget { get; set; }
    public DateTimeOffset AttemptedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool Success { get; set; }
    public string Detail { get; set; } = "";
}
