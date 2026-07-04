using System.Web;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

// Facebook + Instagram are live (Phase 1) via MetaGraphClient — they work as soon as a
// Meta app is configured and has passed App Review for the publish scopes. TikTok,
// Pinterest, WhatsApp, and Google Ads build their real OAuth URLs and enforce real
// compose-time rules, with token exchange/publishing landing in their phases.

/// <summary>Facebook Pages. One Meta OAuth grant connects every Page the user manages.</summary>
public sealed class FacebookAdapter(IConfiguration config, MetaGraphClient meta) : PlatformAdapterBase
{
    public override Platform Platform => Platform.Facebook;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.facebook.com/v21.0/dialog/oauth" +
        $"?client_id={config["Platforms:Meta:AppId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&scope=pages_show_list,pages_manage_posts,pages_read_engagement,business_management";

    public override async Task<IReadOnlyList<ConnectionResult>> CompleteConnectionAsync(
        string code, ConnectContext ctx, CancellationToken ct = default)
    {
        var userToken = await meta.ExchangeCodeAsync(code, ctx.RedirectUri, ct);
        var (longLived, _) = await meta.GetLongLivedTokenAsync(userToken, ct);
        var pages = await meta.GetPagesAsync(longLived, ct);

        // Page tokens derived from a long-lived user token do not expire on their own.
        return pages.Select(p => new ConnectionResult(
            p.Id, p.Name, p.PictureUrl, p.AccessToken,
            RefreshToken: null, ExpiresAt: null,
            Scopes: "pages_manage_posts,pages_read_engagement")).ToList();
    }

    public override Task<TokenHealthResult> ValidateTokenAsync(ConnectedAccount account, string accessToken, CancellationToken ct = default)
        => meta.DebugTokenAsync(accessToken, ct);

    public override async Task<PublishResult> PublishAsync(PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default)
    {
        try
        {
            var pageId = target.ConnectedAccount!.ExternalId;
            var image = draft.Media.FirstOrDefault(m => m.ContentType.StartsWith("image/"));
            var postId = image is null
                ? await meta.PublishPageFeedAsync(pageId, accessToken, draft.Caption, ct)
                : await meta.PublishPagePhotoAsync(pageId, accessToken, draft.Caption, MediaUrl(config, image), ct);
            return PublishResult.Ok(postId, $"https://www.facebook.com/{postId}");
        }
        catch (MetaGraphException ex)
        {
            return PublishResult.Fail(ex.Message);
        }
        catch (HttpRequestException ex)
        {
            return PublishResult.Fail($"Network error calling Meta: {ex.Message}");
        }
    }

    public override async Task<PostInsights> FetchInsightsAsync(PostTarget target, string accessToken, CancellationToken ct = default)
        => target.ExternalPostId is null
            ? new PostInsights(0, 0, 0, 0, 0)
            : await meta.GetPagePostInsightsAsync(target.ExternalPostId, accessToken, ct);

    internal static string MediaUrl(IConfiguration config, MediaAsset asset) =>
        $"{(config["App:BaseUrl"] ?? "http://localhost:5128").TrimEnd('/')}/media/{asset.StorageKey}";
}

/// <summary>
/// Instagram professional accounts via the Instagram Graph API. Connected through the
/// linked Facebook Page; publishing uses the Page token and counts against the
/// account's 25-per-24h API budget.
/// </summary>
public sealed class InstagramAdapter(IConfiguration config, MetaGraphClient meta) : PlatformAdapterBase
{
    public override Platform Platform => Platform.Instagram;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.facebook.com/v21.0/dialog/oauth" +
        $"?client_id={config["Platforms:Meta:AppId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&scope=instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list";

    public override async Task<IReadOnlyList<ConnectionResult>> CompleteConnectionAsync(
        string code, ConnectContext ctx, CancellationToken ct = default)
    {
        var userToken = await meta.ExchangeCodeAsync(code, ctx.RedirectUri, ct);
        var (longLived, _) = await meta.GetLongLivedTokenAsync(userToken, ct);
        var pages = await meta.GetPagesAsync(longLived, ct);

        return pages
            .Where(p => p.InstagramId is not null)
            .Select(p => new ConnectionResult(
                p.InstagramId!,
                p.InstagramUsername is { } u ? $"@{u}" : p.Name,
                p.InstagramPictureUrl,
                p.AccessToken, // IG publishing uses the linked Page's token
                RefreshToken: null, ExpiresAt: null,
                Scopes: "instagram_content_publish,instagram_manage_insights")).ToList();
    }

    public override Task<TokenHealthResult> ValidateTokenAsync(ConnectedAccount account, string accessToken, CancellationToken ct = default)
        => meta.DebugTokenAsync(accessToken, ct);

    public override async Task<PublishResult> PublishAsync(PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default)
    {
        try
        {
            var image = draft.Media.FirstOrDefault(m => m.ContentType.StartsWith("image/"));
            if (image is null)
                return PublishResult.Fail("Instagram requires at least one image (video/reels land later in Phase 1).");

            var igUserId = target.ConnectedAccount!.ExternalId;
            var mediaId = await meta.PublishInstagramImageAsync(
                igUserId, accessToken, draft.Caption, FacebookAdapter.MediaUrl(config, image), ct);
            var permalink = await meta.GetInstagramPermalinkAsync(mediaId, accessToken, ct);
            return PublishResult.Ok(mediaId, permalink);
        }
        catch (MetaGraphException ex)
        {
            return PublishResult.Fail(ex.Message);
        }
        catch (HttpRequestException ex)
        {
            return PublishResult.Fail($"Network error calling Meta: {ex.Message}");
        }
    }

    public override async Task<PostInsights> FetchInsightsAsync(PostTarget target, string accessToken, CancellationToken ct = default)
        => target.ExternalPostId is null
            ? new PostInsights(0, 0, 0, 0, 0)
            : await meta.GetInstagramInsightsAsync(target.ExternalPostId, accessToken, ct);
}

/// <summary>TikTok Content Posting API. Direct Post is private-only until the app passes audit (Phase 2).</summary>
public sealed class TikTokAdapter(IConfiguration config) : PlatformAdapterBase
{
    public override Platform Platform => Platform.TikTok;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.tiktok.com/v2/auth/authorize/" +
        $"?client_key={config["Platforms:TikTok:ClientKey"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&response_type=code" +
        "&scope=user.info.basic,video.publish,video.upload";
}

/// <summary>Pinterest API v5. Trial tier is sandbox-only; Standard access required for real pins (Phase 2).</summary>
public sealed class PinterestAdapter(IConfiguration config) : PlatformAdapterBase
{
    public override Platform Platform => Platform.Pinterest;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.pinterest.com/oauth/" +
        $"?client_id={config["Platforms:Pinterest:AppId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&response_type=code" +
        "&scope=boards:read,boards:write,pins:read,pins:write,user_accounts:read";
}

/// <summary>
/// WhatsApp Business Platform. Not a feed: the product is template-based broadcast
/// messages to opted-in lists, connected through Embedded Signup (Phase 3).
/// </summary>
public sealed class WhatsAppAdapter(IConfiguration config) : PlatformAdapterBase
{
    public override Platform Platform => Platform.WhatsApp;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.facebook.com/v21.0/dialog/oauth" +
        $"?client_id={config["Platforms:Meta:AppId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&scope=whatsapp_business_management,whatsapp_business_messaging,business_management";
}

/// <summary>Google Ads API: campaign create/pause, budgets, reporting — not a full Ads editor (Phase 4).</summary>
public sealed class GoogleAdsAdapter(IConfiguration config) : PlatformAdapterBase
{
    public override Platform Platform => Platform.GoogleAds;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://accounts.google.com/o/oauth2/v2/auth" +
        $"?client_id={config["Platforms:GoogleAds:ClientId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&response_type=code" +
        "&access_type=offline&prompt=consent" +
        $"&scope={HttpUtility.UrlEncode("https://www.googleapis.com/auth/adwords")}";
}
