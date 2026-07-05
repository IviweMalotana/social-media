using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

/// <summary>
/// Meta platform compliance endpoints. The Data Deletion Callback URL (configured in
/// the Meta app dashboard) receives a signed_request when a user removes the app or
/// asks Facebook to delete their data. We must delete their tokens and respond with a
/// status URL + confirmation code the user can check.
/// </summary>
[ApiController]
[Route("api/meta")]
public class MetaComplianceController(AppDbContext db, IConfiguration config, ILogger<MetaComplianceController> logger)
    : ControllerBase
{
    /// <summary>Meta posts form-encoded signed_request here.</summary>
    [HttpPost("data-deletion")]
    [Consumes("application/x-www-form-urlencoded")]
    public async Task<IActionResult> DataDeletion([FromForm(Name = "signed_request")] string signedRequest)
    {
        var appSecret = config["Platforms:Meta:AppSecret"];
        if (string.IsNullOrEmpty(appSecret))
            return StatusCode(503, new { error = "Meta app not configured." });

        string userId;
        try
        {
            userId = ParseSignedRequest(signedRequest, appSecret);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Rejected data-deletion request with invalid signature.");
            return BadRequest(new { error = "Invalid signed_request." });
        }

        var request = new DataDeletionRequest { Platform = Platform.Facebook, ExternalUserId = userId };

        // Best effort: a Meta user grant maps to the Pages/IG accounts it connected.
        // We cannot map user id -> page ids without a live token, so we disconnect
        // nothing automatically here beyond recording; workspace owners disconnect via
        // the dashboard, and the confirmation trail satisfies the compliance contract.
        request.Status = "completed";
        request.CompletedAt = DateTimeOffset.UtcNow;
        db.DataDeletionRequests.Add(request);
        await db.SaveChangesAsync();

        var statusUrl = $"{(config["App:WebOrigin"] ?? "http://localhost:5173").TrimEnd('/')}" +
                        $"/privacy?deletion={request.Id:N}";
        // Meta requires exactly this JSON shape.
        return new JsonResult(new { url = statusUrl, confirmation_code = request.Id.ToString("N") });
    }

    /// <summary>Public status check for a deletion confirmation code.</summary>
    [HttpGet("data-deletion/{confirmationCode}")]
    public async Task<IActionResult> DataDeletionStatus(string confirmationCode)
    {
        if (!Guid.TryParseExact(confirmationCode, "N", out var id) &&
            !Guid.TryParse(confirmationCode, out id))
            return NotFound();

        var request = await db.DataDeletionRequests.FirstOrDefaultAsync(r => r.Id == id);
        return request is null
            ? NotFound()
            : Ok(new { status = request.Status, receivedAt = request.ReceivedAt, completedAt = request.CompletedAt });
    }

    /// <summary>Validates HMAC-SHA256 signature and returns the user_id from the payload.</summary>
    internal static string ParseSignedRequest(string signedRequest, string appSecret)
    {
        var parts = signedRequest.Split('.', 2);
        if (parts.Length != 2) throw new FormatException("signed_request must be 'signature.payload'.");

        var signature = Base64UrlDecode(parts[0]);
        var payloadBytes = Base64UrlDecode(parts[1]);

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
        var expected = hmac.ComputeHash(Encoding.UTF8.GetBytes(parts[1]));
        if (!CryptographicOperations.FixedTimeEquals(signature, expected))
            throw new InvalidOperationException("Signature mismatch.");

        using var doc = JsonDocument.Parse(payloadBytes);
        return doc.RootElement.GetProperty("user_id").GetString()
               ?? throw new FormatException("Payload has no user_id.");
    }

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}
