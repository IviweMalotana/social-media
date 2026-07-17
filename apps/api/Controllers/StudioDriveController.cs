using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SocialMedia.Api.Controllers;

/// <summary>
/// Proxy for the studio's Save-to-Drive button.
///
/// The browser can't safely hold the shared secret bdp-api's Drive endpoint
/// requires, so it POSTs the multipart form here (scoped by the scheduler's
/// existing JWT — [Authorize]). This controller adds the X-Api-Key header
/// server-side and forwards to bdp-api's /api/studio/drive-upload, then
/// returns bdp-api's per-file success/failure response back to the browser
/// verbatim.
///
/// Configuration
///   Studio:BdpApiBaseUrl   — e.g. https://bdp-api-production.up.railway.app
///                            (or STUDIO_BDP_API_BASE_URL env var)
///   Studio:UploadApiKey    — the same secret set as STUDIO_UPLOAD_API_KEY
///                            on the bdp-api service
///                            (or STUDIO_UPLOAD_API_KEY env var here too)
///   Studio:DriveFolderId   — default Drive folder to upload into if the
///                            request doesn't override it
///                            (or STUDIO_DRIVE_FOLDER_ID env var)
///
/// When either the base URL or the API key isn't set, the endpoint returns
/// 503 — the frontend hides the Save-to-Drive button in that case, keeping
/// the ZIP download as the fallback.
/// </summary>
[ApiController]
[Route("api/studio")]
[Authorize]
public class StudioDriveController(IHttpClientFactory httpFactory, IConfiguration config, ILogger<StudioDriveController> logger) : ControllerBase
{
    public record UploadedFile(string Name, string DriveUrl);
    public record FailedFile(string Name, string Error);
    public record UploadResponse(List<UploadedFile> Uploaded, List<FailedFile> Failed);

    [HttpPost("drive-upload")]
    [RequestSizeLimit(209_715_200)] // 200 MB — matches bdp-api's cap
    public async Task<IActionResult> Upload([FromForm] IFormFileCollection files, [FromQuery] string? folderId = null, CancellationToken cancel = default)
    {
        var baseUrl = Environment.GetEnvironmentVariable("STUDIO_BDP_API_BASE_URL")
            ?? config["Studio:BdpApiBaseUrl"];
        var apiKey = Environment.GetEnvironmentVariable("STUDIO_UPLOAD_API_KEY")
            ?? config["Studio:UploadApiKey"];
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
            return StatusCode(503, new { message = "Studio Drive integration not configured — set STUDIO_BDP_API_BASE_URL and STUDIO_UPLOAD_API_KEY." });

        if (files.Count == 0) return BadRequest(new { message = "No files uploaded." });

        var effectiveFolderId = folderId
            ?? Environment.GetEnvironmentVariable("STUDIO_DRIVE_FOLDER_ID")
            ?? config["Studio:DriveFolderId"];

        var url = $"{baseUrl.TrimEnd('/')}/api/studio/drive-upload"
            + (string.IsNullOrWhiteSpace(effectiveFolderId) ? string.Empty : $"?folderId={Uri.EscapeDataString(effectiveFolderId)}");

        using var content = new MultipartFormDataContent();
        // Stream each browser-uploaded file straight through — no temp files, no
        // double-buffering. The MemoryStream owns the copy long enough for the
        // HTTP send to consume it.
        var streams = new List<Stream>();
        try
        {
            foreach (var file in files)
            {
                var ms = new MemoryStream();
                await file.CopyToAsync(ms, cancel);
                ms.Position = 0;
                streams.Add(ms);
                var part = new StreamContent(ms);
                if (!string.IsNullOrWhiteSpace(file.ContentType))
                    part.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
                // bdp-api reads files by field name "files" (the parameter name);
                // include the original file name so uploaded Drive names match.
                content.Add(part, "files", file.FileName);
            }

            var http = httpFactory.CreateClient();
            var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
            req.Headers.Add("X-Api-Key", apiKey);
            using var resp = await http.SendAsync(req, cancel);
            var body = await resp.Content.ReadAsStringAsync(cancel);
            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("bdp-api drive upload returned {Status}: {Body}", (int)resp.StatusCode, body);
                return StatusCode((int)resp.StatusCode, new { message = $"bdp-api returned {(int)resp.StatusCode}", body });
            }
            return Content(body, "application/json");
        }
        finally
        {
            foreach (var s in streams) await s.DisposeAsync();
        }
    }
}
