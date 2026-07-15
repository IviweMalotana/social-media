using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Services;

public record EmailSendResult(bool Ok, string? ProviderId, string? Error);

/// <summary>
/// Outbound email transport. Resend's HTTPS API is the production path — cloud hosts
/// (Railway included) block outbound SMTP ports, so SMTP silently times out in prod.
/// </summary>
public interface IEmailTransport
{
    string Name { get; }
    Task<EmailSendResult> SendAsync(
        string from, string to, string subject, string text, string? html = null,
        IReadOnlyDictionary<string, string>? headers = null, CancellationToken ct = default);
}

public sealed class NullEmailTransport : IEmailTransport
{
    public string Name => "none";
    public Task<EmailSendResult> SendAsync(
        string from, string to, string subject, string text, string? html = null,
        IReadOnlyDictionary<string, string>? headers = null, CancellationToken ct = default)
        => Task.FromResult(new EmailSendResult(false, null, "No email transport configured — set Resend__ApiKey."));
}

public sealed class ResendEmailTransport(IHttpClientFactory httpFactory, IConfiguration config) : IEmailTransport
{
    public string Name => "resend";

    public async Task<EmailSendResult> SendAsync(
        string from, string to, string subject, string text, string? html = null,
        IReadOnlyDictionary<string, string>? headers = null, CancellationToken ct = default)
    {
        var http = httpFactory.CreateClient("resend");
        // Resend rejects null fields — only include what's set.
        var payload = new Dictionary<string, object> { ["from"] = from, ["to"] = new[] { to }, ["subject"] = subject, ["text"] = text };
        if (html is not null) payload["html"] = html;
        if (headers is not null) payload["headers"] = headers;
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new("Bearer", config["Resend:ApiKey"]);

        var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            // The body is where Resend explains itself (usually an unverified domain).
            return new EmailSendResult(false, null, $"Resend {(int)response.StatusCode}: {body}");

        using var doc = JsonDocument.Parse(body);
        return new EmailSendResult(true, doc.RootElement.TryGetProperty("id", out var id) ? id.GetString() : null, null);
    }
}

/// <summary>
/// Orchestrates outreach sends with the guardrails the playbook requires: daily cap,
/// suppression of opted-out prospects, compliance footer on every email, full logging,
/// and the 3-emails-then-stop cadence bookkeeping.
/// </summary>
public class EmailService(AppDbContext db, IEmailTransport transport, IConfiguration config)
{
    public string Transport => transport.Name;
    public bool IsConfigured => transport.Name != "none";

    public int DailyCap => config.GetValue("Email:DailyCap", 50);

    private string FromHeader =>
        $"{config["Email:FromName"] ?? "Be Different Packaging"} <{config["Email:FromAddress"] ?? ""}>";

    public async Task<int> SentTodayAsync(Guid workspaceId)
    {
        var since = DateTimeOffset.UtcNow.AddHours(-24);
        return await db.EmailLogs.CountAsync(l =>
            l.WorkspaceId == workspaceId && l.Status == "sent" && l.CreatedAt >= since);
    }

    /// <summary>
    /// Sends one outreach email to a prospect. Returns (statusCode, payload) so the
    /// controller can pass the outcome straight through.
    /// </summary>
    public async Task<(int Code, object Payload)> SendToProspectAsync(
        Guid workspaceId, Prospect prospect, string subject, string body, CancellationToken ct = default)
    {
        if (!IsConfigured)
            return (503, new { error = "Email isn't configured — set Resend__ApiKey, Email__FromAddress and Email__FromName on the API service (from-address domain must be verified in Resend)." });
        var fromAddress = config["Email:FromAddress"];
        if (string.IsNullOrWhiteSpace(fromAddress))
            return (503, new { error = "Email__FromAddress isn't set — it must be an address on your Resend-verified domain." });
        // orders@ is the shop's transactional address — outreach from it would poison
        // its deliverability and confuse customers. Hard rule, no override.
        if (fromAddress.Trim().StartsWith("orders@", StringComparison.OrdinalIgnoreCase))
            return (503, new { error = "Email__FromAddress is orders@ — that address is transactional-only. Campaign sends from it are blocked; use ivi@ or another outreach address." });
        if (prospect.Status is ProspectStatus.OptedOut)
            return (409, new { error = "This prospect opted out — sends are suppressed permanently." });
        if (string.IsNullOrWhiteSpace(prospect.Email))
            return (400, new { error = "This prospect has no email address." });

        var email = prospect.Email.Trim();
        // The suppression list is checked on every send, no exceptions — it also covers
        // bounces/complaints reported by Resend and addresses of deleted prospects.
        if (await db.SuppressionEntries.AnyAsync(s =>
                s.WorkspaceId == workspaceId && s.Email == email.ToLower(), ct))
            return (409, new { error = "This address is on the suppression list (unsubscribed, bounced, or complained) — sends are blocked permanently." });

        if (prospect.EmailsSent >= 3)
            return (409, new { error = "Sequence complete (3 emails) — the playbook says stop." });

        var sentToday = await SentTodayAsync(workspaceId);
        if (sentToday >= DailyCap)
            return (429, new { error = $"Daily send cap reached ({DailyCap}/24h). Deliverability first — raise Email__DailyCap only as your domain warms up." });

        if (body.Contains('[') && body.Contains(']'))
            return (400, new { error = "The email still contains an unfilled [personalization] placeholder — fill it in before sending." });

        var result = await SendComposedAsync(workspaceId, prospect, subject, body, ct);

        if (result.Ok)
        {
            // Same cadence bookkeeping as manual log-email: 3 emails, 3-4 days apart, stop.
            prospect.EmailsSent++;
            prospect.LastContactedAt = DateTimeOffset.UtcNow;
            prospect.NextFollowUpAt = prospect.EmailsSent >= 3
                ? null
                : DateTimeOffset.UtcNow.AddDays(prospect.EmailsSent == 1 ? 3 : 4);
            if (prospect.Status == ProspectStatus.New) prospect.Status = ProspectStatus.Contacted;
        }
        await db.SaveChangesAsync(ct);

        return result.Ok
            ? (200, new { sent = true, providerId = result.ProviderId, emailsSent = prospect.EmailsSent })
            : (502, new { error = result.Error });
    }

    /// <summary>
    /// One-off announcement (new product/stock) to an ENGAGED prospect — same
    /// compliance rails as outreach (suppression, opt-out, cap, footer, unsubscribe)
    /// but no cadence bookkeeping: it neither counts toward nor advances the
    /// 3-email cold sequence.
    /// </summary>
    public async Task<(int Code, object Payload)> SendAnnouncementAsync(
        Guid workspaceId, Prospect prospect, string subject, string body, CancellationToken ct = default)
    {
        if (ConfigProblem() is { } problem) return problem;
        if (prospect.Status is ProspectStatus.OptedOut)
            return (409, new { error = "This prospect opted out — sends are suppressed permanently." });
        if (string.IsNullOrWhiteSpace(prospect.Email))
            return (400, new { error = "This prospect has no email address." });
        if (await db.SuppressionEntries.AnyAsync(s =>
                s.WorkspaceId == workspaceId && s.Email == prospect.Email.Trim().ToLower(), ct))
            return (409, new { error = "This address is on the suppression list — sends are blocked permanently." });
        if (await SentTodayAsync(workspaceId) >= DailyCap)
            return (429, new { error = $"Daily send cap reached ({DailyCap}/24h)." });
        if (body.Contains('[') && body.Contains(']'))
            return (400, new { error = "The email still contains an unfilled [placeholder]." });

        var result = await SendComposedAsync(workspaceId, prospect, subject, body, ct);
        await db.SaveChangesAsync(ct);
        return result.Ok
            ? (200, new { sent = true, providerId = result.ProviderId })
            : (502, new { error = result.Error });
    }

    /// <summary>Sends the composed email to yourself to check rendering — no prospect involved.</summary>
    public async Task<(int Code, object Payload)> SendTestAsync(
        Guid workspaceId, string toEmail, string subject, string body, CancellationToken ct = default)
    {
        if (ConfigProblem() is { } problem) return problem;
        var (text, html, headers) = Compose(body, unsubscribeUrl: null);
        var result = await transport.SendAsync(
            FromHeader, toEmail.Trim(), subject.Trim(), text, html, headers, ct);
        db.EmailLogs.Add(new EmailLog
        {
            WorkspaceId = workspaceId,
            ToAddress = toEmail.Trim(),
            Subject = subject.Trim(),
            Status = result.Ok ? "sent" : "failed",
            Error = result.Error,
            ProviderId = result.ProviderId,
        });
        await db.SaveChangesAsync(ct);
        return result.Ok
            ? (200, new { sent = true })
            : (502, new { error = result.Error });
    }

    private (int Code, object Payload)? ConfigProblem()
    {
        if (!IsConfigured)
            return (503, new { error = "Email isn't configured — set Resend__ApiKey, Email__FromAddress and Email__FromName on the API service (from-address domain must be verified in Resend)." });
        var fromAddress = config["Email:FromAddress"];
        if (string.IsNullOrWhiteSpace(fromAddress))
            return (503, new { error = "Email__FromAddress isn't set — it must be an address on your Resend-verified domain." });
        // orders@ is the shop's transactional address — outreach from it would poison
        // its deliverability and confuse customers. Hard rule, no override.
        if (fromAddress.Trim().StartsWith("orders@", StringComparison.OrdinalIgnoreCase))
            return (503, new { error = "Email__FromAddress is orders@ — that address is transactional-only. Campaign sends from it are blocked; use ivi@ or another outreach address." });
        return null;
    }

    /// <summary>Mints the unsubscribe token if needed, composes, sends, and logs — shared by outreach and announcements.</summary>
    private async Task<EmailSendResult> SendComposedAsync(
        Guid workspaceId, Prospect prospect, string subject, string body, CancellationToken ct)
    {
        // One-click unsubscribe: mint the prospect's token on first use and, when the
        // API's public URL is known, put a working link in the footer + RFC 8058 headers.
        prospect.UnsubscribeToken ??= Guid.NewGuid().ToString("N");
        var baseUrl = config["App:BaseUrl"]?.TrimEnd('/');
        var unsubscribeUrl = string.IsNullOrEmpty(baseUrl)
            ? null
            : $"{baseUrl}/api/unsubscribe/{prospect.UnsubscribeToken}";

        var (text, html, headers) = Compose(body, unsubscribeUrl);
        var result = await transport.SendAsync(
            FromHeader, prospect.Email.Trim(), subject.Trim(), text, html, headers, ct);

        db.EmailLogs.Add(new EmailLog
        {
            WorkspaceId = workspaceId,
            ProspectId = prospect.Id,
            ToAddress = prospect.Email.Trim(),
            Subject = subject.Trim(),
            Status = result.Ok ? "sent" : "failed",
            Error = result.Error,
            ProviderId = result.ProviderId,
        });
        return result;
    }

    /// <summary>
    /// Compliance footer on both variants: identity, physical address, working
    /// opt-out. Plain text spells out the URL (no hyperlinks in text/plain); the
    /// HTML variant shows a tidy underlined "unsubscribe" instead. Kept deliberately
    /// plain — these should render like personal email, not a designed newsletter.
    /// </summary>
    private (string Text, string Html, Dictionary<string, string>? Headers) Compose(
        string body, string? unsubscribeUrl)
    {
        var identity = (config["Email:FromName"] ?? "Be Different Packaging") +
                       (config["Email:PhysicalAddress"] is { Length: > 0 } addr ? $" · {addr}" : "");
        const string replyOptOut = "Don't want to hear from me? Just reply \"unsubscribe\" and I'll remove you immediately.";
        var text = body + $"\n\n—\n{identity}\n{replyOptOut}" +
                   (unsubscribeUrl is null ? "" : $"\nOr one click does it: {unsubscribeUrl}");

        static string ToHtml(string s) => System.Net.WebUtility.HtmlEncode(s).Replace("\n", "<br>");
        var html =
            "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222222\">" +
            ToHtml(body) +
            "<br><br><span style=\"color:#777777;font-size:12px\">—<br>" +
            ToHtml(identity) + "<br>" +
            ToHtml(replyOptOut) +
            (unsubscribeUrl is null
                ? ""
                : $" Or <a href=\"{unsubscribeUrl}\" style=\"color:#777777\">unsubscribe</a> in one click.") +
            "</span></div>";

        var headers = unsubscribeUrl is null
            ? null
            : new Dictionary<string, string>
            {
                ["List-Unsubscribe"] = $"<{unsubscribeUrl}>",
                ["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click",
            };
        return (text, html, headers);
    }
}
