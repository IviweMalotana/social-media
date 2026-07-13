using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using SocialMedia.Api.Controllers;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Jobs;
using SocialMedia.Api.Services;
using System.Text;

namespace SocialMedia.Api.Tests;

public class CampaignEngineTests
{
    private static AppDbContext CreateDb() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"campaigns-{Guid.NewGuid()}")
            .Options);

    private static IConfiguration Config(params (string Key, string Value)[] extra)
    {
        var values = new Dictionary<string, string?>
        {
            ["Resend:ApiKey"] = "re_test",
            ["Email:FromName"] = "BDP",
            ["Email:FromAddress"] = "ivi@bedifferentpackaging.com",
            ["Email:SendJitterMs"] = "0",
        };
        foreach (var (key, value) in extra) values[key] = value;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    // Monday 2026-07-13 09:00 SAST — inside the ZA window.
    private static readonly DateTimeOffset ZaOpen = new(2026, 7, 13, 7, 0, 0, TimeSpan.Zero);

    private static (Campaign Campaign, Prospect Prospect, Enrollment Enrollment) Seed(
        AppDbContext db, Guid workspaceId)
    {
        var campaign = new Campaign
        {
            WorkspaceId = workspaceId,
            Name = "ZA hotels",
            Segment = "hotel",
            Country = "ZA",
            Status = CampaignStatus.Active,
            Steps =
            [
                new SequenceStep { StepNumber = 1, DelayDays = 0, Subject = "s1", Body = "b1" },
                new SequenceStep { StepNumber = 2, DelayDays = 3, Subject = "s2", Body = "b2" },
            ],
        };
        var prospect = new Prospect
        {
            WorkspaceId = workspaceId,
            CompanyName = "Mountain View Guesthouse",
            ContactName = "Sarah Jones",
            Email = "info@mountainview.co.za",
        };
        var enrollment = new Enrollment
        {
            CampaignId = campaign.Id,
            ProspectId = prospect.Id,
            NextSendAt = ZaOpen.AddMinutes(-5),
        };
        db.Campaigns.Add(campaign);
        db.Prospects.Add(prospect);
        db.Enrollments.Add(enrollment);
        return (campaign, prospect, enrollment);
    }

    // --- Send windows -----------------------------------------------------

    [Theory]
    [InlineData("ZA", "2026-07-13T07:00:00Z", true)]  // Mon 09:00 SAST
    [InlineData("ZA", "2026-07-13T16:00:00Z", false)] // Mon 18:00 SAST — after hours
    [InlineData("ZA", "2026-07-18T09:00:00Z", false)] // Saturday
    [InlineData("US", "2026-07-14T13:30:00Z", true)]  // Tue mid-morning Eastern
    [InlineData("US", "2026-07-13T13:30:00Z", false)] // Monday — playbook says Tue–Thu
    [InlineData("US", "2026-07-14T20:00:00Z", false)] // Tue afternoon — window closed
    [InlineData("UK", "2026-07-14T09:00:00Z", true)]  // Tue morning UK
    public void Send_windows_follow_the_playbook(string country, string instant, bool expected)
    {
        Assert.Equal(expected, SendWindows.IsOpen(country, DateTimeOffset.Parse(instant)));
    }

    // --- Template merge ----------------------------------------------------

    [Fact]
    public void Template_merge_fills_fields_with_sensible_fallbacks()
    {
        var prospect = new Prospect
        {
            WorkspaceId = Guid.NewGuid(),
            CompanyName = "Glow Co",
            ContactName = "Thandi Nkosi",
            City = "Durban",
        };
        Assert.Equal("Hi Thandi, Glow Co in Durban",
            TemplateMerge.Fill("Hi {{firstName}}, {{companyName}} in {{city}}", prospect));

        prospect.ContactName = "";
        prospect.City = "";
        Assert.Equal("Hi there — your area",
            TemplateMerge.Fill("Hi {{firstName}} — {{city}}", prospect));
    }

    // --- Svix signature ----------------------------------------------------

    [Fact]
    public void Svix_signature_roundtrip_verifies_and_tampering_fails()
    {
        var secret = "whsec_" + Convert.ToBase64String(Encoding.UTF8.GetBytes("test-secret-key"));
        var now = DateTimeOffset.UtcNow;
        var timestamp = now.ToUnixTimeSeconds().ToString();
        const string payload = """{"type":"email.bounced"}""";
        var signature = SvixSignature.Sign(secret, "msg_1", timestamp, payload);

        Assert.True(SvixSignature.Verify(secret, "msg_1", timestamp, signature, payload, now));
        Assert.False(SvixSignature.Verify(secret, "msg_1", timestamp, signature, payload + " ", now));
        Assert.False(SvixSignature.Verify(secret, "msg_2", timestamp, signature, payload, now));
        // Replay guard: same message an hour later is refused.
        Assert.False(SvixSignature.Verify(secret, "msg_1", timestamp, signature, payload, now.AddHours(1)));
    }

    // --- Send engine --------------------------------------------------------

    [Fact]
    public async Task Approved_due_message_sends_and_advances_the_enrollment()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var (campaign, prospect, enrollment) = Seed(db, workspaceId);
        db.CampaignMessages.Add(new CampaignMessage
        {
            WorkspaceId = workspaceId,
            CampaignId = campaign.Id,
            EnrollmentId = enrollment.Id,
            ProspectId = prospect.Id,
            StepNumber = 1,
            Subject = "s1",
            Body = "b1",
            Status = MessageStatus.Approved,
        });
        await db.SaveChangesAsync();

        var transport = new EmailServiceTests.FakeTransport();
        var job = new CampaignSendJob(
            db, new EmailService(db, transport, Config()), Config(),
            NullLogger<CampaignSendJob>.Instance);
        await job.RunAsync(ZaOpen);

        Assert.Single(transport.Sent);
        var message = await db.CampaignMessages.SingleAsync();
        Assert.Equal(MessageStatus.Sent, message.Status);
        Assert.Equal(1, enrollment.CurrentStep);
        Assert.Equal(EnrollmentStatus.Active, enrollment.Status);
        Assert.Equal(ZaOpen.AddDays(3), enrollment.NextSendAt); // step 2 delay
        Assert.Equal(1, prospect.EmailsSent);
    }

    [Fact]
    public async Task Nothing_sends_outside_the_window_or_without_approval()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var (campaign, prospect, enrollment) = Seed(db, workspaceId);
        db.CampaignMessages.Add(new CampaignMessage
        {
            WorkspaceId = workspaceId,
            CampaignId = campaign.Id,
            EnrollmentId = enrollment.Id,
            ProspectId = prospect.Id,
            StepNumber = 1,
            Subject = "s1",
            Body = "b1",
            Status = MessageStatus.Drafted, // never approved
        });
        await db.SaveChangesAsync();

        var transport = new EmailServiceTests.FakeTransport();
        var job = new CampaignSendJob(
            db, new EmailService(db, transport, Config()), Config(),
            NullLogger<CampaignSendJob>.Instance);

        await job.RunAsync(ZaOpen);
        Assert.Empty(transport.Sent); // drafted ≠ approved

        db.CampaignMessages.Single().Status = MessageStatus.Approved;
        await db.SaveChangesAsync();
        await job.RunAsync(new DateTimeOffset(2026, 7, 18, 9, 0, 0, TimeSpan.Zero)); // Saturday
        Assert.Empty(transport.Sent); // window closed
    }

    [Fact]
    public async Task Reply_stops_the_sequence_instead_of_sending()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var (campaign, prospect, enrollment) = Seed(db, workspaceId);
        prospect.HasReplied = true;
        db.CampaignMessages.Add(new CampaignMessage
        {
            WorkspaceId = workspaceId,
            CampaignId = campaign.Id,
            EnrollmentId = enrollment.Id,
            ProspectId = prospect.Id,
            StepNumber = 1,
            Subject = "s1",
            Body = "b1",
            Status = MessageStatus.Approved,
        });
        await db.SaveChangesAsync();

        var transport = new EmailServiceTests.FakeTransport();
        var job = new CampaignSendJob(
            db, new EmailService(db, transport, Config()), Config(),
            NullLogger<CampaignSendJob>.Instance);
        await job.RunAsync(ZaOpen);

        Assert.Empty(transport.Sent);
        Assert.Equal(MessageStatus.Rejected, (await db.CampaignMessages.SingleAsync()).Status);
        Assert.Equal(EnrollmentStatus.Replied, enrollment.Status);
    }

    [Fact]
    public async Task Last_step_completes_the_enrollment()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var (campaign, prospect, enrollment) = Seed(db, workspaceId);
        enrollment.CurrentStep = 1; // step 1 already sent
        prospect.EmailsSent = 1;
        db.CampaignMessages.Add(new CampaignMessage
        {
            WorkspaceId = workspaceId,
            CampaignId = campaign.Id,
            EnrollmentId = enrollment.Id,
            ProspectId = prospect.Id,
            StepNumber = 2,
            Subject = "s2",
            Body = "b2",
            Status = MessageStatus.Approved,
        });
        await db.SaveChangesAsync();

        var transport = new EmailServiceTests.FakeTransport();
        var job = new CampaignSendJob(
            db, new EmailService(db, transport, Config()), Config(),
            NullLogger<CampaignSendJob>.Instance);
        await job.RunAsync(ZaOpen);

        Assert.Single(transport.Sent);
        Assert.Equal(EnrollmentStatus.Completed, enrollment.Status);
        Assert.Null(enrollment.NextSendAt);
    }

    // --- Unsubscribe --------------------------------------------------------

    [Fact]
    public async Task Unsubscribe_token_opts_out_suppresses_and_pulls_queued_drafts()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var (campaign, prospect, enrollment) = Seed(db, workspaceId);
        prospect.UnsubscribeToken = "tok123";
        db.CampaignMessages.Add(new CampaignMessage
        {
            WorkspaceId = workspaceId,
            CampaignId = campaign.Id,
            EnrollmentId = enrollment.Id,
            ProspectId = prospect.Id,
            StepNumber = 1,
            Subject = "s1",
            Body = "b1",
            Status = MessageStatus.Approved,
        });
        await db.SaveChangesAsync();

        var controller = new UnsubscribeController(db);
        var result = await controller.Post("tok123");

        Assert.IsType<OkResult>(result);
        Assert.Equal(ProspectStatus.OptedOut, prospect.Status);
        var suppression = await db.SuppressionEntries.SingleAsync();
        Assert.Equal("info@mountainview.co.za", suppression.Email);
        Assert.Equal("unsubscribed", suppression.Reason);
        Assert.Equal(EnrollmentStatus.Suppressed, enrollment.Status);
        Assert.Equal(MessageStatus.Rejected, (await db.CampaignMessages.SingleAsync()).Status);
    }

    // --- Resend webhook ------------------------------------------------------

    private sealed class ProductionEnv : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "test";
        public string WebRootPath { get; set; } = "";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static ResendWebhookController WebhookController(
        AppDbContext db, IConfiguration config, string payload,
        params (string Name, string Value)[] headers)
    {
        var controller = new ResendWebhookController(
            db, config, new ProductionEnv(), NullLogger<ResendWebhookController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
        controller.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(payload));
        foreach (var (name, value) in headers) controller.Request.Headers[name] = value;
        return controller;
    }

    [Fact]
    public async Task Bounce_webhook_marks_log_and_suppresses_the_address()
    {
        var db = CreateDb();
        var workspaceId = Guid.NewGuid();
        var (_, prospect, enrollment) = Seed(db, workspaceId);
        db.EmailLogs.Add(new EmailLog
        {
            WorkspaceId = workspaceId,
            ProspectId = prospect.Id,
            ToAddress = prospect.Email,
            Subject = "s1",
            Status = "sent",
            ProviderId = "re_abc",
        });
        await db.SaveChangesAsync();

        var secret = "whsec_" + Convert.ToBase64String(Encoding.UTF8.GetBytes("hook-secret"));
        var payload = """{"type":"email.bounced","data":{"email_id":"re_abc"}}""";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var controller = WebhookController(
            db, Config(("Resend:WebhookSecret", secret)), payload,
            ("svix-id", "msg_1"), ("svix-timestamp", timestamp),
            ("svix-signature", SvixSignature.Sign(secret, "msg_1", timestamp, payload)));

        var result = await controller.Receive();

        Assert.IsType<OkResult>(result);
        Assert.Equal("bounced", (await db.EmailLogs.SingleAsync()).Status);
        var suppression = await db.SuppressionEntries.SingleAsync();
        Assert.Equal(prospect.Email.ToLowerInvariant(), suppression.Email);
        Assert.Equal("bounced", suppression.Reason);
        Assert.Equal(EnrollmentStatus.Suppressed, enrollment.Status);
    }

    [Fact]
    public async Task Webhook_with_bad_signature_is_rejected()
    {
        var db = CreateDb();
        var secret = "whsec_" + Convert.ToBase64String(Encoding.UTF8.GetBytes("hook-secret"));
        var payload = """{"type":"email.bounced","data":{"email_id":"re_abc"}}""";
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var controller = WebhookController(
            db, Config(("Resend:WebhookSecret", secret)), payload,
            ("svix-id", "msg_1"), ("svix-timestamp", timestamp),
            ("svix-signature", "v1,dGFtcGVyZWQ="));

        Assert.IsType<UnauthorizedResult>(await controller.Receive());
    }

    [Fact]
    public async Task Webhook_without_secret_refuses_outside_development()
    {
        var db = CreateDb();
        var controller = WebhookController(
            db, Config(), """{"type":"email.bounced","data":{"email_id":"x"}}""");
        var result = Assert.IsType<ObjectResult>(await controller.Receive());
        Assert.Equal(503, result.StatusCode);
    }
}
