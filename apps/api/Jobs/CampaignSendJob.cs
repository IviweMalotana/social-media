using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Jobs;

/// <summary>
/// The campaign send engine, every 15 minutes. Only sends messages a human approved,
/// only when the enrollment's step is due, only inside the campaign market's send
/// window, with jitter between sends so a batch doesn't look machine-gunned. All the
/// EmailService rails (daily cap, suppression list, opt-out, orders@ block) apply on
/// top; a failed send never advances the cadence.
/// </summary>
public class CampaignSendJob(
    AppDbContext db,
    EmailService email,
    IConfiguration config,
    ILogger<CampaignSendJob> logger)
{
    /// <summary>Max sends per run — 15-min runs × small batches spread the day out.</summary>
    private int BatchPerRun => config.GetValue("Email:BatchPerRun", 5);

    private int MaxJitterMs => config.GetValue("Email:SendJitterMs", 15_000);

    public Task RunAsync() => RunAsync(DateTimeOffset.UtcNow);

    public async Task RunAsync(DateTimeOffset now)
    {
        if (!email.IsConfigured) return;

        var campaigns = await db.Campaigns
            .Where(c => c.Status == CampaignStatus.Active)
            .Include(c => c.Steps)
            .ToListAsync();

        var sentThisRun = 0;
        foreach (var campaign in campaigns)
        {
            if (sentThisRun >= BatchPerRun) break;
            if (!SendWindows.IsOpen(campaign.Country, now)) continue;

            var steps = campaign.Steps.OrderBy(s => s.StepNumber).ToList();
            if (steps.Count == 0) continue;

            var due = await (
                from message in db.CampaignMessages
                join enrollment in db.Enrollments on message.EnrollmentId equals enrollment.Id
                where message.CampaignId == campaign.Id
                      && message.Status == MessageStatus.Approved
                      && enrollment.Status == EnrollmentStatus.Active
                      && enrollment.NextSendAt != null && enrollment.NextSendAt <= now
                      && message.StepNumber == enrollment.CurrentStep + 1
                orderby enrollment.NextSendAt
                select new { message, enrollment }).Take(BatchPerRun).ToListAsync();

            foreach (var item in due)
            {
                if (sentThisRun >= BatchPerRun) break;

                var prospect = await db.Prospects.FirstOrDefaultAsync(p => p.Id == item.message.ProspectId);
                if (prospect is null)
                {
                    item.message.Status = MessageStatus.Rejected;
                    item.message.Error = "Prospect no longer exists.";
                    item.enrollment.Status = EnrollmentStatus.Stopped;
                    continue;
                }

                // Stop-on-reply: a human conversation beats an automated follow-up.
                if (prospect.HasReplied || prospect.Status is ProspectStatus.Replied
                        or ProspectStatus.Interested or ProspectStatus.SampleSent
                        or ProspectStatus.Won)
                {
                    item.message.Status = MessageStatus.Rejected;
                    item.message.Error = "Prospect replied — sequence stopped.";
                    item.enrollment.Status = EnrollmentStatus.Replied;
                    item.enrollment.NextSendAt = null;
                    continue;
                }
                if (prospect.Status is ProspectStatus.Lost or ProspectStatus.OptedOut)
                {
                    item.message.Status = MessageStatus.Rejected;
                    item.message.Error = $"Prospect is {prospect.Status}.";
                    item.enrollment.Status = prospect.Status == ProspectStatus.OptedOut
                        ? EnrollmentStatus.Suppressed
                        : EnrollmentStatus.Stopped;
                    item.enrollment.NextSendAt = null;
                    continue;
                }

                if (sentThisRun > 0 && MaxJitterMs > 0)
                    await Task.Delay(Random.Shared.Next(MaxJitterMs / 3, MaxJitterMs));

                var (code, _) = await email.SendToProspectAsync(
                    campaign.WorkspaceId, prospect, item.message.Subject, item.message.Body);

                if (code == 200)
                {
                    sentThisRun++;
                    item.message.Status = MessageStatus.Sent;
                    item.message.SentAt = now;
                    item.enrollment.CurrentStep = item.message.StepNumber;
                    if (item.message.StepNumber >= steps.Count)
                    {
                        item.enrollment.Status = EnrollmentStatus.Completed;
                        item.enrollment.NextSendAt = null;
                    }
                    else
                    {
                        var nextStep = steps[item.message.StepNumber]; // 0-indexed = next
                        item.enrollment.NextSendAt = now.AddDays(nextStep.DelayDays);
                    }
                }
                else if (code == 429)
                {
                    // Daily cap — nothing else is going out today; leave everything
                    // Approved and due, tomorrow's runs pick it up.
                    logger.LogInformation("Campaign send: daily cap reached, stopping this run.");
                    await db.SaveChangesAsync();
                    return;
                }
                else if (code == 409)
                {
                    // Suppressed / opted out / sequence complete — this message is dead.
                    item.message.Status = MessageStatus.Rejected;
                    item.message.Error = "Blocked by guardrail (suppressed, opted out, or sequence complete).";
                    item.enrollment.Status = EnrollmentStatus.Suppressed;
                    item.enrollment.NextSendAt = null;
                }
                else
                {
                    // Transient/config failure: keep the enrollment where it is; the
                    // message needs a human to re-approve after the cause is fixed.
                    item.message.Status = MessageStatus.Failed;
                    item.message.Error = $"Send failed (HTTP {code}).";
                    logger.LogWarning("Campaign send failed with {Code} for prospect {ProspectId}.",
                        code, prospect.Id);
                }
            }
        }

        await db.SaveChangesAsync();
        if (sentThisRun > 0)
            logger.LogInformation("Campaign send: {Count} email(s) sent this run.", sentThisRun);
    }
}
