using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Jobs;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Tests;

public class PublishPostJobTests
{
    private static AppDbContext CreateDb() => new(
        new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"publish-{Guid.NewGuid()}")
            .Options);

    private static async Task<(AppDbContext Db, PostTarget Target)> SeedScheduledTargetAsync(AppDbContext db)
    {
        var workspace = new Workspace { Name = "w" };
        var account = new ConnectedAccount
        {
            WorkspaceId = workspace.Id,
            Platform = Platform.Facebook,
            ExternalId = "page-1",
            DisplayName = "Page",
            EncryptedAccessToken = "tok",
        };
        var post = new Post
        {
            WorkspaceId = workspace.Id,
            AuthorId = Guid.NewGuid(),
            Caption = "hello",
            Status = PostStatus.Scheduled,
            ScheduledAt = DateTimeOffset.UtcNow.AddMinutes(-1),
        };
        var target = new PostTarget
        {
            PostId = post.Id,
            ConnectedAccountId = account.Id,
            Platform = Platform.Facebook,
            Status = TargetStatus.Scheduled,
        };
        post.Targets.Add(target);
        db.AddRange(workspace, account, post);
        await db.SaveChangesAsync();
        return (db, target);
    }

    private static PublishPostJob CreateJob(AppDbContext db, ISocialPlatformAdapter adapter) => new(
        db,
        new AdapterRegistry([adapter]),
        new PassthroughVault(),
        NullLogger<PublishPostJob>.Instance);

    [Fact]
    public async Task Successful_publish_marks_target_and_post_published()
    {
        var (db, target) = await SeedScheduledTargetAsync(CreateDb());
        await CreateJob(db, new FakeAdapter(succeed: true)).RunAsync(target.Id);

        var saved = await db.PostTargets.Include(t => t.Attempts).SingleAsync();
        Assert.Equal(TargetStatus.Published, saved.Status);
        Assert.Equal("ext-1", saved.ExternalPostId);
        Assert.Single(saved.Attempts);
        Assert.Equal(PostStatus.Published, (await db.Posts.SingleAsync()).Status);
    }

    [Fact]
    public async Task Publish_is_idempotent_for_already_published_target()
    {
        var (db, target) = await SeedScheduledTargetAsync(CreateDb());
        var adapter = new FakeAdapter(succeed: true);
        var job = CreateJob(db, adapter);

        await job.RunAsync(target.Id);
        await job.RunAsync(target.Id); // Hangfire retry / duplicate enqueue

        Assert.Equal(1, adapter.PublishCalls);
        Assert.Single(await db.PublishAttempts.ToListAsync());
    }

    [Fact]
    public async Task Failed_publish_records_attempt_and_throws_for_retry()
    {
        var (db, target) = await SeedScheduledTargetAsync(CreateDb());

        await Assert.ThrowsAsync<PublishFailedException>(
            () => CreateJob(db, new FakeAdapter(succeed: false)).RunAsync(target.Id));

        var saved = await db.PostTargets.Include(t => t.Attempts).SingleAsync();
        Assert.Equal("boom", saved.ErrorMessage);
        Assert.Single(saved.Attempts);
        Assert.False(saved.Attempts[0].Success);
    }

    private sealed class PassthroughVault : ITokenVault
    {
        public string Encrypt(string plaintext) => plaintext;
        public string Decrypt(string ciphertext) => ciphertext;
    }

    private sealed class FakeAdapter(bool succeed) : PlatformAdapterBase
    {
        public int PublishCalls { get; private set; }
        public override Platform Platform => Platform.Facebook;
        public override string GetAuthorizationUrl(ConnectContext ctx) => "https://example.test";

        public override Task<PublishResult> PublishAsync(
            PostTarget target, PostDraft draft, string accessToken, CancellationToken ct = default)
        {
            PublishCalls++;
            return Task.FromResult(succeed
                ? PublishResult.Ok("ext-1", "https://example.test/ext-1")
                : PublishResult.Fail("boom"));
        }
    }
}
