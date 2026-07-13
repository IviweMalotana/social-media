using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Tests;

public class EmailServiceTests
{
    private sealed class FakeTransport(bool ok = true) : IEmailTransport
    {
        public string Name => "resend";
        public List<(string To, string Subject, string Text)> Sent { get; } = [];

        public Task<EmailSendResult> SendAsync(string from, string to, string subject, string text, CancellationToken ct = default)
        {
            Sent.Add((to, subject, text));
            return Task.FromResult(ok
                ? new EmailSendResult(true, "re_123", null)
                : new EmailSendResult(false, null, "Resend 403: domain not verified"));
        }
    }

    private static AppDbContext CreateDb() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"email-{Guid.NewGuid()}")
            .Options);

    private static IConfiguration Config(int dailyCap = 50) => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Resend:ApiKey"] = "re_test",
            ["Email:FromName"] = "BDP",
            ["Email:FromAddress"] = "ivy@bdpackaging.co",
            ["Email:PhysicalAddress"] = "Cape Town, ZA",
            ["Email:DailyCap"] = dailyCap.ToString(),
        })
        .Build();

    private static Prospect NewProspect(Guid workspaceId) => new()
    {
        WorkspaceId = workspaceId,
        CompanyName = "Mountain View Guesthouse",
        ContactName = "Sarah",
        Email = "info@mountainview.co.za",
        Status = ProspectStatus.New,
    };

    [Fact]
    public async Task Successful_send_appends_footer_logs_and_advances_cadence()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var prospect = NewProspect(workspaceId);
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var transport = new FakeTransport();
        var service = new EmailService(db, transport, Config());

        var (code, _) = await service.SendToProspectAsync(workspaceId, prospect, "hello", "Hi Sarah, quick question.");

        Assert.Equal(200, code);
        Assert.Single(transport.Sent);
        Assert.Contains("unsubscribe", transport.Sent[0].Text); // compliance footer
        Assert.Contains("Cape Town, ZA", transport.Sent[0].Text);
        Assert.Equal(1, prospect.EmailsSent);
        Assert.Equal(ProspectStatus.Contacted, prospect.Status);
        Assert.NotNull(prospect.NextFollowUpAt);
        Assert.Equal("sent", (await db.EmailLogs.SingleAsync()).Status);
    }

    [Fact]
    public async Task Third_email_clears_followup_and_fourth_is_refused()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var prospect = NewProspect(workspaceId);
        prospect.EmailsSent = 2;
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var service = new EmailService(db, new FakeTransport(), Config());

        var (code, _) = await service.SendToProspectAsync(workspaceId, prospect, "last one", "Closing out.");
        Assert.Equal(200, code);
        Assert.Equal(3, prospect.EmailsSent);
        Assert.Null(prospect.NextFollowUpAt); // sequence complete — stop

        var (fourth, _) = await service.SendToProspectAsync(workspaceId, prospect, "again", "One more.");
        Assert.Equal(409, fourth);
    }

    [Fact]
    public async Task Opted_out_prospects_are_suppressed()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var prospect = NewProspect(workspaceId);
        prospect.Status = ProspectStatus.OptedOut;
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var transport = new FakeTransport();
        var service = new EmailService(db, transport, Config());

        var (code, _) = await service.SendToProspectAsync(workspaceId, prospect, "hi", "Hello.");
        Assert.Equal(409, code);
        Assert.Empty(transport.Sent);
    }

    [Fact]
    public async Task Daily_cap_blocks_sends()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        db.EmailLogs.Add(new EmailLog { WorkspaceId = workspaceId, ToAddress = "a@b.c", Subject = "x", Status = "sent" });
        var prospect = NewProspect(workspaceId);
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var service = new EmailService(db, new FakeTransport(), Config(dailyCap: 1));

        var (code, _) = await service.SendToProspectAsync(workspaceId, prospect, "hi", "Hello.");
        Assert.Equal(429, code);
    }

    [Fact]
    public async Task Unfilled_placeholder_is_rejected()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var prospect = NewProspect(workspaceId);
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var service = new EmailService(db, new FakeTransport(), Config());

        var (code, _) = await service.SendToProspectAsync(
            workspaceId, prospect, "hi", "Hi Sarah, [one genuine specific line].");
        Assert.Equal(400, code);
    }

    [Fact]
    public async Task Transport_failure_returns_502_and_logs_failed()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var prospect = NewProspect(workspaceId);
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var service = new EmailService(db, new FakeTransport(ok: false), Config());

        var (code, _) = await service.SendToProspectAsync(workspaceId, prospect, "hi", "Hello.");
        Assert.Equal(502, code);
        Assert.Equal(0, prospect.EmailsSent); // cadence NOT advanced on failure
        var log = await db.EmailLogs.SingleAsync();
        Assert.Equal("failed", log.Status);
        Assert.Contains("domain not verified", log.Error);
    }
}
