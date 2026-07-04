using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

/// <summary>
/// Shared compose-time validation driven by PlatformCatalog specs, plus stubbed
/// network operations. Each phase replaces the stubs in its platform's adapter with
/// real API calls; the interface and the rest of the pipeline never change.
/// </summary>
public abstract class PlatformAdapterBase : ISocialPlatformAdapter
{
    public abstract Platform Platform { get; }

    protected PlatformSpec Spec => PlatformCatalog.Specs[Platform];

    public abstract string GetAuthorizationUrl(ConnectContext ctx);

    public virtual Task<IReadOnlyList<ConnectionResult>> CompleteConnectionAsync(string code, ConnectContext ctx, CancellationToken ct = default)
        => throw new NotImplementedException($"{Spec.Name} OAuth exchange lands in its build phase (see docs/PLAN.md).");

    public virtual Task<TokenHealthResult> ValidateTokenAsync(ConnectedAccount account, string accessToken, CancellationToken ct = default)
        => Task.FromResult(new TokenHealthResult(AccountHealth.Healthy));

    public virtual DraftValidationResult ValidateDraft(PostDraft draft)
    {
        var issues = new List<DraftIssue>();
        var spec = Spec;

        if (draft.Caption.Length > spec.MaxCaptionLength)
            issues.Add(new DraftIssue(
                "caption_too_long",
                $"{spec.Name} allows at most {spec.MaxCaptionLength:N0} characters; this caption has {draft.Caption.Length:N0}.",
                IsBlocking: true));

        if (spec.RequiresMedia && draft.Media.Count == 0)
            issues.Add(new DraftIssue(
                "media_required",
                $"{spec.Name} posts must include at least one image or video.",
                IsBlocking: true));

        if (draft.Media.Count > spec.MaxMediaPerPost)
            issues.Add(new DraftIssue(
                "too_many_media",
                $"{spec.Name} allows at most {spec.MaxMediaPerPost} media items per post.",
                IsBlocking: true));

        if (draft.ScheduledAt is { } at && at <= DateTimeOffset.UtcNow)
            issues.Add(new DraftIssue(
                "schedule_in_past",
                "Scheduled time must be in the future.",
                IsBlocking: true));

        return new DraftValidationResult(issues);
    }

    public virtual Task<PublishResult> PublishAsync(PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default)
        => Task.FromResult(PublishResult.Fail(
            $"{Spec.Name} publishing lands in its build phase (see docs/PLAN.md)."));

    public virtual Task<PostInsights> FetchInsightsAsync(PostTarget target, string accessToken, CancellationToken ct = default)
        => Task.FromResult(new PostInsights(0, 0, 0, 0, 0));
}
