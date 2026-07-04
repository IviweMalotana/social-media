using System.Web;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

// Phase 0: every adapter builds its real OAuth authorization URL (client ids come from
// configuration) and enforces real compose-time rules via PlatformAdapterBase. The
// token exchange, publishing, and insights calls are implemented per build phase.

/// <summary>Facebook Pages. Shares the Meta OAuth app with Instagram (Phase 1).</summary>
public sealed class FacebookAdapter(IConfiguration config) : PlatformAdapterBase
{
    public override Platform Platform => Platform.Facebook;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.facebook.com/v21.0/dialog/oauth" +
        $"?client_id={config["Platforms:Meta:AppId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&scope=pages_show_list,pages_manage_posts,pages_read_engagement,business_management";
}

/// <summary>Instagram professional accounts via the Instagram Graph API (Phase 1).</summary>
public sealed class InstagramAdapter(IConfiguration config) : PlatformAdapterBase
{
    public override Platform Platform => Platform.Instagram;

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.facebook.com/v21.0/dialog/oauth" +
        $"?client_id={config["Platforms:Meta:AppId"]}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&scope=instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list";
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
