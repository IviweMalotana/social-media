using System.Text;
using System.Text.Json;
using System.Web;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Platforms;

/// <summary>
/// Pinterest API v5. Trial-tier apps work only against sandbox data; Standard access
/// (applied for in the developer portal) is required to create real pins. Access tokens
/// live ~30 days and are rotated by the health sweep via <see cref="RefreshTokenAsync"/>.
/// Pins are created on the account's first board until the per-target board picker
/// lands; the pin links back to the URL in the caption's first line when present.
/// </summary>
public sealed class PinterestAdapter(IConfiguration config, IHttpClientFactory httpFactory) : PlatformAdapterBase
{
    private const string ApiBase = "https://api.pinterest.com/v5";

    public override Platform Platform => Platform.Pinterest;

    private HttpClient Http => httpFactory.CreateClient("pinterest");
    private string AppId => config["Platforms:Pinterest:AppId"] ?? "";
    private string AppSecret => config["Platforms:Pinterest:AppSecret"] ?? "";

    public override string GetAuthorizationUrl(ConnectContext ctx) =>
        "https://www.pinterest.com/oauth/" +
        $"?client_id={AppId}" +
        $"&redirect_uri={HttpUtility.UrlEncode(ctx.RedirectUri)}" +
        $"&state={ctx.State}" +
        "&response_type=code" +
        "&scope=boards:read,boards:write,pins:read,pins:write,user_accounts:read";

    public override async Task<IReadOnlyList<ConnectionResult>> CompleteConnectionAsync(
        string code, ConnectContext ctx, CancellationToken ct = default)
    {
        var token = await RequestTokenAsync(new()
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = ctx.RedirectUri,
        }, ct);

        var (username, avatarUrl) = await GetUserAccountAsync(token.AccessToken, ct);
        return
        [
            new ConnectionResult(
                username, $"@{username}", avatarUrl,
                token.AccessToken, token.RefreshToken, token.ExpiresAt,
                Scopes: "boards:write,pins:write"),
        ];
    }

    public override async Task<ConnectionResult?> RefreshTokenAsync(
        ConnectedAccount account, string refreshToken, CancellationToken ct = default)
    {
        var token = await RequestTokenAsync(new()
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
        }, ct);

        return new ConnectionResult(
            account.ExternalId, account.DisplayName, account.AvatarUrl,
            token.AccessToken,
            token.RefreshToken ?? refreshToken, // Pinterest may not rotate the refresh token
            token.ExpiresAt, account.Scopes);
    }

    public override async Task<TokenHealthResult> ValidateTokenAsync(
        ConnectedAccount account, string accessToken, CancellationToken ct = default)
    {
        try
        {
            await GetUserAccountAsync(accessToken, ct);
            return new TokenHealthResult(AccountHealth.Healthy);
        }
        catch (PinterestApiException)
        {
            return new TokenHealthResult(AccountHealth.Revoked, "Pinterest rejected the stored token.");
        }
    }

    public override async Task<PublishResult> PublishAsync(
        PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default)
    {
        var image = draft.Media.FirstOrDefault(m => m.ContentType.StartsWith("image/"));
        if (image is null)
            return PublishResult.Fail("Pinterest pins need an image.");

        try
        {
            var boardId = await GetFirstBoardIdAsync(accessToken, ct);
            if (boardId is null)
                return PublishResult.Fail("This Pinterest account has no boards — create one on Pinterest first.");

            // Composer-provided options win; fall back to deriving from the caption.
            var options = target.OptionsJson is null
                ? null
                : JsonSerializer.Deserialize<Dictionary<string, string>>(target.OptionsJson);
            var title = options?.GetValueOrDefault("title") is { Length: > 0 } t
                ? (t.Length > 100 ? t[..100] : t)
                : draft.Caption.Split('\n')[0] is { Length: > 0 } first
                    ? (first.Length > 100 ? first[..100] : first)
                    : "New pin";
            var link = options?.GetValueOrDefault("link") is { Length: > 0 } l
                ? l
                : draft.Caption
                    .Split('\n', StringSplitOptions.TrimEntries)
                    .FirstOrDefault(line => line.StartsWith("http://") || line.StartsWith("https://"));

            var body = JsonSerializer.Serialize(new
            {
                board_id = boardId,
                title,
                description = draft.Caption.Length > 500 ? draft.Caption[..500] : draft.Caption,
                link,
                media_source = new
                {
                    source_type = "image_url",
                    url = FacebookAdapter.MediaUrl(config, image),
                },
            });

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/pins")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new("Bearer", accessToken);
            using var doc = await SendAsync(request, ct);

            var pinId = doc.RootElement.GetProperty("id").GetString()!;
            return PublishResult.Ok(pinId, $"https://www.pinterest.com/pin/{pinId}/");
        }
        catch (PinterestApiException ex)
        {
            return PublishResult.Fail(ex.Message);
        }
        catch (HttpRequestException ex)
        {
            return PublishResult.Fail($"Network error calling Pinterest: {ex.Message}");
        }
    }

    private sealed record TokenResponse(string AccessToken, string? RefreshToken, DateTimeOffset? ExpiresAt);

    private async Task<TokenResponse> RequestTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/oauth/token")
        {
            Content = new FormUrlEncodedContent(form),
        };
        request.Headers.Authorization = new(
            "Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{AppId}:{AppSecret}")));
        using var doc = await SendAsync(request, ct);
        var root = doc.RootElement;
        return new TokenResponse(
            root.GetProperty("access_token").GetString()!,
            root.TryGetProperty("refresh_token", out var r) ? r.GetString() : null,
            root.TryGetProperty("expires_in", out var e)
                ? DateTimeOffset.UtcNow.AddSeconds(e.GetInt64())
                : null);
    }

    private async Task<(string Username, string? AvatarUrl)> GetUserAccountAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/user_account");
        request.Headers.Authorization = new("Bearer", accessToken);
        using var doc = await SendAsync(request, ct);
        var root = doc.RootElement;
        return (
            root.GetProperty("username").GetString()!,
            root.TryGetProperty("profile_image", out var p) ? p.GetString() : null);
    }

    private async Task<string?> GetFirstBoardIdAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/boards?page_size=1");
        request.Headers.Authorization = new("Bearer", accessToken);
        using var doc = await SendAsync(request, ct);
        var items = doc.RootElement.GetProperty("items");
        return items.GetArrayLength() > 0 ? items[0].GetProperty("id").GetString() : null;
    }

    private async Task<JsonDocument> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var response = await Http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            string message = body;
            try
            {
                using var error = JsonDocument.Parse(body);
                if (error.RootElement.TryGetProperty("message", out var m))
                    message = m.GetString() ?? body;
            }
            catch
            {
                // keep raw body
            }
            throw new PinterestApiException($"Pinterest API error ({(int)response.StatusCode}): {message}");
        }
        return JsonDocument.Parse(body);
    }
}

public class PinterestApiException(string message) : Exception(message);
