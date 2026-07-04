using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

/// <summary>
/// One interface per platform so the composer, calendar, publish pipeline, and insights
/// stay platform-agnostic. Adding a platform means adding an adapter — nothing else.
/// </summary>
public interface ISocialPlatformAdapter
{
    Platform Platform { get; }

    /// <summary>Build the OAuth authorization URL the user is redirected to.</summary>
    string GetAuthorizationUrl(ConnectContext ctx);

    /// <summary>
    /// Exchange the OAuth callback code for tokens and account identities. One grant can
    /// yield several connectable accounts (e.g. Meta returns every Page the user manages).
    /// </summary>
    Task<IReadOnlyList<ConnectionResult>> CompleteConnectionAsync(string code, ConnectContext ctx, CancellationToken ct = default);

    /// <summary>Check the stored token still works (called by the recurring health sweep).</summary>
    Task<TokenHealthResult> ValidateTokenAsync(ConnectedAccount account, string accessToken, CancellationToken ct = default);

    /// <summary>Compose-time validation: media specs, caption length, platform rules.</summary>
    DraftValidationResult ValidateDraft(PostDraft draft);

    /// <summary>Publish one target. Must be idempotent per PostTarget — safe to retry.</summary>
    Task<PublishResult> PublishAsync(PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default);

    /// <summary>Pull per-post metrics after publishing.</summary>
    Task<PostInsights> FetchInsightsAsync(PostTarget target, string accessToken, CancellationToken ct = default);
}

/// <summary>Resolves the adapter for a platform. Registered as a singleton.</summary>
public sealed class AdapterRegistry(IEnumerable<ISocialPlatformAdapter> adapters)
{
    private readonly Dictionary<Platform, ISocialPlatformAdapter> _byPlatform =
        adapters.ToDictionary(a => a.Platform);

    public ISocialPlatformAdapter For(Platform platform) =>
        _byPlatform.TryGetValue(platform, out var adapter)
            ? adapter
            : throw new NotSupportedException($"No adapter registered for {platform}.");

    public IReadOnlyCollection<ISocialPlatformAdapter> All => _byPlatform.Values;
}
