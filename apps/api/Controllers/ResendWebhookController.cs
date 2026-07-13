using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

/// <summary>
/// Receives Resend delivery events (configure the endpoint + signing secret in the
/// Resend dashboard, then set Resend__WebhookSecret). Delivered/bounced/complained
/// land on the matching EmailLog; bounces and complaints auto-suppress the address.
/// </summary>
[ApiController]
public class ResendWebhookController(
    AppDbContext db, IConfiguration config, IWebHostEnvironment env,
    ILogger<ResendWebhookController> logger) : ControllerBase
{
    [HttpPost("/api/email/webhooks/resend")]
    [AllowAnonymous]
    public async Task<IActionResult> Receive()
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync();

        var secret = config["Resend:WebhookSecret"];
        if (!string.IsNullOrEmpty(secret))
        {
            var ok = SvixSignature.Verify(
                secret,
                Request.Headers["svix-id"].ToString(),
                Request.Headers["svix-timestamp"].ToString(),
                Request.Headers["svix-signature"].ToString(),
                payload);
            if (!ok) return Unauthorized();
        }
        else if (!env.IsDevelopment())
        {
            // Unauthenticated webhooks could poison the logs/suppression list — refuse
            // until the signing secret is configured.
            return StatusCode(503, new
            {
                error = "Set Resend__WebhookSecret (from the Resend webhook settings) before enabling webhooks.",
            });
        }

        JsonDocument doc;
        try { doc = JsonDocument.Parse(payload); }
        catch (JsonException) { return BadRequest(); }

        using (doc)
        {
            var type = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
            var emailId = doc.RootElement.TryGetProperty("data", out var data) &&
                          data.TryGetProperty("email_id", out var idEl)
                ? idEl.GetString()
                : null;
            if (type is null || emailId is null) return Ok(); // not an event we track

            var status = type switch
            {
                "email.delivered" => "delivered",
                "email.bounced" => "bounced",
                "email.complained" => "complained",
                _ => null,
            };
            if (status is null) return Ok();

            var log = await db.EmailLogs.FirstOrDefaultAsync(l => l.ProviderId == emailId);
            if (log is null)
            {
                logger.LogWarning("Resend webhook {Type} for unknown email id {EmailId}", type, emailId);
                return Ok();
            }

            log.Status = status;

            if (status is "bounced" or "complained")
            {
                var email = log.ToAddress.Trim().ToLowerInvariant();
                if (!await db.SuppressionEntries.AnyAsync(s =>
                        s.WorkspaceId == log.WorkspaceId && s.Email == email))
                    db.SuppressionEntries.Add(new SuppressionEntry
                    {
                        WorkspaceId = log.WorkspaceId,
                        Email = email,
                        Reason = status,
                    });

                if (log.ProspectId is { } prospectId)
                {
                    var prospect = await db.Prospects.FirstOrDefaultAsync(p => p.Id == prospectId);
                    if (prospect is not null)
                    {
                        // A complaint is an explicit "stop"; a bounce means the address
                        // is dead. Either way the sequence is over.
                        if (status == "complained") prospect.Status = ProspectStatus.OptedOut;
                        prospect.NextFollowUpAt = null;

                        var enrollments = await db.Enrollments
                            .Where(e => e.ProspectId == prospect.Id && e.Status == EnrollmentStatus.Active)
                            .ToListAsync();
                        foreach (var enrollment in enrollments)
                        {
                            enrollment.Status = EnrollmentStatus.Suppressed;
                            enrollment.NextSendAt = null;
                        }
                        var pending = await db.CampaignMessages
                            .Where(m => m.ProspectId == prospect.Id &&
                                        (m.Status == MessageStatus.Drafted ||
                                         m.Status == MessageStatus.Approved))
                            .ToListAsync();
                        foreach (var message in pending)
                        {
                            message.Status = MessageStatus.Rejected;
                            message.Error = $"Address {status}.";
                        }
                    }
                }
            }

            await db.SaveChangesAsync();
        }
        return Ok();
    }
}
