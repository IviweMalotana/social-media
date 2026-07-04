using System.Text.Json;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

public record MetaPage(
    string Id,
    string Name,
    string AccessToken,
    string? PictureUrl,
    string? InstagramId,
    string? InstagramUsername,
    string? InstagramPictureUrl);

/// <summary>
/// Thin client over the Meta Graph API (v21.0) shared by the Facebook, Instagram, and
/// (later) WhatsApp adapters. All calls need a configured Meta app
/// (Platforms:Meta:AppId / AppSecret); publishing to real accounts additionally needs
/// the app to have passed Meta App Review for the publish scopes.
/// </summary>
public sealed class MetaGraphClient(IHttpClientFactory httpFactory, IConfiguration config)
{
    private const string BaseUrl = "https://graph.facebook.com/v21.0";

    private string AppId => config["Platforms:Meta:AppId"] ?? "";
    private string AppSecret => config["Platforms:Meta:AppSecret"] ?? "";

    private HttpClient Http => httpFactory.CreateClient("meta");

    /// <summary>Exchange the callback code for a short-lived user token.</summary>
    public async Task<string> ExchangeCodeAsync(string code, string redirectUri, CancellationToken ct)
    {
        var url = $"{BaseUrl}/oauth/access_token" +
                  $"?client_id={AppId}&client_secret={AppSecret}" +
                  $"&redirect_uri={Uri.EscapeDataString(redirectUri)}&code={Uri.EscapeDataString(code)}";
        using var doc = await GetJsonAsync(url, ct);
        return doc.RootElement.GetProperty("access_token").GetString()!;
    }

    /// <summary>Upgrade to a long-lived (~60 day) user token.</summary>
    public async Task<(string Token, DateTimeOffset? ExpiresAt)> GetLongLivedTokenAsync(string userToken, CancellationToken ct)
    {
        var url = $"{BaseUrl}/oauth/access_token" +
                  $"?grant_type=fb_exchange_token&client_id={AppId}&client_secret={AppSecret}" +
                  $"&fb_exchange_token={Uri.EscapeDataString(userToken)}";
        using var doc = await GetJsonAsync(url, ct);
        var token = doc.RootElement.GetProperty("access_token").GetString()!;
        DateTimeOffset? expires = doc.RootElement.TryGetProperty("expires_in", out var e)
            ? DateTimeOffset.UtcNow.AddSeconds(e.GetInt64())
            : null;
        return (token, expires);
    }

    /// <summary>Every Page the user manages, with its Page token and linked IG account.</summary>
    public async Task<IReadOnlyList<MetaPage>> GetPagesAsync(string userToken, CancellationToken ct)
    {
        var url = $"{BaseUrl}/me/accounts" +
                  "?fields=id,name,access_token,picture{url}," +
                  "instagram_business_account{id,username,profile_picture_url}" +
                  $"&access_token={Uri.EscapeDataString(userToken)}";
        using var doc = await GetJsonAsync(url, ct);

        var pages = new List<MetaPage>();
        foreach (var page in doc.RootElement.GetProperty("data").EnumerateArray())
        {
            string? igId = null, igUser = null, igPic = null;
            if (page.TryGetProperty("instagram_business_account", out var ig))
            {
                igId = ig.GetProperty("id").GetString();
                igUser = ig.TryGetProperty("username", out var u) ? u.GetString() : null;
                igPic = ig.TryGetProperty("profile_picture_url", out var p) ? p.GetString() : null;
            }
            pages.Add(new MetaPage(
                page.GetProperty("id").GetString()!,
                page.GetProperty("name").GetString()!,
                page.GetProperty("access_token").GetString()!,
                page.TryGetProperty("picture", out var pic)
                    ? pic.GetProperty("data").GetProperty("url").GetString()
                    : null,
                igId, igUser, igPic));
        }
        return pages;
    }

    /// <summary>Check a stored token via /debug_token using the app token.</summary>
    public async Task<TokenHealthResult> DebugTokenAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(AppId) || string.IsNullOrEmpty(AppSecret))
            return new TokenHealthResult(AccountHealth.Healthy, "Meta app not configured; skipping check.");

        var url = $"{BaseUrl}/debug_token?input_token={Uri.EscapeDataString(token)}" +
                  $"&access_token={AppId}|{AppSecret}";
        using var doc = await GetJsonAsync(url, ct);
        var data = doc.RootElement.GetProperty("data");
        var isValid = data.TryGetProperty("is_valid", out var v) && v.GetBoolean();
        if (!isValid) return new TokenHealthResult(AccountHealth.Revoked, "Token is no longer valid.");

        if (data.TryGetProperty("expires_at", out var exp) && exp.GetInt64() is > 0 and var unix)
        {
            var expiresAt = DateTimeOffset.FromUnixTimeSeconds(unix);
            if (expiresAt <= DateTimeOffset.UtcNow) return new TokenHealthResult(AccountHealth.Expired);
            if (expiresAt <= DateTimeOffset.UtcNow.AddDays(7)) return new TokenHealthResult(AccountHealth.ExpiringSoon);
        }
        return new TokenHealthResult(AccountHealth.Healthy);
    }

    /// <summary>Text (optionally with link) post to a Page feed. Returns the post id.</summary>
    public async Task<string> PublishPageFeedAsync(string pageId, string pageToken, string message, CancellationToken ct)
    {
        using var doc = await PostFormAsync($"{BaseUrl}/{pageId}/feed", new()
        {
            ["message"] = message,
            ["access_token"] = pageToken,
        }, ct);
        return doc.RootElement.GetProperty("id").GetString()!;
    }

    /// <summary>Photo post to a Page. The image must be publicly reachable.</summary>
    public async Task<string> PublishPagePhotoAsync(string pageId, string pageToken, string caption, string imageUrl, CancellationToken ct)
    {
        using var doc = await PostFormAsync($"{BaseUrl}/{pageId}/photos", new()
        {
            ["url"] = imageUrl,
            ["caption"] = caption,
            ["access_token"] = pageToken,
        }, ct);
        return doc.RootElement.TryGetProperty("post_id", out var postId)
            ? postId.GetString()!
            : doc.RootElement.GetProperty("id").GetString()!;
    }

    /// <summary>
    /// Instagram two-step publish: create a media container, then publish it.
    /// Counts against the account's 25-per-24h API publish budget.
    /// </summary>
    public async Task<string> PublishInstagramImageAsync(string igUserId, string pageToken, string caption, string imageUrl, CancellationToken ct)
    {
        using var container = await PostFormAsync($"{BaseUrl}/{igUserId}/media", new()
        {
            ["image_url"] = imageUrl,
            ["caption"] = caption,
            ["access_token"] = pageToken,
        }, ct);
        var creationId = container.RootElement.GetProperty("id").GetString()!;

        using var published = await PostFormAsync($"{BaseUrl}/{igUserId}/media_publish", new()
        {
            ["creation_id"] = creationId,
            ["access_token"] = pageToken,
        }, ct);
        return published.RootElement.GetProperty("id").GetString()!;
    }

    /// <summary>Permalink for a published IG media id (best effort).</summary>
    public async Task<string?> GetInstagramPermalinkAsync(string mediaId, string pageToken, CancellationToken ct)
    {
        try
        {
            var url = $"{BaseUrl}/{mediaId}?fields=permalink&access_token={Uri.EscapeDataString(pageToken)}";
            using var doc = await GetJsonAsync(url, ct);
            return doc.RootElement.TryGetProperty("permalink", out var p) ? p.GetString() : null;
        }
        catch
        {
            return null;
        }
    }

    public async Task<PostInsights> GetPagePostInsightsAsync(string postId, string pageToken, CancellationToken ct)
    {
        var url = $"{BaseUrl}/{postId}" +
                  "?fields=shares,likes.summary(true),comments.summary(true)" +
                  $"&access_token={Uri.EscapeDataString(pageToken)}";
        using var doc = await GetJsonAsync(url, ct);
        var root = doc.RootElement;
        long likes = root.TryGetProperty("likes", out var l)
            ? l.GetProperty("summary").GetProperty("total_count").GetInt64() : 0;
        long comments = root.TryGetProperty("comments", out var c)
            ? c.GetProperty("summary").GetProperty("total_count").GetInt64() : 0;
        long shares = root.TryGetProperty("shares", out var s)
            ? s.GetProperty("count").GetInt64() : 0;
        return new PostInsights(0, likes, comments, shares, 0);
    }

    public async Task<PostInsights> GetInstagramInsightsAsync(string mediaId, string pageToken, CancellationToken ct)
    {
        var url = $"{BaseUrl}/{mediaId}/insights?metric=impressions,likes,comments,shares" +
                  $"&access_token={Uri.EscapeDataString(pageToken)}";
        using var doc = await GetJsonAsync(url, ct);

        long impressions = 0, likes = 0, comments = 0, shares = 0;
        foreach (var metric in doc.RootElement.GetProperty("data").EnumerateArray())
        {
            var name = metric.GetProperty("name").GetString();
            var value = metric.GetProperty("values")[0].GetProperty("value").GetInt64();
            switch (name)
            {
                case "impressions": impressions = value; break;
                case "likes": likes = value; break;
                case "comments": comments = value; break;
                case "shares": shares = value; break;
            }
        }
        return new PostInsights(impressions, likes, comments, shares, 0);
    }

    private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken ct)
    {
        var response = await Http.GetAsync(url, ct);
        return await ReadAsync(response, ct);
    }

    private async Task<JsonDocument> PostFormAsync(string url, Dictionary<string, string> form, CancellationToken ct)
    {
        var response = await Http.PostAsync(url, new FormUrlEncodedContent(form), ct);
        return await ReadAsync(response, ct);
    }

    private static async Task<JsonDocument> ReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            // Graph errors arrive as {"error":{"message":...}} — surface the message.
            string message;
            try
            {
                using var error = JsonDocument.Parse(body);
                message = error.RootElement.GetProperty("error").GetProperty("message").GetString()
                          ?? body;
            }
            catch
            {
                message = body;
            }
            throw new MetaGraphException($"Meta Graph API error ({(int)response.StatusCode}): {message}");
        }
        return JsonDocument.Parse(body);
    }
}

public class MetaGraphException(string message) : Exception(message);
