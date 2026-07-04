using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

/// <summary>Context for building an OAuth authorization URL.</summary>
public record ConnectContext(Guid WorkspaceId, string RedirectUri, string State);

/// <summary>Result of an OAuth callback exchange — everything needed to persist a ConnectedAccount.</summary>
public record ConnectionResult(
    string ExternalId,
    string DisplayName,
    string? AvatarUrl,
    string AccessToken,
    string? RefreshToken,
    DateTimeOffset? ExpiresAt,
    string Scopes);

public record TokenHealthResult(AccountHealth Health, string? Detail = null);

/// <summary>What the composer hands to an adapter for compose-time validation.</summary>
public record PostDraft(
    string Caption,
    IReadOnlyList<MediaAsset> Media,
    DateTimeOffset? ScheduledAt);

public record DraftIssue(string Code, string Message, bool IsBlocking);

public record DraftValidationResult(IReadOnlyList<DraftIssue> Issues)
{
    public bool IsValid => Issues.All(i => !i.IsBlocking);
    public static DraftValidationResult Ok() => new(Array.Empty<DraftIssue>());
}

public record PublishResult(bool Success, string? ExternalPostId, string? ExternalPostUrl, string? Error)
{
    public static PublishResult Ok(string id, string? url = null) => new(true, id, url, null);
    public static PublishResult Fail(string error) => new(false, null, null, error);
}

public record PostInsights(long Impressions, long Likes, long Comments, long Shares, long Clicks);

/// <summary>
/// Compose-time rules and hard API budgets per platform, verified against platform docs.
/// The tool tracks these budgets itself and warns in the editor instead of failing at
/// publish time.
/// </summary>
public record PlatformSpec(
    Platform Platform,
    string Name,
    int MaxCaptionLength,
    bool RequiresMedia,
    int? DailyPublishLimit,
    int MaxMediaPerPost);

public static class PlatformCatalog
{
    public static readonly IReadOnlyDictionary<Platform, PlatformSpec> Specs =
        new Dictionary<Platform, PlatformSpec>
        {
            [Platform.Facebook] = new(Platform.Facebook, "Facebook", 63_206, RequiresMedia: false, DailyPublishLimit: null, MaxMediaPerPost: 10),
            // Instagram: 25 API-published posts per rolling 24h per account.
            [Platform.Instagram] = new(Platform.Instagram, "Instagram", 2_200, RequiresMedia: true, DailyPublishLimit: 25, MaxMediaPerPost: 10),
            // TikTok: ~15/day per creator once the app passes the Direct Post audit.
            [Platform.TikTok] = new(Platform.TikTok, "TikTok", 2_200, RequiresMedia: true, DailyPublishLimit: 15, MaxMediaPerPost: 35),
            [Platform.Pinterest] = new(Platform.Pinterest, "Pinterest", 500, RequiresMedia: true, DailyPublishLimit: null, MaxMediaPerPost: 5),
            // WhatsApp is broadcast messaging, not a feed — caption limit is the template body limit.
            [Platform.WhatsApp] = new(Platform.WhatsApp, "WhatsApp", 1_024, RequiresMedia: false, DailyPublishLimit: null, MaxMediaPerPost: 1),
            [Platform.GoogleAds] = new(Platform.GoogleAds, "Google Ads", 90, RequiresMedia: false, DailyPublishLimit: null, MaxMediaPerPost: 15),
        };
}
