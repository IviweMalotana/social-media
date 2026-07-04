using System.Text;
using System.Text.Json;
using System.Web;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

/// <summary>
/// TikTok Content Posting API (open.tiktokapis.com v2).
///
/// Reality checks baked in:
/// - Access tokens live 24 hours; refresh tokens ~365 days. The health sweep refreshes
///   via <see cref="RefreshTokenAsync"/> so publishing never hits a dead token.
/// - Until the app passes TikTok's Direct Post audit, published videos are forced to
///   SELF_ONLY (visible only to the creator). Set Platforms:TikTok:Audited=true after
///   approval to post publicly.
/// - PULL_FROM_URL requires the media domain to be verified in the TikTok developer
///   portal (covered in docs/PLATFORM-SETUP.md).
/// </summary>
public sealed class TikTokAdapter(IConfiguration config, IHttpClientFactory httpFactory) : PlatformAdapterBase
{
    private const string ApiBase = "https://open.tiktokapis.com/v2";

    public override Platform Platform => Platform.TikTok;

    private HttpClient Http => httpFactory.CreateClient("tiktok");
    private string ClientKey => config["Platforms:TikTok:ClientKey"] ?? "";
    private string ClientSecret => config["Platforms:TikTok:ClientSecret"] ?? "";
    private bool Audited => config.GetValue("Platforms:TikTok:Audited", false);

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.tiktok.com/v2/auth/authorize/" +
        $"?client_key={ClientKey}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&response_type=code" +
        "&scope=user.info.basic,video.publish,video.upload";

    public override async Task<IReadOnlyList<ConnectionResult>> CompleteConnectionAsync(
        string code, ConnectContext ctx, CancellationToken ct = default)
    {
        var token = await RequestTokenAsync(new()
        {
            ["client_key"] = ClientKey,
            ["client_secret"] = ClientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = ctx.RedirectUri,
        }, ct);

        var (displayName, avatarUrl) = await GetUserInfoAsync(token.AccessToken, ct);
        return
        [
            new ConnectionResult(
                token.OpenId, displayName, avatarUrl,
                token.AccessToken, token.RefreshToken, token.ExpiresAt,
                Scopes: token.Scope),
        ];
    }

    public override async Task<ConnectionResult?> RefreshTokenAsync(
        ConnectedAccount account, string refreshToken, CancellationToken ct = default)
    {
        var token = await RequestTokenAsync(new()
        {
            ["client_key"] = ClientKey,
            ["client_secret"] = ClientSecret,
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
        }, ct);

        return new ConnectionResult(
            account.ExternalId, account.DisplayName, account.AvatarUrl,
            token.AccessToken, token.RefreshToken, token.ExpiresAt, token.Scope);
    }

    public override async Task<TokenHealthResult> ValidateTokenAsync(
        ConnectedAccount account, string accessToken, CancellationToken ct = default)
    {
        try
        {
            await GetUserInfoAsync(accessToken, ct);
            return new TokenHealthResult(AccountHealth.Healthy);
        }
        catch (TikTokApiException)
        {
            return new TokenHealthResult(AccountHealth.Revoked, "TikTok rejected the stored token.");
        }
    }

    public override async Task<PublishResult> PublishAsync(
        PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default)
    {
        var video = draft.Media.FirstOrDefault(m => m.ContentType.StartsWith("video/"));
        if (video is null)
            return PublishResult.Fail("TikTok direct post needs a video (photo posts land in a later phase).");

        try
        {
            var body = JsonSerializer.Serialize(new
            {
                post_info = new
                {
                    title = draft.Caption.Length > 2200 ? draft.Caption[..2200] : draft.Caption,
                    // SELF_ONLY is the only level TikTok accepts before the app passes audit.
                    privacy_level = Audited ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY",
                },
                source_info = new
                {
                    source = "PULL_FROM_URL",
                    video_url = FacebookAdapter.MediaUrl(config, video),
                },
            });

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/post/publish/video/init/")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new("Bearer", accessToken);
            using var doc = await SendAsync(request, ct);

            var publishId = doc.RootElement.GetProperty("data").GetProperty("publish_id").GetString()!;
            var note = Audited ? null : " (posted as private — app not yet through TikTok audit)";
            return PublishResult.Ok(publishId, null) with
            {
                Error = note, // non-fatal note surfaced alongside success
            };
        }
        catch (TikTokApiException ex)
        {
            return PublishResult.Fail(ex.Message);
        }
        catch (HttpRequestException ex)
        {
            return PublishResult.Fail($"Network error calling TikTok: {ex.Message}");
        }
    }

    private sealed record TokenResponse(string AccessToken, string RefreshToken, string OpenId, string Scope, DateTimeOffset ExpiresAt);

    private async Task<TokenResponse> RequestTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/oauth/token/")
        {
            Content = new FormUrlEncodedContent(form),
        };
        using var doc = await SendAsync(request, ct);
        var root = doc.RootElement;
        return new TokenResponse(
            root.GetProperty("access_token").GetString()!,
            root.GetProperty("refresh_token").GetString()!,
            root.TryGetProperty("open_id", out var id) ? id.GetString()! : "",
            root.TryGetProperty("scope", out var s) ? s.GetString() ?? "" : "",
            DateTimeOffset.UtcNow.AddSeconds(root.GetProperty("expires_in").GetInt64()));
    }

    private async Task<(string DisplayName, string? AvatarUrl)> GetUserInfoAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get, $"{ApiBase}/user/info/?fields=open_id,display_name,avatar_url");
        request.Headers.Authorization = new("Bearer", accessToken);
        using var doc = await SendAsync(request, ct);
        var user = doc.RootElement.GetProperty("data").GetProperty("user");
        return (
            user.TryGetProperty("display_name", out var n) ? n.GetString() ?? "TikTok creator" : "TikTok creator",
            user.TryGetProperty("avatar_url", out var a) ? a.GetString() : null);
    }

    private async Task<JsonDocument> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var response = await Http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(body);

        // TikTok wraps errors as {"error":{"code":"...","message":"..."}}; code "ok" = success.
        if (doc.RootElement.TryGetProperty("error", out var error) &&
            error.TryGetProperty("code", out var errorCode) &&
            errorCode.GetString() is { } codeValue && codeValue != "ok")
        {
            var message = error.TryGetProperty("message", out var m) ? m.GetString() : body;
            doc.Dispose();
            throw new TikTokApiException($"TikTok API error ({codeValue}): {message}");
        }
        if (!response.IsSuccessStatusCode)
        {
            doc.Dispose();
            throw new TikTokApiException($"TikTok API error ({(int)response.StatusCode}): {body}");
        }
        return doc;
    }
}

public class TikTokApiException(string message) : Exception(message);
