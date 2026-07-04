using Microsoft.Extensions.Configuration;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Tests;

public class DraftValidationTests
{
    private static readonly IConfiguration EmptyConfig = new ConfigurationBuilder().Build();

    private static MediaAsset Image() => new()
    {
        WorkspaceId = Guid.NewGuid(),
        FileName = "product.jpg",
        ContentType = "image/jpeg",
        StorageKey = "abc.jpg",
        SizeBytes = 1024,
    };

    private static PostDraft Draft(string caption = "hello", int mediaCount = 1, DateTimeOffset? at = null) =>
        new(caption, Enumerable.Range(0, mediaCount).Select(_ => Image()).ToList(), at);

    private static InstagramAdapter Instagram => new(EmptyConfig, null!);
    private static FacebookAdapter Facebook => new(EmptyConfig, null!);
    private static TikTokAdapter TikTok => new(EmptyConfig, null!);

    [Fact]
    public void Instagram_requires_media()
    {
        var result = Instagram.ValidateDraft(Draft(mediaCount: 0));
        Assert.False(result.IsValid);
        Assert.Contains(result.Issues, i => i.Code == "media_required" && i.IsBlocking);
    }

    [Fact]
    public void Facebook_allows_text_only()
    {
        Assert.True(Facebook.ValidateDraft(Draft(mediaCount: 0)).IsValid);
    }

    [Fact]
    public void Caption_over_platform_limit_blocks()
    {
        var longCaption = new string('x', 2_201); // IG/TikTok limit is 2,200
        Assert.Contains(TikTok.ValidateDraft(Draft(longCaption)).Issues,
            i => i.Code == "caption_too_long" && i.IsBlocking);
        Assert.True(Facebook.ValidateDraft(Draft(longCaption)).IsValid); // FB allows 63k
    }

    [Fact]
    public void Schedule_in_the_past_blocks()
    {
        var result = Instagram.ValidateDraft(Draft(at: DateTimeOffset.UtcNow.AddMinutes(-5)));
        Assert.Contains(result.Issues, i => i.Code == "schedule_in_past" && i.IsBlocking);
    }

    [Fact]
    public void Too_many_media_items_blocks()
    {
        var result = Instagram.ValidateDraft(Draft(mediaCount: 11)); // IG carousel max 10
        Assert.Contains(result.Issues, i => i.Code == "too_many_media" && i.IsBlocking);
    }
}
